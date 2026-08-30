import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearWrong, createCard, createCards, createDeck, db, deleteDeck, exportDeck,
  getSession, importBackup, listCards, listDeckSummaries,
  listSessions, recordAnswer, saveSession,
} from './index'
import type { ActiveSession } from '../types'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('덱', () => {
  it('만들고 요약으로 읽는다', async () => {
    const deck = await createDeck({ name: '1과목' })
    await createCard(deck.id, { type: 'term', front: 'a', back: 'b', tags: [] })
    const [summary] = await listDeckSummaries()
    expect(summary.name).toBe('1과목')
    expect(summary.cardCount).toBe(1)
    expect(summary.accuracy).toBeNull()
  })

  it('덱을 지우면 카드와 진행 중 세션도 사라진다', async () => {
    const deck = await createDeck({ name: '버릴 덱' })
    const card = await createCard(deck.id, { type: 'term', front: 'a', back: 'b', tags: [] })
    const session: ActiveSession = {
      deckId: deck.id, cardIds: [card.id], cursor: 0, results: [], startedAt: Date.now(),
    }
    await saveSession(session)

    await deleteDeck(deck.id)

    expect(await listCards(deck.id)).toEqual([])
    expect(await getSession(deck.id)).toBeUndefined()
  })
})

describe('채점 누적', () => {
  it('정답률은 right/(right+wrong)으로 나온다', async () => {
    const deck = await createDeck({ name: 'd' })
    const card = await createCard(deck.id, { type: 'term', front: 'a', back: 'b', tags: [] })
    await recordAnswer(card.id, true)
    await recordAnswer(card.id, true)
    await recordAnswer(card.id, false)
    const [summary] = await listDeckSummaries()
    expect(summary.accuracy).toBeCloseTo(2 / 3)
    const [saved] = await listCards(deck.id)
    expect(saved.stats).toMatchObject({ right: 2, wrong: 1 })
    expect(saved.stats.lastSeenAt).not.toBeNull()
  })
})

describe('세션', () => {
  it('덱마다 따로 유지된다', async () => {
    const base = { cardIds: [], cursor: 0, results: [], startedAt: 1 }
    await saveSession({ ...base, deckId: 'A' })
    await saveSession({ ...base, deckId: 'B', cursor: 3 })
    expect((await getSession('A'))?.cursor).toBe(0)
    expect((await getSession('B'))?.cursor).toBe(3)
    expect(await db.sessions.count()).toBe(2)
    expect((await listSessions()).map((s) => s.deckId).sort()).toEqual(['A', 'B'])
  })

  it('같은 덱은 나중 것이 앞의 것을 덮어쓴다', async () => {
    const base = { deckId: 'A', cardIds: [], results: [], startedAt: 1 }
    await saveSession({ ...base, cursor: 1 })
    await saveSession({ ...base, cursor: 2 })
    expect((await getSession('A'))?.cursor).toBe(2)
    expect(await db.sessions.count()).toBe(1)
  })
})

describe('백업', () => {
  it('내보낸 것을 다시 가져오면 새 덱으로 붙는다', async () => {
    const deck = await createDeck({ name: '원본', description: '설명' })
    await createCards(deck.id, [
      { type: 'term', front: 'a', back: 'b', tags: [] },
      { type: 'mcq', question: 'Q', choices: ['x', 'y'], answer: 1, tags: [] },
    ])
    const backup = await exportDeck(deck.id)
    expect(backup.cards).toHaveLength(2)

    const imported = await importBackup(backup)
    expect(imported.id).not.toBe(deck.id)
    expect(await listCards(imported.id)).toHaveLength(2)
    expect(await listDeckSummaries()).toHaveLength(2)
  })

  it('내보낸 카드에는 id·deckId·stats가 없다', async () => {
    const deck = await createDeck({ name: 'd' })
    await createCard(deck.id, { type: 'term', front: 'a', back: 'b', tags: [] })
    const backup = await exportDeck(deck.id)
    expect(backup.cards[0]).not.toHaveProperty('id')
    expect(backup.cards[0]).not.toHaveProperty('deckId')
    expect(backup.cards[0]).not.toHaveProperty('stats')
  })
})

describe('외웠어요', () => {
  it('틀림 기록만 지우고 맞힌 횟수는 남긴다', async () => {
    const deck = await createDeck({ name: 'd' })
    const card = await createCard(deck.id, { type: 'term', front: 'a', back: 'b', tags: [] })
    await recordAnswer(card.id, false)
    await recordAnswer(card.id, true)

    await clearWrong(card.id)

    const [saved] = await listCards(deck.id)
    expect(saved.stats).toMatchObject({ right: 1, wrong: 0 })
  })
})
