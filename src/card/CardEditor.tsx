import { useEffect, useRef, useState } from 'react'
import { Button, Field, Icon, Modal, Tabs } from '../ui'
import { cardTypeLabel, type Card, type CardType } from '../types'
import { createCard, deleteCard, getCard, updateCard } from '../db'
import { emptyDraft, getDraftError, toDraft, toInput, type Draft } from './editorDraft'
import './CardEditor.css'

const TYPES = [
  { value: 'term' as const, label: cardTypeLabel.term },
  { value: 'mcq' as const, label: cardTypeLabel.mcq },
]

export const CardEditor = ({ deckId, open, card, defaultType, onClose, onSaved, onDeleted }: {
  deckId: string
  open: boolean
  card?: Card
  /** 새 카드의 기본 유형. 덱이 이미 쓰고 있는 유형을 그대로 이어 쓴다 */
  defaultType?: CardType
  onClose: () => void
  onSaved: (card: Card) => void
  onDeleted?: (cardId: string) => void
}) => {
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pending = useRef(false)

  useEffect(() => {
    if (open) {
      setDraft(card ? toDraft(card) : emptyDraft(defaultType))
      setError(null)
      setConfirmDelete(false)
    }
  }, [open, card, defaultType])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const close = () => {
    if (!pending.current) onClose()
  }

  const save = async () => {
    if (pending.current) return
    const input = toInput(draft)
    if (!input) {
      setError(getDraftError(draft))
      return
    }
    pending.current = true
    setBusy('save')
    setError(null)
    try {
      if (card) {
        await updateCard(card.id, input)
        const updated = await getCard(card.id)
        if (!updated) {
          setError('저장할 카드를 찾지 못했습니다. 목록에서 카드를 다시 열어 주세요.')
          return
        }
        onSaved(updated)
      } else {
        onSaved(await createCard(deckId, input))
      }
      onClose()
    } catch {
      setError('카드를 저장하지 못했습니다. 입력한 내용은 유지됩니다. 다시 저장해 주세요.')
    } finally {
      pending.current = false
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!card || pending.current || !confirmDelete) return
    pending.current = true
    setBusy('delete')
    setError(null)
    try {
      await deleteCard(card.id)
      onDeleted?.(card.id)
      onClose()
    } catch {
      setError('카드를 삭제하지 못했습니다. 다시 삭제해 주세요.')
    } finally {
      pending.current = false
      setBusy(null)
    }
  }

  return (
    <Modal
      open={open}
      busy={busy !== null}
      title={card ? '카드 편집' : '카드 추가'}
      onClose={close}
      footer={
        <div className="editor__footer">
          {error && <p className="editor__error" role="alert">{error}</p>}
          <div className="editor__actions">
          {confirmDelete ? (
            <>
              <Button variant="danger" disabled={busy !== null} onClick={remove}>
                {busy === 'delete' ? '삭제 중…' : '카드 삭제'}
              </Button>
              <Button disabled={busy !== null} onClick={() => { setConfirmDelete(false); setError(null) }}>취소</Button>
            </>
          ) : (
            <>
              <Button variant="primary" disabled={busy !== null} onClick={save}>
                {busy === 'save' ? '저장 중…' : '저장'}
              </Button>
              {card && <Button variant="danger" disabled={busy !== null} onClick={() => { setConfirmDelete(true); setError(null) }}>삭제</Button>}
            </>
          )}
          </div>
        </div>
      }
    >
      {confirmDelete && (
        <div className="editor__delete-confirm" role="alert">
          <strong>이 카드를 삭제할까요?</strong>
          <p>카드 내용과 학습 기록이 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
        </div>
      )}
      {!confirmDelete && (
        <fieldset className="editor__form" disabled={busy !== null} aria-busy={busy !== null}>
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
                  <div key={i} className={`editor__choice${draft.answerIndex === i ? ' is-answer' : ''}`}>
                    <label className="editor__answer">
                      <input
                        type="radio"
                        name="answer"
                        aria-label={`보기 ${i + 1}을 정답으로 선택`}
                        checked={draft.answerIndex === i}
                        onChange={() => set('answerIndex', i)}
                      />
                      <span className="editor__choice-number" aria-hidden="true">{i + 1}</span>
                    </label>
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
                  </div>
                ))}
              </fieldset>
            </>
          )}

          <Field label="개념 설명 · 선택" as="textarea" value={draft.explanation} onChange={(e) => set('explanation', e.target.value)} />
          <Field label="태그 · 쉼표로 구분" value={draft.tags} onChange={(e) => set('tags', e.target.value)} />

          <label className="editor__star">
            <input
              type="checkbox"
              checked={draft.starred}
              onChange={(e) => set('starred', e.target.checked)}
            />
            <Icon name="star" size={16} filled={draft.starred} />
            <span>핵심 단어</span>
          </label>
        </fieldset>
      )}
    </Modal>
  )
}
