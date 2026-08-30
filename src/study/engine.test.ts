import { describe, expect, it } from 'vitest'
import { buildQuestion, orderCards } from './engine'
import type { Card } from '../types'

/** rng를 고정해 셔플을 결정적으로 만든다 */
const fixedRng = () => 0

const term = (id: string, back: string, right = 0, wrong = 0): Card => ({
  id, deckId: 'd', type: 'term', front: `front-${id}`, back,
  tags: [], stats: { right, wrong, lastSeenAt: null },
})

describe('orderCards', () => {
  it('글자순은 앞면을 오름차순 정렬한다', () => {
    const korean = [
      { ...term('c', 'C'), front: '바나나' },
      { ...term('a', 'A'), front: '가지' },
      { ...term('b', 'B'), front: '다래' },
    ]
    expect(orderCards(korean, 'alpha')).toEqual(['a', 'b', 'c'])

    const latin = [
      { ...term('c', 'C'), front: 'cherry' },
      { ...term('a', 'A'), front: 'apple' },
      { ...term('b', 'B'), front: 'banana' },
    ]
    expect(orderCards(latin, 'alpha')).toEqual(['a', 'b', 'c'])
  })

  it('랜덤순도 모든 카드를 한 번씩 담는다', () => {
    const cards = ['a', 'b', 'c', 'd'].map((id) => term(id, id.toUpperCase()))
    expect([...orderCards(cards, 'random')].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('틀린 것만은 오답이 한 번이라도 있는 카드만 낸다', () => {
    const cards = [
      term('a', 'A', 5, 0),
      term('b', 'B', 0, 3),
      term('c', 'C', 1, 1),
    ]
    expect(orderCards(cards, 'wrong', fixedRng)).toEqual(['b', 'c'])
  })

  it('모든 카드를 정확히 한 번씩 담는다', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => term(id, id.toUpperCase()))
    const order = orderCards(cards, 'alpha', Math.random)
    expect([...order].sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('빈 덱이면 빈 배열', () => {
    expect(orderCards([], 'alpha', fixedRng)).toEqual([])
  })
})

describe('buildQuestion — term', () => {
  const pool = [
    term('a', '응집도'),
    term('b', '결합도'),
    term('c', '캡슐화'),
    term('d', '추상화'),
    term('e', '다형성'),
  ]

  it('같은 덱 다른 카드의 back에서 보기를 뽑아 4지선다를 만든다', () => {
    const q = buildQuestion(pool[0], pool, fixedRng)
    expect(q.kind).toBe('choice')
    if (q.kind !== 'choice') return
    expect(q.choices).toHaveLength(4)
    expect(q.choices[q.answerIndex]).toBe('응집도')
    expect(new Set(q.choices).size).toBe(4)
  })

  it('직접 넣은 distractors가 있으면 그것을 쓴다', () => {
    // Card는 zod union이라 union spread에 distractors를 더하면 TS가 좁히지 못한다.
    // 런타임 계약은 term 카드이며 테스트 데이터도 그 형태를 따른다.
    // @ts-expect-error
    const card: Card = { ...pool[0], distractors: ['가짜1', '가짜2', '가짜3'] }
    const q = buildQuestion(card, pool, fixedRng)
    if (q.kind !== 'choice') throw new Error('choice여야 한다')
    expect(q.choices).toEqual(expect.arrayContaining(['가짜1', '가짜2', '가짜3', '응집도']))
  })

  it('덱에 카드가 3장뿐이면 보기를 3개로 줄인다', () => {
    const small = pool.slice(0, 3)
    const q = buildQuestion(small[0], small, fixedRng)
    if (q.kind !== 'choice') throw new Error('choice여야 한다')
    expect(q.choices).toHaveLength(3)
  })

  it('덱에 카드가 하나뿐이면 뒤집기로 낸다', () => {
    const only = [pool[0]]
    const q = buildQuestion(only[0], only, fixedRng)
    expect(q.kind).toBe('flip')
    if (q.kind !== 'flip') return
    expect(q.answer).toBe('응집도')
  })
})

describe('buildQuestion — mcq / qa', () => {
  const mcq: Card = {
    id: 'm', deckId: 'd', type: 'mcq',
    question: '가장 높은 것은?', choices: ['우연적', '논리적', '기능적'], answer: 2,
    tags: [], stats: { right: 0, wrong: 0, lastSeenAt: null },
  }

  it('mcq는 보기를 섞어도 answerIndex가 정답을 가리킨다', () => {
    const q = buildQuestion(mcq, [mcq], Math.random)
    if (q.kind !== 'choice') throw new Error('choice여야 한다')
    expect(q.choices).toHaveLength(3)
    expect(q.choices[q.answerIndex]).toBe('기능적')
  })

  it('qa는 항상 뒤집기다', () => {
    const qa: Card = {
      id: 'q', deckId: 'd', type: 'qa', question: 'useMemo는 언제?', answer: '계산이 비쌀 때',
      tags: [], stats: { right: 0, wrong: 0, lastSeenAt: null },
    }
    const q = buildQuestion(qa, [qa], fixedRng)
    expect(q.kind).toBe('flip')
    if (q.kind !== 'flip') return
    expect(q.stem).toBe('useMemo는 언제?')
    expect(q.answer).toBe('계산이 비쌀 때')
  })
})
