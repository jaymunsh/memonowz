import { beforeEach, describe, expect, it } from 'vitest'
import { commitAnswer, createCard, createDeck, db, deleteCard, exportAll, getSession, listAnswerHistory, restoreAll } from './index'
import { fullBackupSchema, type FullBackup } from '../types'

beforeEach(async () => { await db.delete(); await db.open() })

const snapshot = (): FullBackup => ({
  version: 1, exportedAt: 100,
  decks: [{ id: 'd', name: '덱', createdAt: 1, flipOnly: false }],
  cards: [{ id: 'c', deckId: 'd', type: 'term', front: '문제', back: '답', tags: [], starred: false,
    stats: { right: 0, wrong: 1, lastSeenAt: 20 } }],
  sessions: [{ deckId: 'd', sessionId: 's', cardIds: ['c'], cursor: 1, results: [{ cardId: 'c', correct: false }], startedAt: 10 }],
  history: [{ id: 'e', sessionId: 's', deckId: 'd', cardId: 'c', cursor: 0, correct: false, answeredAt: 20 }],
})

describe('학습 기록 전체 백업', () => {
  it('옛 백업은 빈 기록으로 복원하고 과거 통계에서 날짜를 만들지 않는다', async () => {
    const input = snapshot(); delete input.history
    await restoreAll(input)
    expect(await listAnswerHistory()).toEqual([])
  })

  it('덱·카드·세션·기록 ID를 함께 바꿔 여러 번 복원해도 충돌하지 않는다', async () => {
    await restoreAll(snapshot()); await restoreAll(snapshot())
    const exported = await exportAll()
    expect(exported.history).toHaveLength(2)
    expect(new Set(exported.history!.map((event) => event.sessionId)).size).toBe(2)
    for (const event of exported.history!) {
      const session = exported.sessions.find((item) => item.deckId === event.deckId)!
      expect(event.sessionId).toBe(session.sessionId)
      expect(event.cardId).toBe(session.cardIds[0])
      expect(event.answeredAt).toBe(20)
      expect(event.id).not.toBe('e')
      expect(event.cardId).not.toBe('c')
    }
    expect(fullBackupSchema.safeParse(exported).success).toBe(true)
  })

  it('삭제된 카드 기록도 새 ID로 보존하고 살아 있는 다른 덱 카드는 참조하지 않는다', async () => {
    const deck = await createDeck({ name: '덱', flipOnly: false })
    const card = await createCard(deck.id, { type: 'term', front: '문제', back: '답', tags: [], starred: false })
    await commitAnswer({ deckId: deck.id, cardIds: [card.id], cursor: 0, results: [], startedAt: 1 }, card.id, false)
    await deleteCard(card.id)
    const exported = await exportAll()
    expect(exported.history).toHaveLength(1)
    await restoreAll(exported)
    const events = await listAnswerHistory()
    expect(events).toHaveLength(2)
    expect(events[0].cardId).not.toBe(events[1].cardId)
    expect(fullBackupSchema.safeParse(await exportAll()).success).toBe(true)
  })

  it.each(['deck', 'card', 'id', 'position'] as const)('잘못된 %s 참조와 중복을 쓰기 전에 거절한다', async (kind) => {
    const input = snapshot(); const event = input.history![0]
    if (kind === 'deck') event.deckId = 'missing'
    if (kind === 'card') {
      input.decks.push({ id: 'other', name: '다른 덱', createdAt: 1, flipOnly: false })
      input.cards[0].deckId = 'other'; input.sessions = []
    }
    if (kind === 'id') input.history!.push({ ...event, cursor: 1 })
    if (kind === 'position') input.history!.push({ ...event, id: 'other' })
    await expect(restoreAll(input)).rejects.toThrow()
    expect(await db.decks.count()).toBe(0)
  })

  it('기록 쓰기 실패시 전체 복원의 덱·카드·세션도 되돌린다', async () => {
    const fail = () => { throw new Error('history restore failed') }
    db.answerEvents.hook('creating', fail)
    try {
      await expect(restoreAll(snapshot())).rejects.toThrow('history restore failed')
      expect(await db.decks.count()).toBe(0)
      expect(await db.cards.count()).toBe(0)
      expect(await db.sessions.count()).toBe(0)
      expect(await listAnswerHistory()).toEqual([])
    } finally { db.answerEvents.hook('creating').unsubscribe(fail) }
  })

  it('복원된 부분 세션을 이어 채점하고 재시도해도 과거 기록은 중복되지 않는다', async () => {
    const input = snapshot()
    input.cards.push({ ...input.cards[0], id: 'second', stats: { right: 0, wrong: 0, lastSeenAt: null } })
    input.sessions[0].cardIds.push('second')
    await restoreAll(input)
    const exported = await exportAll(); const session = (await getSession(exported.decks[0].id))!
    await commitAnswer(session, session.cardIds[1], true)
    await commitAnswer(session, session.cardIds[1], true)
    expect(await listAnswerHistory()).toHaveLength(2)
  })

  it('ID 없는 이전 부분 세션의 기록 식별자도 복원된 세션과 함께 옮긴다', async () => {
    const input = snapshot()
    delete input.sessions[0].sessionId
    input.history![0].sessionId = JSON.stringify(['d', 10])
    await restoreAll(input)
    const exported = await exportAll()
    expect(exported.sessions[0].sessionId).toBe(exported.history![0].sessionId)
  })

  it('날짜로 표시할 수 없는 타임스탬프와 중복 세션 ID를 거절한다', () => {
    const input = snapshot()
    input.history![0].answeredAt = Number.MAX_VALUE
    expect(fullBackupSchema.safeParse(input).success).toBe(false)
    const duplicate = snapshot()
    duplicate.decks.push({ ...duplicate.decks[0], id: 'other' })
    duplicate.sessions.push({ ...duplicate.sessions[0], deckId: 'other', cardIds: [], cursor: 0, results: [] })
    expect(fullBackupSchema.safeParse(duplicate).success).toBe(false)
  })

  it('이전 세션의 유효 ID와 다른 덱의 명시적 ID 충돌을 쓰기 전에 거절한다', async () => {
    const input = snapshot()
    delete input.sessions[0].sessionId
    const legacyId = JSON.stringify(['d', 10])
    input.decks.push({ ...input.decks[0], id: 'other' })
    input.cards.push({ ...input.cards[0], id: 'other-card', deckId: 'other' })
    input.sessions.push({ deckId: 'other', sessionId: legacyId, startedAt: 12,
      cardIds: ['other-card'], cursor: 1, results: [{ cardId: 'other-card', correct: false }] })
    input.history![0] = { ...input.history![0], sessionId: legacyId, deckId: 'other', cardId: 'other-card' }
    expect(fullBackupSchema.safeParse(input).success).toBe(false)
    await expect(restoreAll(input)).rejects.toThrow()
    expect(await db.decks.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
    expect(await db.sessions.count()).toBe(0)
    expect(await db.answerEvents.count()).toBe(0)
  })

  it('명시적 ID가 없는 활성 세션의 ID도 다른 덱 기록에 연결할 수 없다', async () => {
    const input = snapshot()
    delete input.sessions[0].sessionId
    input.decks.push({ ...input.decks[0], id: 'other' })
    input.cards.push({ ...input.cards[0], id: 'other-card', deckId: 'other' })
    input.history![0] = { ...input.history![0], sessionId: JSON.stringify(['d', 10]), deckId: 'other', cardId: 'other-card' }
    await expect(restoreAll(input)).rejects.toThrow()
    expect(await db.decks.count()).toBe(0)
  })

  it.each([false, true])('다음 채점 위치가 이미 기록된 활성 세션은 복원 전에 거절한다 (삭제 압축: %s)', async (compressed) => {
    const input = snapshot()
    input.sessions[0] = { ...input.sessions[0], cursor: 0, results: [], ...(compressed ? { answerCount: 1 } : {}) }
    if (compressed) input.history![0].cursor = 1
    await expect(restoreAll(input)).rejects.toThrow()
    expect(await db.decks.count()).toBe(0)
  })

  it('삭제로 결과가 압축된 부분 세션과 이전 답 기록은 함께 복원할 수 있다', async () => {
    const input = snapshot()
    input.cards[0].id = 'next-card'
    input.sessions[0] = { ...input.sessions[0], cardIds: ['next-card'], cursor: 0, results: [], answerCount: 1 }
    await restoreAll(input)
    const exported = await exportAll()
    const session = exported.sessions[0]
    expect(session.answerCount).toBe(1)
    expect(exported.history![0].cursor).toBe(0)
    await commitAnswer(session, session.cardIds[0], true)
    expect((await listAnswerHistory()).map((event) => event.cursor).sort()).toEqual([0, 1])
    expect(fullBackupSchema.safeParse(await exportAll()).success).toBe(true)
  })

  it('같은 세션의 결과와 기록이 서로 다른 답을 가리키면 복원 전에 거절한다', async () => {
    const input = snapshot()
    input.history![0].correct = true
    await expect(restoreAll(input)).rejects.toThrow()
    expect(await db.decks.count()).toBe(0)
  })
})
