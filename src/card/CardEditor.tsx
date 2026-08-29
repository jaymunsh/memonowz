import { useEffect, useState } from 'react'
import { Button, Field, Modal, Tabs } from '../ui'
import { cardInputSchema, cardTypeLabel, type Card, type CardInput, type CardType } from '../types'
import { createCard, deleteCard, getCard, updateCard } from '../db'
import './CardEditor.css'

const TYPES = [
  { value: 'term' as const, label: cardTypeLabel.term },
  { value: 'mcq' as const, label: cardTypeLabel.mcq },
  { value: 'qa' as const, label: cardTypeLabel.qa },
]

type Draft = {
  type: CardType
  front: string
  back: string
  question: string
  answerText: string
  choices: string[]
  answerIndex: number
  explanation: string
  tags: string
}

const emptyDraft = (): Draft => ({
  type: 'term', front: '', back: '', question: '', answerText: '',
  choices: ['', '', '', ''], answerIndex: 0, explanation: '', tags: '',
})

const toDraft = (card: Card): Draft => ({
  ...emptyDraft(),
  type: card.type,
  explanation: card.explanation ?? '',
  tags: card.tags.join(', '),
  ...(card.type === 'term' ? { front: card.front, back: card.back } : {}),
  ...(card.type === 'mcq'
    ? { question: card.question, choices: card.choices, answerIndex: card.answer }
    : {}),
  ...(card.type === 'qa' ? { question: card.question, answerText: card.answer } : {}),
})

const toInput = (d: Draft): CardInput | null => {
  const tags = d.tags.split(',').map((t) => t.trim()).filter(Boolean)
  const explanation = d.explanation.trim() || undefined
  const raw =
    d.type === 'term'
      ? { type: 'term', front: d.front.trim(), back: d.back.trim(), tags, explanation }
      : d.type === 'mcq'
        ? {
            type: 'mcq', question: d.question.trim(),
            choices: d.choices.map((c) => c.trim()).filter(Boolean),
            answer: d.answerIndex, tags, explanation,
          }
        : { type: 'qa', question: d.question.trim(), answer: d.answerText.trim(), tags, explanation }
  const parsed = cardInputSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export const CardEditor = ({ deckId, open, card, onClose, onSaved, onDeleted }: {
  deckId: string
  open: boolean
  card?: Card
  onClose: () => void
  onSaved: (card: Card) => void
  onDeleted?: (cardId: string) => void
}) => {
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDraft(card ? toDraft(card) : emptyDraft())
      setError(null)
    }
  }, [open, card])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const save = async () => {
    const input = toInput(draft)
    if (!input) {
      setError('필수 항목이 비었거나 정답이 보기 범위를 벗어났습니다.')
      return
    }
    if (card) {
      await updateCard(card.id, input)
      const updated = await getCard(card.id)
      if (updated) onSaved(updated)
    } else {
      onSaved(await createCard(deckId, input))
    }
    onClose()
  }

  const remove = async () => {
    if (!card) return
    await deleteCard(card.id)
    onDeleted?.(card.id)
    onClose()
  }

  return (
    <Modal
      open={open}
      title={card ? '카드 편집' : '카드 추가'}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={save}>저장</Button>
          {card && <Button variant="danger" onClick={remove}>삭제</Button>}
        </>
      }
    >
      <Tabs
        label="카드 유형"
        options={TYPES}
        value={draft.type}
        onChange={(v) => set('type', v)}
      />

      {draft.type === 'term' && (
        <>
          <Field label="앞면" value={draft.front} onChange={(e) => set('front', e.target.value)} />
          <Field label="뒷면" as="textarea" value={draft.back} onChange={(e) => set('back', e.target.value)} />
        </>
      )}

      {draft.type === 'mcq' && (
        <>
          <Field label="문제" as="textarea" value={draft.question} onChange={(e) => set('question', e.target.value)} />
          <fieldset className="editor__choices">
            <legend>보기 · 정답을 고르세요</legend>
            {draft.choices.map((choice, i) => (
              <label key={i} className="editor__choice">
                <input
                  type="radio"
                  name="answer"
                  checked={draft.answerIndex === i}
                  onChange={() => set('answerIndex', i)}
                />
                <input
                  className="editor__choice-text"
                  value={choice}
                  aria-label={`보기 ${i + 1}`}
                  onChange={(e) => {
                    const next = [...draft.choices]
                    next[i] = e.target.value
                    set('choices', next)
                  }}
                />
              </label>
            ))}
          </fieldset>
        </>
      )}

      {draft.type === 'qa' && (
        <>
          <Field label="질문" as="textarea" value={draft.question} onChange={(e) => set('question', e.target.value)} />
          <Field label="모범답안" as="textarea" value={draft.answerText} onChange={(e) => set('answerText', e.target.value)} />
        </>
      )}

      <Field label="개념 설명 · 선택" as="textarea" value={draft.explanation} onChange={(e) => set('explanation', e.target.value)} />
      <Field label="태그 · 쉼표로 구분" value={draft.tags} onChange={(e) => set('tags', e.target.value)} />

      {error && <p className="editor__error">{error}</p>}
    </Modal>
  )
}
