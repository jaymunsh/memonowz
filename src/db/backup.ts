import { nanoid } from 'nanoid'
import { db } from './db'
import { createDeck } from './decks'
import { createCards, listCards } from './cards'
import { listSessions, reconcileSessionCards } from './session'
import { answerEventId, legacySessionId, backupSchema, fullBackupSchema, type Backup, type Card, type CardInput, type Deck, type FullBackup } from '../types'

/** 교환용 파일은 학습 기록과 저장 ID를 포함하지 않는다. */
const toInput = (card: Card): CardInput => {
  const { id: _id, deckId: _deckId, stats: _stats, ...input } = card
  return input as CardInput
}

export const exportDeck = async (deckId: string): Promise<Backup> => {
  const deck = await db.decks.get(deckId)
  if (!deck) throw new Error('덱을 찾을 수 없습니다')
  const cards = await listCards(deckId)
  return backupSchema.parse({
    deck: { name: deck.name, description: deck.description, flipOnly: deck.flipOnly },
    cards: cards.map(toInput),
  })
}

export const exportAll = async (): Promise<FullBackup> =>
  db.transaction('r', db.decks, db.cards, db.sessions, db.answerEvents, async () => {
    const [decks, cards, sessions, history] = await Promise.all([
      db.decks.toArray(), db.cards.toArray(), listSessions(), db.answerEvents.toArray(),
    ])
    const deckIds = new Set(decks.map((deck) => deck.id))
    const cardsByDeck = new Map<string, Set<string>>()
    for (const card of cards) {
      if (!cardsByDeck.has(card.deckId)) cardsByDeck.set(card.deckId, new Set())
      cardsByDeck.get(card.deckId)!.add(card.id)
    }
    const validSessions = sessions.filter((session) => deckIds.has(session.deckId))
      .flatMap((session) => {
        const next = reconcileSessionCards(session, cardsByDeck.get(session.deckId) ?? new Set())
        return next.cardIds.length > 0 || session.cardIds.length === 0 ? [next] : []
      })
    return fullBackupSchema.parse({ version: 1, exportedAt: Date.now(), decks, cards, sessions: validSessions,
      history: history.filter((event) => deckIds.has(event.deckId)) })
  })

/** 가져오기는 항상 새 덱으로 붙인다. 기존 덱을 지우거나 덮어쓰지 않는다. */
export const importBackup = async (input: Backup): Promise<Deck> => {
  const backup = backupSchema.parse(input)
  return db.transaction('rw', db.decks, db.cards, async () => {
    const deck = await createDeck(backup.deck)
    if (backup.cards.length > 0) await createCards(deck.id, backup.cards)
    return deck
  })
}

/** 이전 전체 교환 파일도 덱 모두를 한 번에 가져오거나 전부 되돌린다. */
export const importBackups = async (inputs: Backup[]): Promise<Deck[]> => {
  const backups = backupSchema.array().parse(inputs)
  return db.transaction('rw', db.decks, db.cards, async () => {
    const decks: Deck[] = []
    for (const backup of backups) decks.push(await importBackup(backup))
    return decks
  })
}

/** 전체 백업을 새 ID로 붙인다. 통계·시각·세션 설정은 원본 그대로 보존한다. */
export const restoreAll = async (input: FullBackup): Promise<number> => {
  const backup = fullBackupSchema.parse(input)
  const deckIds = new Map(backup.decks.map((deck) => [deck.id, nanoid()]))
  const cardIds = new Map(backup.cards.map((card) => [card.id, nanoid()]))
  const sessionIds = new Map<string, string>()
  const historySessions = new Set(backup.history?.map((event) => event.sessionId))
  for (const event of backup.history ?? []) {
    if (!cardIds.has(event.cardId)) cardIds.set(event.cardId, nanoid())
    if (!sessionIds.has(event.sessionId)) sessionIds.set(event.sessionId, nanoid())
  }
  for (const session of backup.sessions) {
    const id = session.sessionId ?? legacySessionId(session.deckId, session.startedAt)
    if (!sessionIds.has(id)) sessionIds.set(id, nanoid())
  }
  return db.transaction('rw', db.decks, db.cards, db.sessions, db.answerEvents, async () => {
    await db.decks.bulkAdd(backup.decks.map((deck) => ({ ...deck, id: deckIds.get(deck.id)! })))
    await db.cards.bulkAdd(backup.cards.map((card) => ({
      ...card, id: cardIds.get(card.id)!, deckId: deckIds.get(card.deckId)!,
    })))
    await db.sessions.bulkAdd(backup.sessions.map((session) => ({
      ...session,
      key: deckIds.get(session.deckId)!,
      deckId: deckIds.get(session.deckId)!,
      ...(session.sessionId || historySessions.has(legacySessionId(session.deckId, session.startedAt))
        ? { sessionId: sessionIds.get(session.sessionId ?? legacySessionId(session.deckId, session.startedAt))! } : {}),
      cardIds: session.cardIds.map((id) => cardIds.get(id)!),
      results: session.results.map((result) => ({ ...result, cardId: cardIds.get(result.cardId)! })),
    })))
    await db.answerEvents.bulkAdd((backup.history ?? []).map((event) => {
      const sessionId = sessionIds.get(event.sessionId)!
      return { ...event, sessionId, id: answerEventId(sessionId, event.cursor),
        deckId: deckIds.get(event.deckId)!, cardId: cardIds.get(event.cardId)! }
    }))
    return backup.decks.length
  })
}
