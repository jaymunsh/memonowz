import { describe, expect, it } from 'vitest'
import { readDecksFromFile, validateCards } from './validate'

describe('validateCards', () => {
  it('통과분과 실패분을 갈라서 낸다', () => {
    const { ok, errors } = validateCards([
      { type: 'term', front: 'a', back: 'b' },
      { type: 'mcq', question: 'Q', choices: ['x', 'y'], answer: 5 },
      { type: 'term', front: '', back: 'b' },
    ])
    expect(ok).toHaveLength(1)
    expect(errors).toHaveLength(2)
  })

  it('실패 메시지에 1부터 세는 항목 번호가 들어간다', () => {
    const { errors } = validateCards([
      { type: 'term', front: 'a', back: 'b' },
      { type: 'mcq', question: 'Q', choices: ['x', 'y'], answer: 5 },
    ])
    expect(errors[0].index).toBe(2)
    expect(errors[0].message).toContain('2번째 항목')
    expect(errors[0].message).toContain('choices 범위')
  })

  it('전부 통과하면 errors는 빈 배열', () => {
    const { ok, errors } = validateCards([{ type: 'term', front: 'Q', back: 'A' }])
    expect(ok).toHaveLength(1)
    expect(errors).toEqual([])
  })
})

describe('readDecksFromFile', () => {
  const cards = [{ type: 'term', front: 'a', back: 'b' }]
  const deck = { name: '덱' }
  // flipOnly는 스키마 기본값이라 파싱하면 채워진다
  const parsedDeck = { name: '덱', flipOnly: false }

  it('전체 백업 · 덱 하나 · 카드 배열 세 모양을 모두 받는다', () => {
    expect(readDecksFromFile({ decks: [{ deck, cards }] })).toEqual([{ deck: parsedDeck, cards }])
    expect(readDecksFromFile({ deck, cards })).toEqual([{ deck: parsedDeck, cards }])
    expect(readDecksFromFile(cards)).toEqual([{ deck: undefined, cards }])
  })

  it('cards가 없으면 거부한다', () => {
    expect(readDecksFromFile({ deck })).toBeNull()
    expect(readDecksFromFile('nope')).toBeNull()
  })

  it('전체 복구용 백업에서도 덱별 카드 내용을 읽는다', () => {
    const full = {
      version: 1, exportedAt: 1,
      decks: [{ id: 'd', name: '플래시카드', flipOnly: true, createdAt: 1 }],
      cards: [{ id: 'c', deckId: 'd', type: 'term', front: 'a', back: 'b', tags: [], starred: true,
        stats: { right: 2, wrong: 1, lastSeenAt: 1 } }],
      sessions: [],
    }
    const read = readDecksFromFile(full)
    expect(read).toHaveLength(1)
    expect(read?.[0].deck).toEqual({ name: '플래시카드', flipOnly: true })
    const result = validateCards(read?.[0].cards ?? [])
    expect(result.errors).toEqual([])
    expect(result.ok).toEqual([{ type: 'term', front: 'a', back: 'b', tags: [], starred: true }])
  })

  it('지원하지 않는 백업 버전은 일반 덱 파일로 오인하지 않는다', () => {
    expect(readDecksFromFile({ version: 999, decks: [{ deck, cards }] })).toBeNull()
  })
})
