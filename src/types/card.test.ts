import { describe, expect, it } from 'vitest'
import { cardInputSchema } from './card'

describe('cardInputSchema', () => {
  it('term 카드를 통과시키고 tags 기본값을 채운다', () => {
    const r = cardInputSchema.safeParse({ type: 'term', front: 'cohesion', back: '응집도' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.tags).toEqual([])
  })

  it('front가 비면 거절한다', () => {
    const r = cardInputSchema.safeParse({ type: 'term', front: '', back: '응집도' })
    expect(r.success).toBe(false)
  })

  it('mcq의 answer가 choices 범위를 벗어나면 거절한다', () => {
    const r = cardInputSchema.safeParse({
      type: 'mcq', question: 'Q', choices: ['a', 'b'], answer: 2,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('choices 범위')
    }
  })

  it('choices가 2개 미만이면 거절한다', () => {
    const r = cardInputSchema.safeParse({ type: 'mcq', question: 'Q', choices: ['a'], answer: 0 })
    expect(r.success).toBe(false)
  })

  it('mcq 카드는 explanation 없이도 통과한다', () => {
    const r = cardInputSchema.safeParse({ type: 'mcq', question: 'Q', choices: ['a', 'b'], answer: 0 })
    expect(r.success).toBe(true)
  })

  it('없어진 qa 유형은 거절한다', () => {
    const r = cardInputSchema.safeParse({ type: 'qa', question: 'Q', answer: 'A' })
    expect(r.success).toBe(false)
  })

  it('알 수 없는 type은 거절한다', () => {
    const r = cardInputSchema.safeParse({ type: 'cloze', text: '...' })
    expect(r.success).toBe(false)
  })
})
