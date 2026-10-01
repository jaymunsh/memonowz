import { beforeEach, describe, expect, it } from 'vitest'
import {
  createCard, createDeck, db, exportAll, exportDeck, importBackup,
  getSession, importBackups, restoreAll, saveSession,
} from './index'
import { fullBackupSchema, type Backup, type FullBackup } from '../types'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const snapshot = (): FullBackup => ({
  version: 1, exportedAt: 100,
  decks: [{ id: 'deck', name: '문장', description: '설명', flipOnly: true, createdAt: 10 }],
  cards: [{ id: 'card', deckId: 'deck', type: 'term', front: 'a', back: 'b',
    tags: ['핵심'], starred: true, stats: { right: 3, wrong: 2, lastSeenAt: 20 } }],
  sessions: [{ deckId: 'deck', cardIds: ['card'], cursor: 1,
    results: [{ cardId: 'card', correct: true }], startedAt: 15, timed: true, label: '복습' }],
})

describe('백업 보존과 복원', () => {
  it('교환용 파일에도 플래시카드 모드를 보존한다', async () => {
    const deck = await createDeck({ name: '문장', flipOnly: true })
    const exported = await exportDeck(deck.id)
    expect(exported.deck.flipOnly).toBe(true)
    expect((await importBackup(exported)).flipOnly).toBe(true)
  })

  it('전체 백업을 새 ID로 붙이고 원본 통계·시각·모드·세션을 보존한다', async () => {
    const existing = await createDeck({ name: '기존', flipOnly: false })
    expect(await restoreAll(snapshot())).toBe(1)
    const exported = await exportAll()
    expect(exported.version).toBe(1)
    expect(exported.exportedAt).toBeGreaterThan(0)
    expect(exported.decks).toHaveLength(2)
    const restored = exported.decks.find((deck) => deck.id !== existing.id)!
    expect(restored).toMatchObject({ name: '문장', flipOnly: true, createdAt: 10 })
    expect(restored.id).not.toBe('deck')
    const card = exported.cards[0]
    expect(card).toMatchObject({ deckId: restored.id, starred: true,
      stats: { right: 3, wrong: 2, lastSeenAt: 20 } })
    expect(card.id).not.toBe('card')
    expect(await getSession(restored.id)).toEqual({ deckId: restored.id, cardIds: [card.id],
      cursor: 1, results: [{ cardId: card.id, correct: true }], startedAt: 15, timed: true, label: '복습' })
    expect(fullBackupSchema.safeParse(exported).success).toBe(true)
    expect(await restoreAll(exported)).toBe(2)
    expect(await db.decks.count()).toBe(4)
    expect(await db.cards.count()).toBe(2)
    expect(await db.sessions.count()).toBe(2)
  })

  it('옛 저장 값의 누락된 starred·flipOnly를 기본값으로 복구한다', () => {
    const input = JSON.parse(JSON.stringify(snapshot()))
    delete input.decks[0].flipOnly
    delete input.cards[0].starred
    const parsed = fullBackupSchema.parse(input)
    expect(parsed.decks[0].flipOnly).toBe(false)
    expect(parsed.cards[0].starred).toBe(false)
  })

  it.each([
    ['덱 참조', (input: FullBackup) => { input.cards[0].deckId = 'missing' }],
    ['중복 덱', (input: FullBackup) => { input.decks.push(input.decks[0]) }],
    ['중복 카드', (input: FullBackup) => { input.cards.push(input.cards[0]) }],
    ['중복 세션', (input: FullBackup) => { input.sessions.push(input.sessions[0]) }],
    ['세션 카드', (input: FullBackup) => { input.sessions[0].cardIds[0] = 'missing' }],
    ['커서', (input: FullBackup) => { input.sessions[0].cursor = 2 }],
    ['결과 개수', (input: FullBackup) => { input.sessions[0].results = [] }],
    ['결과 순서', (input: FullBackup) => { input.sessions[0].results[0].cardId = 'missing' }],
    ['통계', (input: FullBackup) => { input.cards[0].stats.right = -1 }],
    ['다른 덱의 세션 카드', (input: FullBackup) => {
      input.decks.push({ id: 'other', name: 'other', flipOnly: false, createdAt: 1 })
      input.sessions[0].deckId = 'other'
    }],
    ['중복 출제 카드', (input: FullBackup) => { input.sessions[0].cardIds.push('card') }],
  ])('잘못된 %s는 쓰기 전에 거절한다', async (_name, mutate) => {
    const input = snapshot()
    mutate(input)
    expect(fullBackupSchema.safeParse(input).success).toBe(false)
    await expect(restoreAll(input)).rejects.toThrow()
    expect(await db.decks.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
    expect(await db.sessions.count()).toBe(0)
  })

  it('잘못된 교환용 카드도 덱을 쓰기 전에 거절한다', async () => {
    const invalid = { deck: { name: 'd', flipOnly: false }, cards: [{
      type: 'mcq' as const, question: 'Q', choices: ['a', 'b'], answer: 3, tags: [], starred: false,
    }] }
    await expect(importBackup(invalid)).rejects.toThrow()
    expect(await db.decks.count()).toBe(0)
  })

  it('전체 백업의 객관식 정답 범위도 검증한다', () => {
    const input = snapshot()
    input.cards[0] = { id: 'card', deckId: 'deck', type: 'mcq', question: 'Q',
      choices: ['a', 'b'], answer: 2, tags: [], starred: false,
      stats: { right: 0, wrong: 0, lastSeenAt: null } }
    expect(fullBackupSchema.safeParse(input).success).toBe(false)
  })

  it('카드 쓰기가 실패하면 교환용 임포트의 덱도 남기지 않는다', async () => {
    const fail = () => { throw new Error('card write failed') }
    db.cards.hook('creating', fail)
    try {
      await expect(importBackup({ deck: { name: '실패', flipOnly: false }, cards: [{
        type: 'term', front: 'a', back: 'b', tags: [], starred: false,
      }] })).rejects.toThrow('card write failed')
      expect(await db.decks.count()).toBe(0)
    } finally { db.cards.hook('creating').unsubscribe(fail) }
  })

  it('세션 쓰기가 실패하면 전체 복원의 덱·카드도 남기지 않는다', async () => {
    const fail = () => { throw new Error('session write failed') }
    db.sessions.hook('creating', fail)
    try {
      await expect(restoreAll(snapshot())).rejects.toThrow('session write failed')
      expect(await db.decks.count()).toBe(0)
      expect(await db.cards.count()).toBe(0)
    } finally { db.sessions.hook('creating').unsubscribe(fail) }
  })

  it('과거에 삭제되어 남은 세션 카드 참조를 내보낼 때 정리한다', async () => {
    const deck = await createDeck({ name: 'd', flipOnly: false })
    const card = await createCard(deck.id, { type: 'term', front: 'a', back: 'b', tags: [], starred: false })
    await saveSession({ deckId: deck.id, cardIds: ['deleted', card.id], cursor: 1,
      results: [{ cardId: 'deleted', correct: false }], startedAt: 1 })
    const exported = await exportAll()
    expect(exported.sessions[0]).toEqual({ deckId: deck.id, cardIds: [card.id], cursor: 0, results: [], startedAt: 1, answerCount: 1 })
    expect(fullBackupSchema.safeParse(exported).success).toBe(true)
  })

  it('유효한 빈 세션도 전체 백업에서 잃지 않는다', async () => {
    const input = snapshot()
    input.sessions[0] = { deckId: 'deck', cardIds: [], cursor: 0, results: [], startedAt: 15 }
    await restoreAll(input)
    const exported = await exportAll()
    expect(exported.sessions).toHaveLength(1)
    expect(exported.sessions[0]).toMatchObject({ cardIds: [], cursor: 0, results: [], startedAt: 15 })
  })

  it('전체 내보내기는 저장된 카드와 세션을 포함한다', async () => {
    const deck = await createDeck({ name: 'd', flipOnly: false })
    const card = await createCard(deck.id, { type: 'term', front: 'a', back: 'b', tags: [], starred: false })
    await saveSession({ deckId: deck.id, cardIds: [card.id], cursor: 0, results: [], startedAt: 1 })
    const exported = await exportAll()
    expect(exported.cards[0].id).toBe(card.id)
    expect(exported.sessions[0].deckId).toBe(deck.id)
    expect(exported.sessions[0]).not.toHaveProperty('key')
  })
})


describe('이전 전체 교환 파일 원자성', () => {
  const exchange = (name: string): Backup => ({
    deck: { name, flipOnly: false },
    cards: [{ type: 'term', front: name, back: 'answer', tags: [], starred: false }],
  })

  it('여러 덱을 함께 가져오고 새 덱 목록을 반환한다', async () => {
    const decks = await importBackups([exchange('첫째'), exchange('둘째')])
    expect(decks.map((deck) => deck.name)).toEqual(['첫째', '둘째'])
    expect(await db.decks.count()).toBe(2)
    const cards = await db.cards.toArray()
    expect(cards.map((card) => card.type === 'term' ? card.front : card.question).sort()).toEqual(['둘째', '첫째'])
    expect(new Set(cards.map((card) => card.deckId))).toEqual(new Set(decks.map((deck) => deck.id)))
  })

  it('두 번째 덱의 카드 쓰기가 실패하면 앞 덱과 모든 카드도 되돌린다', async () => {
    let created = 0
    const failSecond = () => {
      created += 1
      if (created === 2) throw new Error('second card batch failed')
    }
    db.cards.hook('creating', failSecond)
    try {
      await expect(importBackups([exchange('첫째'), exchange('둘째')])).rejects.toThrow('second card batch failed')
      expect(await db.decks.count()).toBe(0)
      expect(await db.cards.count()).toBe(0)
    } finally { db.cards.hook('creating').unsubscribe(failSecond) }
    await importBackups([exchange('첫째'), exchange('둘째')])
    expect(await db.decks.count()).toBe(2)
    expect(await db.cards.count()).toBe(2)
  })

  it('목록 안의 잘못된 덱도 전체를 쓰기 전에 거절한다', async () => {
    const invalid = exchange('잘못됨')
    invalid.cards[0] = { type: 'mcq', question: 'Q', choices: ['a', 'b'], answer: 2, tags: [], starred: false }
    await expect(importBackups([exchange('유효함'), invalid])).rejects.toThrow()
    expect(await db.decks.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
  })
})
