import { cardInputSchema, type Card, type CardInput, type CardType } from '../types'

export type Draft = {
  type: CardType
  front: string
  back: string
  distractors?: string[]
  question: string
  choices: string[]
  answerIndex: number
  explanation: string
  tags: string
  starred: boolean
}

export const emptyDraft = (type: CardType = 'term'): Draft => ({
  type, front: '', back: '', question: '',
  choices: ['', '', '', ''], answerIndex: 0, explanation: '', tags: '', starred: false,
})

export const toDraft = (card: Card): Draft => ({
  ...emptyDraft(),
  type: card.type,
  explanation: card.explanation ?? '',
  tags: card.tags.join(', '),
  starred: card.starred,
  ...(card.type === 'term'
    ? { front: card.front, back: card.back, distractors: card.distractors }
    : {}),
  ...(card.type === 'mcq'
    ? { question: card.question, choices: card.choices, answerIndex: card.answer }
    : {}),
})

export const toInput = (d: Draft): CardInput | null => {
  if (d.type === 'mcq' && !d.choices[d.answerIndex]?.trim()) return null
  const tags = d.tags.split(',').map((t) => t.trim()).filter(Boolean)
  const explanation = d.explanation.trim() || undefined
  const starred = d.starred
  const raw =
    d.type === 'term'
      ? {
          type: 'term', front: d.front.trim(), back: d.back.trim(),
          distractors: d.distractors, tags, explanation, starred,
        }
      : {
          type: 'mcq', question: d.question.trim(),
          choices: d.choices.map((c) => c.trim()).filter(Boolean),
          answer: d.choices.slice(0, d.answerIndex).filter((choice) => choice.trim()).length,
          tags, explanation, starred,
        }
  const parsed = cardInputSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export const getDraftError = (draft: Draft): string | null => {
  if (draft.type === 'term') {
    if (!draft.front.trim()) return '앞면에 단어를 입력해 주세요.'
    if (!draft.back.trim()) return '뒷면에 뜻을 입력해 주세요.'
  } else {
    if (!draft.question.trim()) return '문제를 입력해 주세요.'
    if (!draft.choices[draft.answerIndex]?.trim()) {
      return '정답으로 선택한 보기가 비어 있습니다. 내용을 입력하거나 다른 정답을 선택해 주세요.'
    }
    if (draft.choices.filter((choice) => choice.trim()).length < 2) {
      return '보기를 2개 이상 입력해 주세요.'
    }
  }
  return toInput(draft) ? null : '카드 내용을 확인한 뒤 다시 저장해 주세요.'
}
