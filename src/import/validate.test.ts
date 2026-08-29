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
    const { ok, errors } = validateCards([{ type: 'qa', question: 'Q', answer: 'A' }])
    expect(ok).toHaveLength(1)
    expect(errors).toEqual([])
  })
})

describe('readDecksFromFile', () => {
  const cards = [{ type: 'term', front: 'a', back: 'b' }]
  const deck = { name: '덱' }

  it('전체 백업 · 덱 하나 · 카드 배열 세 모양을 모두 받는다', () => {
    expect(readDecksFromFile({ decks: [{ deck, cards }] })).toEqual([{ deck: { name: '덱' }, cards }])
    expect(readDecksFromFile({ deck, cards })).toEqual([{ deck: { name: '덱' }, cards }])
    expect(readDecksFromFile(cards)).toEqual([{ deck: undefined, cards }])
  })

  it('cards가 없으면 거부한다', () => {
    expect(readDecksFromFile({ deck })).toBeNull()
    expect(readDecksFromFile('nope')).toBeNull()
  })
})
