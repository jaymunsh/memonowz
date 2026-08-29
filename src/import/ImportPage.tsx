import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createCards, getDeck } from '../db'
import { backupSchema, type CardInput } from '../types'
import { Button, Field, Screen, Tabs, type TabOption } from '../ui'
import { parsePaste, type PasteOptions } from './parsePaste'
import { validateCards, type ImportError } from './validate'
import './ImportPage.css'

const SAMPLE_JSON = `{
  "deck": { "name": "정보처리기사 1과목", "description": "2024 기출" },
  "cards": [
    { "type": "term", "front": "cohesion", "back": "응집도 — 모듈 내부 요소들이 하나의 목적에 얼마나 모여 있는가",
      "tags": ["소프트웨어설계"], "explanation": "결합도와 짝으로 외운다." },
    { "type": "mcq", "question": "다음 중 응집도가 가장 높은 것은?",
      "choices": ["우연적 응집도", "논리적 응집도", "기능적 응집도", "시간적 응집도"],
      "answer": 2, "explanation": "기능적 > 순차적 > 교환적 > 절차적 > 시간적 > 논리적 > 우연적 순." },
    { "type": "qa", "question": "React에서 useMemo를 언제 쓰는가?",
      "answer": "계산 비용이 큰 값이 매 렌더마다 다시 계산되는 것을 막을 때.", "tags": ["react"] }
  ]
}`

const tabOptions: TabOption<'json' | 'paste'>[] = [
  { value: 'json', label: 'JSON' },
  { value: 'paste', label: '붙여넣기' },
]

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined

const makeError = (message: string): ImportError[] => [{ index: 0, message }]

const downloadJson = (filename: string, value: unknown) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export const ImportPage = () => {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'json' | 'paste'>('json')
  const [jsonOk, setJsonOk] = useState<CardInput[]>([])
  const [jsonErrors, setJsonErrors] = useState<ImportError[]>([])
  const [jsonFileName, setJsonFileName] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [pasteOptions, setPasteOptions] = useState<PasteOptions>({ cardSep: 'newline', fieldSep: 'tab' })
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!deckId) {
      navigate('/')
      return
    }
    void getDeck(deckId).then((deck) => { if (!deck) navigate('/') })
  }, [deckId, navigate])

  const pasteCards = useMemo(() => parsePaste(pasteText, pasteOptions), [pasteText, pasteOptions])
  const activeOk = tab === 'json' ? jsonOk : pasteCards
  const activeErrors = tab === 'json' ? jsonErrors : []
  const hasInput = tab === 'json' ? Boolean(jsonFileName) : pasteText.length > 0

  const handleJsonFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setJsonFileName(file.name)
    setJsonOk([])
    setJsonErrors([])
    setSaveError('')

    try {
      const parsed: unknown = JSON.parse(await file.text())
      const root = asRecord(parsed)
      if (!root || !Array.isArray(root.cards)) {
        setJsonErrors(makeError('파일 형식이 올바르지 않습니다: cards 배열이 필요합니다.'))
        return
      }
      const envelope = backupSchema.safeParse({ deck: root.deck, cards: [] })
      if (!envelope.success) {
        const issue = envelope.error.issues[0]
        setJsonErrors(makeError(`파일 형식이 올바르지 않습니다: ${issue.message}`))
        return
      }
      const result = validateCards(root.cards)
      setJsonOk(result.ok)
      setJsonErrors(result.errors)
    } catch {
      setJsonErrors(makeError('JSON 파일을 읽을 수 없습니다.'))
    }
  }

  const clearCurrent = () => {
    setSaveError('')
    if (tab === 'json') {
      setJsonFileName('')
      setJsonOk([])
      setJsonErrors([])
    } else {
      setPasteText('')
    }
  }

  const importCards = async () => {
    if (!deckId || activeOk.length === 0 || saving) return
    setSaving(true)
    setSaveError('')
    try {
      await createCards(deckId, activeOk)
      navigate(`/deck/${deckId}`)
    } catch {
      setSaveError('카드를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  const footer = activeErrors.length > 0
    ? <><Button variant="primary" onClick={importCards} disabled={activeOk.length === 0 || saving}>
      통과분 {activeOk.length}장만 넣기
    </Button><Button variant="ghost" onClick={clearCurrent}>전부 취소</Button></>
    : <Button variant="primary" onClick={importCards} disabled={activeOk.length === 0 || saving}>
      {activeOk.length}장 넣기
    </Button>

  return (
    <Screen title="불러오기" back={() => navigate(`/deck/${deckId ?? ''}`)} foot={footer}>
      <Tabs options={tabOptions} value={tab} onChange={(value) => setTab(value as 'json' | 'paste')} label="불러오기 방식" />

      {tab === 'json' ? <section className="import__section">
        <h2>유형별 JSON 카드</h2>
        <p className="import__hint">type은 term(단어) · mcq(객관식) · qa(주관식) 셋 중 하나입니다. term은 앞면과 뒷면, mcq는 0부터 세는 정답 번호, qa는 질문과 답을 씁니다.</p>
        <p className="import__hint">불러올 파일에는 id·stats·deckId를 쓰지 않습니다. JSON의 deck 이름은 무시하고 현재 덱에 카드를 붙입니다.</p>
        <pre className="import__sample">{SAMPLE_JSON}</pre>
        <Button onClick={() => downloadJson('memonowz-sample.json', JSON.parse(SAMPLE_JSON))}>샘플 받기</Button>
        <Field as="input" type="file" accept="application/json" label="JSON 파일 선택" onChange={handleJsonFile} />
        {jsonFileName && <p className="import__filename">선택한 파일: {jsonFileName}</p>}
      </section> : <section className="import__section">
        <h2>텍스트 붙여넣기</h2>
        <Field as="textarea" label="카드 목록" value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder="앞면\t뒷면\n앞면\t뒷면" />
        <div className="import__options">
          <label className="import__select-label">카드 구분자
            <select className="import__select" value={pasteOptions.cardSep} onChange={(event) => setPasteOptions({ ...pasteOptions, cardSep: event.target.value as PasteOptions['cardSep'] })}>
              <option value="newline">한 줄씩</option><option value="blank">빈 줄로</option>
            </select>
          </label>
          <label className="import__select-label">앞뒤 구분자
            <select className="import__select" value={pasteOptions.fieldSep} onChange={(event) => setPasteOptions({ ...pasteOptions, fieldSep: event.target.value as PasteOptions['fieldSep'] })}>
              <option value="tab">탭</option><option value="comma">쉼표</option><option value="newline">줄바꿈</option><option value="custom">직접 입력</option>
            </select>
          </label>
        </div>
        {pasteOptions.fieldSep === 'custom' && <Field label="직접 입력" value={pasteOptions.custom ?? ''} onChange={(event) => setPasteOptions({ ...pasteOptions, custom: event.target.value })} placeholder="예: ::" />}
        <p className="import__count" aria-live="polite">{pasteCards.length}장이 인식되었습니다</p>
        {pasteCards.length > 0 && <div className="import__preview"><strong>미리보기</strong>{pasteCards.slice(0, 3).map((card, index) => card.type === 'term' && <p key={`${card.front}-${index}`}><span>{card.front}</span><span>{card.back}</span></p>)}</div>}
      </section>}

      {hasInput && activeErrors.length > 0 && <section className="import__errors" role="alert">
        <strong>검증 실패 {activeErrors.length}건</strong>
        {activeErrors.map((error) => <p key={`${error.index}-${error.message}`}>{error.message}</p>)}
      </section>}
      {saveError && <p className="import__save-error" role="alert">{saveError}</p>}
    </Screen>
  )
}
