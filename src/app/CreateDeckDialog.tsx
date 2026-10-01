import { useEffect, useRef, useState } from 'react'
import { createDeck } from '../db'
import { deckModeHint, deckModeOptions, type Deck } from '../types'
import { Button, Field, Modal, Tabs } from '../ui'

export const CreateDeckDialog = ({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: (deck: Deck) => void
}) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [flipOnly, setFlipOnly] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  useEffect(() => { if (open) { setName(''); setDescription(''); setFlipOnly(false); setError('') } }, [open])
  const create = async () => {
    if (pending.current) return
    if (!name.trim()) { setError('덱 이름을 입력하세요.'); return }
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const deck = await createDeck({ name: name.trim(), description: description.trim() || undefined, flipOnly })
      onCreated(deck)
      onClose()
    } catch { setError('덱을 만들지 못했습니다. 입력한 내용은 유지됩니다. 다시 시도해 주세요.') }
    finally { pending.current = false; setBusy(false) }
  }
  return <Modal open={open} title="덱 만들기" busy={busy} onClose={() => { if (!pending.current) onClose() }} footer={<>
    {error && <p className="form-error" role="alert">{error}</p>}
    <Button variant="primary" disabled={busy} onClick={() => void create()}>{busy ? '만드는 중…' : '만들기'}</Button>
    <Button disabled={busy} onClick={onClose}>취소</Button>
  </>}>
    <fieldset className="form-fields" disabled={busy}>
      <Field label="이름" value={name} onChange={(event) => setName(event.target.value)} autoFocus placeholder="예: 매일 외울 영어 단어" />
      <Field label="설명 · 선택" as="textarea" value={description} onChange={(event) => setDescription(event.target.value)} />
      <Tabs label="덱 유형" options={deckModeOptions} value={flipOnly ? 'flip' : 'word'} onChange={(value) => setFlipOnly(value === 'flip')} />
      <p className="form-hint">{deckModeHint}</p>
    </fieldset>
  </Modal>
}
