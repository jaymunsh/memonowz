import { describe, expect, it } from 'vitest'
import { emptyStats, type Card } from '../types'
import { emptyDraft, getDraftError, toDraft, toInput } from './editorDraft'

describe('card editor serialization', () => {
  it('keeps the selected answer when blank choices before it are removed', () => {
    const input = toInput({
      ...emptyDraft('mcq'), question: '정답은?',
      choices: [' ', ' 오답 ', ' 정답 ', '다른 오답'], answerIndex: 2,
    })
    expect(input).toMatchObject({
      type: 'mcq', choices: ['오답', '정답', '다른 오답'], answer: 1,
    })
  })

  it('rejects a selected blank choice even when its index fits the filtered choices', () => {
    const input = toInput({
      ...emptyDraft('mcq'), question: '정답은?',
      choices: ['오답', ' ', '정답', '다른 오답'], answerIndex: 1,
    })
    expect(input).toBeNull()
  })

  it('preserves a term card’s distractors when saving without edits', () => {
    const card: Card = {
      id: 'term', deckId: 'deck', type: 'term', front: 'cohesion', back: '응집도',
      distractors: ['결합도', '추상화'], tags: ['개념'], starred: true,
      stats: emptyStats(),
    }
    expect(toInput(toDraft(card))).toMatchObject({
      distractors: ['결합도', '추상화'], starred: true, tags: ['개념'],
    })
  })
})

describe('card editor validation guidance', () => {
  it('identifies the selected empty answer before checking choice count', () => {
    expect(getDraftError({
      ...emptyDraft('mcq'), question: '문제', choices: ['오답', ' ', '다른 오답'], answerIndex: 1,
    })).toContain('정답으로 선택한 보기')
  })

  it('asks for at least two filled choices when only the answer is filled', () => {
    expect(getDraftError({
      ...emptyDraft('mcq'), question: '문제', choices: ['정답', ''], answerIndex: 0,
    })).toContain('2개')
  })

  it('points to the missing term side', () => {
    expect(getDraftError({ ...emptyDraft(), front: '단어' })).toContain('뒷면')
  })

  it('points to a missing question', () => {
    expect(getDraftError({ ...emptyDraft('mcq'), choices: ['정답', '오답'] })).toContain('문제')
  })
})
