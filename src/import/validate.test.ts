import { describe, expect, it } from 'vitest'
import { validateCards } from './validate'

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
