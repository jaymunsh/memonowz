import { beforeEach, describe, expect, it } from 'vitest'
import { clearSession, clearWrong, commitAnswer, createCard, createDeck, db, deleteCard, deleteDeck, getCard, getSession, listAnswerHistory, summarizeAnswerHistory } from './index'
import type { ActiveSession } from '../types'

beforeEach(async () => { await db.delete(); await db.open() })

const setup = async () => {
  const deck = await createDeck({ name: '기록', flipOnly: false })
  const cards = await Promise.all(['첫째', '둘째'].map((front) => createCard(deck.id, {
    type: 'term', front, back: '정답', tags: [], starred: false,
  })))
  const session: ActiveSession = { deckId: deck.id, cardIds: cards.map((card) => card.id), cursor: 0, results: [], startedAt: 1 }
  return { deck, cards, session }
}

describe('영구 답변 기록', () => {
  it('자정 양쪽 답을 로컬 날짜로 나누고 세션별이 아닌 실제 답 수로 합산한다', () => {
    const base = { id: 'e', sessionId: 's', deckId: 'd', cardId: 'c', cursor: 0, correct: false }
    const summary = summarizeAnswerHistory([
      { ...base, answeredAt: new Date(2026, 9, 1, 23, 59).getTime() },
      { ...base, id: 'e2', cursor: 1, correct: true, answeredAt: new Date(2026, 9, 2, 0, 1).getTime() },
      { ...base, id: 'e3', sessionId: 's2', answeredAt: new Date(2026, 9, 2, 12).getTime() },
    ])
    expect(summary).toMatchObject({ total: 3, right: 1, days: [
      { date: '2026-10-02', total: 2, right: 1 }, { date: '2026-10-01', total: 1, right: 0 },
    ], wrongCards: [{ cardId: 'c', total: 3, wrong: 2 }] })
  })
  it('중간 채점도 저장하고 세션을 지워도 남기며 같은 답 재시도는 한 번만 기록한다', async () => {
    const { deck, cards, session } = await setup()
    await Promise.all([commitAnswer(session, cards[0].id, false), commitAnswer(session, cards[0].id, false)])
    const events = await listAnswerHistory(deck.id)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ deckId: deck.id, cardId: cards[0].id, cursor: 0, correct: false })
    expect(events[0].answeredAt).toBeGreaterThan(0)
    expect((await getCard(cards[0].id))?.stats.lastSeenAt).toBe(events[0].answeredAt)
    await clearSession(deck.id)
    expect(await listAnswerHistory()).toEqual(events)
    await expect(commitAnswer(session, cards[0].id, false)).rejects.toThrow()
    expect(await listAnswerHistory()).toEqual(events)
    expect((await getCard(cards[0].id))?.stats.wrong).toBe(1)
  })

  it('이미 푼 카드를 삭제해도 기록은 남고 다음 답 위치는 재사용하지 않는다', async () => {
    const { deck, cards, session } = await setup()
    await commitAnswer(session, cards[0].id, false)
    await deleteCard(cards[0].id)
    const reconciled = (await getSession(deck.id))!
    await commitAnswer(reconciled, cards[1].id, true)
    expect((await listAnswerHistory(deck.id)).map((event) => event.cursor).sort()).toEqual([0, 1])
    expect(await db.answerEvents.count()).toBe(2)
    await deleteDeck(deck.id)
    expect(await listAnswerHistory()).toEqual([])
  })

  it('외웠어요로 현재 오답 통계를 지워도 과거 답은 그대로 남는다', async () => {
    const { deck, cards, session } = await setup()
    await commitAnswer(session, cards[0].id, false)
    const before = await listAnswerHistory(deck.id)
    await clearWrong(cards[0].id)
    expect((await getCard(cards[0].id))?.stats.wrong).toBe(0)
    expect(await listAnswerHistory(deck.id)).toEqual(before)
  })

  it('서로 다른 ID로도 같은 세션 위치의 기록을 두 번 만들 수 없다', async () => {
    const { cards, session } = await setup()
    await commitAnswer(session, cards[0].id, false)
    const event = (await listAnswerHistory())[0]
    await expect(db.answerEvents.add({ ...event, id: 'different-id' })).rejects.toThrow()
    expect(await listAnswerHistory()).toHaveLength(1)
  })

  it('덱 기록 삭제가 실패하면 덱·카드·세션 삭제도 되돌린다', async () => {
    const { deck, cards, session } = await setup()
    await commitAnswer(session, cards[0].id, true)
    const fail = () => { throw new Error('history delete failed') }
    db.answerEvents.hook('deleting', fail)
    try {
      await expect(deleteDeck(deck.id)).rejects.toThrow('history delete failed')
      expect(await db.decks.get(deck.id)).toBeDefined()
      expect(await getCard(cards[0].id)).toBeDefined()
      expect(await getSession(deck.id)).toBeDefined()
      expect(await listAnswerHistory()).toHaveLength(1)
    } finally { db.answerEvents.hook('deleting').unsubscribe(fail) }
  })

  it('기록 쓰기 실패시 카드 통계와 진행도도 되돌린다', async () => {
    const { deck, cards, session } = await setup()
    const fail = () => { throw new Error('history write failed') }
    db.answerEvents.hook('creating', fail)
    try {
      await expect(commitAnswer(session, cards[0].id, true)).rejects.toThrow('history write failed')
      expect((await getCard(cards[0].id))?.stats.right).toBe(0)
      expect(await getSession(deck.id)).toBeUndefined()
      expect(await listAnswerHistory()).toEqual([])
    } finally { db.answerEvents.hook('creating').unsubscribe(fail) }
  })

  it('세션 쓰기 실패시 기록도 되돌린다', async () => {
    const { cards, session } = await setup()
    const fail = () => { throw new Error('session write failed') }
    db.sessions.hook('creating', fail)
    try {
      await expect(commitAnswer(session, cards[0].id, true)).rejects.toThrow('session write failed')
      expect(await listAnswerHistory()).toEqual([])
    } finally { db.sessions.hook('creating').unsubscribe(fail) }
  })
})
