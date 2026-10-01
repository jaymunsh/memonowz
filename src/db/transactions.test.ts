import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearWrong, commitAnswer, createCard, createDeck, db, deleteDeck,
  deleteCard, getCard, getSession, recordAnswer, saveSession, toggleStar, updateCard,
} from './index'
import type { ActiveSession } from '../types'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const setup = async () => {
  const deck = await createDeck({ name: 'd', flipOnly: false })
  const card = await createCard(deck.id, { type: 'term', front: 'a', back: 'b', tags: [], starred: false })
  const second = await createCard(deck.id, { type: 'term', front: 'c', back: 'd', tags: [], starred: false })
  const session: ActiveSession = { deckId: deck.id, cardIds: [card.id, second.id], cursor: 0, results: [], startedAt: 1 }
  return { deck, card, second, session }
}

describe('저장소 원자성', () => {
  it('동시 채점에서 누적 횟수를 잃지 않는다', async () => {
    const { card } = await setup()
    await Promise.all([recordAnswer(card.id, true), recordAnswer(card.id, true), recordAnswer(card.id, false)])
    expect((await getCard(card.id))?.stats).toMatchObject({ right: 2, wrong: 1 })
  })

  it('동시에 두 번 별표를 누르면 원래 상태로 돌아온다', async () => {
    const { card } = await setup()
    await Promise.all([toggleStar(card.id), toggleStar(card.id)])
    expect((await getCard(card.id))?.starred).toBe(false)
  })

  it('틀림 지우기와 정답 기록이 서로 덮어쓰지 않는다', async () => {
    const { card } = await setup()
    await recordAnswer(card.id, false)
    await Promise.all([clearWrong(card.id), recordAnswer(card.id, true)])
    expect((await getCard(card.id))?.stats).toMatchObject({ right: 1, wrong: 0 })
  })

  it('내용 수정 중 채점해도 누적 통계를 잃지 않는다', async () => {
    const { card } = await setup()
    await Promise.all([recordAnswer(card.id, true), updateCard(card.id, {
      type: 'term', front: 'edited', back: 'b', tags: [], starred: false,
    })])
    expect(await getCard(card.id)).toMatchObject({ front: 'edited', stats: { right: 1 } })
  })

  it('세션 삭제가 실패하면 덱과 카드 삭제도 되돌린다', async () => {
    const { deck, card, session } = await setup()
    await saveSession(session)
    const fail = () => { throw new Error('session delete failed') }
    db.sessions.hook('deleting', fail)
    try {
      await expect(deleteDeck(deck.id)).rejects.toThrow('session delete failed')
      expect(await db.decks.get(deck.id)).toBeDefined()
      expect(await getCard(card.id)).toBeDefined()
      expect(await getSession(deck.id)).toEqual(session)
    } finally { db.sessions.hook('deleting').unsubscribe(fail) }
  })
})

describe('카드 삭제와 세션 정리', () => {
  it('이미 푼 카드를 지우면 남은 결과와 커서를 함께 맞춘다', async () => {
    const { card, second, session } = await setup()
    await saveSession({ ...session, cursor: 1, results: [{ cardId: card.id, correct: true }] })
    await deleteCard(card.id)
    expect(await getSession(session.deckId)).toEqual({ ...session, cardIds: [second.id], cursor: 0, results: [], answerCount: 1 })
  })

  it('아직 풀지 않은 카드를 지우면 기존 결과는 유지하고 모두 지우면 세션을 지운다', async () => {
    const { card, second, session } = await setup()
    await saveSession({ ...session, cursor: 1, results: [{ cardId: card.id, correct: true }] })
    await deleteCard(second.id)
    expect(await getSession(session.deckId)).toMatchObject({ cardIds: [card.id], cursor: 1,
      results: [{ cardId: card.id, correct: true }] })
    await deleteCard(card.id)
    expect(await getSession(session.deckId)).toBeUndefined()
  })

  it('세션 정리 실패시 카드 삭제도 되돌린다', async () => {
    const { card, session } = await setup()
    await saveSession(session)
    const fail = () => { throw new Error('session update failed') }
    db.sessions.hook('updating', fail)
    try {
      await expect(deleteCard(card.id)).rejects.toThrow('session update failed')
      expect(await getCard(card.id)).toBeDefined()
      expect(await getSession(session.deckId)).toEqual(session)
    } finally { db.sessions.hook('updating').unsubscribe(fail) }
  })
})

describe('세션과 채점의 단일 커밋', () => {
  it('아직 저장하지 않은 세션의 첫 답도 통계·진행도를 함께 저장한다', async () => {
    const { card, session } = await setup()
    const next = await commitAnswer(session, card.id, true)
    expect(next).toEqual({ ...session, cursor: 1, results: [{ cardId: card.id, correct: true }] })
    expect(await getSession(session.deckId)).toEqual(next)
    expect((await getCard(card.id))?.stats.right).toBe(1)
  })

  it('같은 답이 동시에 들어와도 한 번만 채점한다', async () => {
    const { card, session } = await setup()
    const [first, duplicate] = await Promise.all([
      commitAnswer(session, card.id, false), commitAnswer(session, card.id, false),
    ])
    expect(first).toEqual(duplicate)
    expect(duplicate.cursor).toBe(1)
    expect((await getCard(card.id))?.stats.wrong).toBe(1)
  })

  it('이미 적용된 답의 재시도에는 뒤로 가지 않고 최신 세션을 반환한다', async () => {
    const { card, second, session } = await setup()
    const first = await commitAnswer(session, card.id, true)
    const latest = await commitAnswer(first, second.id, false)
    expect(await commitAnswer(session, card.id, true)).toEqual(latest)
    expect((await getCard(card.id))?.stats.right).toBe(1)
  })

  it('같은 위치의 다른 답은 거절한다', async () => {
    const { card, session } = await setup()
    await commitAnswer(session, card.id, true)
    await expect(commitAnswer(session, card.id, false)).rejects.toThrow()
    expect((await getCard(card.id))?.stats).toMatchObject({ right: 1, wrong: 0 })
  })

  it('동시에 서로 다른 답이 들어와도 먼저 커밋한 답만 기록한다', async () => {
    const { card, session } = await setup()
    const outcomes = await Promise.allSettled([
      commitAnswer(session, card.id, true), commitAnswer(session, card.id, false),
    ])
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected'])
    const saved = (await getCard(card.id))!
    expect(saved.stats.right + saved.stats.wrong).toBe(1)
    expect((await getSession(session.deckId))?.results).toHaveLength(1)
  })

  it('저장된 과거 결과와 다른 결과를 보내면 새 답도 거절한다', async () => {
    const { card, second, session } = await setup()
    const first = await commitAnswer(session, card.id, true)
    await expect(commitAnswer({ ...first, results: [{ cardId: card.id, correct: false }] }, second.id, true)).rejects.toThrow()
    expect((await getCard(second.id))?.stats.right).toBe(0)
  })

  it('다른 세션으로 바뀌었다면 오래된 답을 거절한다', async () => {
    const { card, session } = await setup()
    await saveSession({ ...session, startedAt: 2 })
    await expect(commitAnswer(session, card.id, true)).rejects.toThrow()
    expect((await getCard(card.id))?.stats.right).toBe(0)
  })

  it('없는 카드·출제 순서에 맞지 않는 카드·변조된 진행도를 거절한다', async () => {
    const { card, second, session } = await setup()
    await expect(commitAnswer(session, second.id, true)).rejects.toThrow()
    await expect(commitAnswer({ ...session, cursor: 1 }, second.id, true)).rejects.toThrow()
    await db.cards.delete(card.id)
    await expect(commitAnswer(session, card.id, true)).rejects.toThrow()
    expect(await getSession(session.deckId)).toBeUndefined()
  })

  it('이미 다른 덱에 속한 카드에는 답을 기록하지 않는다', async () => {
    const { card, session } = await setup()
    await db.cards.update(card.id, { deckId: 'other' })
    await expect(commitAnswer(session, card.id, true)).rejects.toThrow()
    expect((await getCard(card.id))?.stats.right).toBe(0)
  })

  it('기존 세션 갱신 실패시 다음 카드 통계도 되돌린다', async () => {
    const { card, second, session } = await setup()
    const first = await commitAnswer(session, card.id, true)
    const fail = () => { throw new Error('session update failed') }
    db.sessions.hook('updating', fail)
    try {
      await expect(commitAnswer(first, second.id, false)).rejects.toThrow('session update failed')
      expect((await getCard(second.id))?.stats).toEqual({ right: 0, wrong: 0, lastSeenAt: null })
      expect(await getSession(session.deckId)).toEqual(first)
    } finally { db.sessions.hook('updating').unsubscribe(fail) }
  })

  it('세션 쓰기 실패시 카드 통계도 되돌린다', async () => {
    const { card, session } = await setup()
    const fail = () => { throw new Error('session write failed') }
    db.sessions.hook('creating', fail)
    try {
      await expect(commitAnswer(session, card.id, true)).rejects.toThrow('session write failed')
      expect((await getCard(card.id))?.stats).toEqual({ right: 0, wrong: 0, lastSeenAt: null })
      expect(await getSession(session.deckId)).toBeUndefined()
    } finally { db.sessions.hook('creating').unsubscribe(fail) }
  })
})
