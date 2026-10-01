import { db } from './db'
import { activeSessionSchema, answerEventId, legacySessionId, type ActiveSession } from '../types'

const strip = ({ key: _key, ...session }: { key: string } & ActiveSession): ActiveSession => session

/** 덱 하나의 진행 중 세션 */
export const getSession = async (deckId: string): Promise<ActiveSession | undefined> => {
  const stored = await db.sessions.get(deckId)
  return stored ? strip(stored) : undefined
}

/** 진행 중인 세션 전부. 홈에서 덱마다 이어하기를 보여줄 때 쓴다 */
export const listSessions = async (): Promise<ActiveSession[]> =>
  (await db.sessions.toArray()).map(strip)

export const saveSession = async (session: ActiveSession) => {
  await db.sessions.put({ ...session, key: session.deckId })
}

export const clearSession = (deckId: string) => db.sessions.delete(deckId)

/** 채점과 진행도는 함께 커밋한다. 재시도는 이미 적용한 답을 다시 세지 않는다. */
export const commitAnswer = async (
  input: ActiveSession, cardId: string, correct: boolean,
): Promise<ActiveSession> => {
  const session = activeSessionSchema.parse(input)
  if (session.cardIds[session.cursor] !== cardId) {
    throw new Error('현재 출제된 카드가 아닙니다')
  }
  return db.transaction('rw', db.decks, db.cards, db.sessions, db.answerEvents, async () => {
    const [deck, card, stored] = await Promise.all([
      db.decks.get(session.deckId), db.cards.get(cardId), db.sessions.get(session.deckId),
    ])
    if (!deck || !card || card.deckId !== session.deckId) {
      throw new Error('덱 또는 카드를 찾을 수 없습니다')
    }
    if (stored) {
      const persisted = activeSessionSchema.parse(strip(stored))
      const sameSession = persisted.startedAt === session.startedAt
        && persisted.sessionId === session.sessionId
        && persisted.timed === session.timed && persisted.label === session.label
        && persisted.cardIds.length === session.cardIds.length
        && persisted.cardIds.every((id, index) => id === session.cardIds[index])
      const sameHistory = session.results.every((result, index) =>
        persisted.results[index]?.cardId === result.cardId
        && persisted.results[index]?.correct === result.correct)
      if (!sameSession || !sameHistory || persisted.cursor < session.cursor) {
        throw new Error('세션이 변경되었습니다. 최신 진행도를 다시 확인해 주세요')
      }
      if (persisted.cursor > session.cursor) {
        const applied = persisted.results[session.cursor]
        if (applied?.cardId === cardId && applied.correct === correct) return persisted
        throw new Error('이미 다른 답으로 채점된 카드입니다')
      }
      if (persisted.answerCount !== session.answerCount) {
        throw new Error('세션이 변경되었습니다. 최신 진행도를 다시 확인해 주세요')
      }
    } else if (session.cursor !== 0) {
      throw new Error('저장된 세션을 찾을 수 없습니다')
    }
    const sessionId = session.sessionId ?? legacySessionId(session.deckId, session.startedAt)
    const answerCursor = session.answerCount ?? session.cursor
    const id = answerEventId(sessionId, answerCursor)
    if (await db.answerEvents.get(id)) {
      throw new Error('이미 기록된 답입니다. 최신 세션을 다시 확인해 주세요')
    }
    const answeredAt = Date.now()
    await db.cards.update(cardId, {
      stats: {
        right: card.stats.right + (correct ? 1 : 0),
        wrong: card.stats.wrong + (correct ? 0 : 1),
        lastSeenAt: answeredAt,
      },
    })
    const next: ActiveSession = {
      ...session, cursor: session.cursor + 1,
      results: [...session.results, { cardId, correct }],
      ...(session.answerCount !== undefined ? { answerCount: answerCursor + 1 } : {}),
    }
    await db.answerEvents.add({ id, sessionId, cursor: answerCursor, deckId: session.deckId, cardId, correct, answeredAt })
    await db.sessions.put({ ...next, key: next.deckId })
    return next
  })
}

/** 삭제된 카드만 제거하고 이미 푼 살아 있는 카드의 진행도는 유지한다. */
export const reconcileSessionCards = (session: ActiveSession, existingIds: ReadonlySet<string>): ActiveSession => ({
  ...session,
  cardIds: session.cardIds.filter((id) => existingIds.has(id)),
  cursor: session.cardIds.slice(0, session.cursor).filter((id) => existingIds.has(id)).length,
  results: session.results.filter((result) => existingIds.has(result.cardId)),
  ...(session.answerCount !== undefined || session.cardIds.slice(0, session.cursor).some((id) => !existingIds.has(id))
    ? { answerCount: session.answerCount ?? session.cursor } : {}),
})
