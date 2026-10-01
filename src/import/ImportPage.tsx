import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createCards, getDeck } from '../db'
import { type CardInput } from '../types'
import { Button, Field, Screen, Tabs, type TabOption } from '../ui'
import { parsePasteDetailed, type PasteIssue, type PasteOptions } from './parsePaste'
import { readDecksFromFile, validateCards, type ImportError } from './validate'
import { downloadJson } from '../lib/download'
import './ImportPage.css'

const SAMPLE_PASTE = 'cohesion\t응집도\ncoupling\t결합도'
const SAMPLE_JSON = `{
  "cards": [
    { "type": "term", "front": "cohesion", "back": "응집도",
      "tags": ["소프트웨어설계"], "explanation": "결합도와 짝으로 외운다." },
    { "type": "mcq", "question": "다음 중 응집도가 가장 높은 것은?",
      "choices": ["우연적 응집도", "논리적 응집도", "기능적 응집도", "시간적 응집도"],
      "answer": 2, "explanation": "기능적 응집도가 가장 높다." }
  ]
}`

const tabOptions: TabOption<'json' | 'paste'>[] = [
  { value: 'paste', label: '붙여넣기' },
  { value: 'json', label: 'JSON 파일' },
]
const issueMessage: Record<PasteIssue['reason'], string> = {
  'missing-separator': '앞뒤 구분자가 없습니다. 구분자 설정을 확인해 주세요.',
  'empty-front': '앞면이 비어 있습니다. 앞면 내용을 넣어 주세요.',
  'empty-back': '뒷면이 비어 있습니다. 뒷면 내용을 넣어 주세요.',
}
const makeError = (message: string): ImportError[] => [{ index: 0, message }]

export const ImportPage = () => {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'json' | 'paste'>('paste')
  const [jsonOk, setJsonOk] = useState<CardInput[]>([])
  const [jsonErrors, setJsonErrors] = useState<ImportError[]>([])
  const [jsonFileName, setJsonFileName] = useState('')
  const [jsonReading, setJsonReading] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteOptions, setPasteOptions] = useState<PasteOptions>({ cardSep: 'newline', fieldSep: 'tab' })
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const fileReadId = useRef(0)

  useEffect(() => {
    if (!deckId) {
      navigate('/')
      return
    }
    void getDeck(deckId).then((deck) => { if (!deck) navigate('/') }).catch(() => setSaveError('덱을 확인하지 못했습니다. 덱으로 돌아가 다시 열어 주세요.'))
  }, [deckId, navigate])

  const pasteResult = useMemo(() => parsePasteDetailed(pasteText, pasteOptions), [pasteText, pasteOptions])
  const activeOk = tab === 'json' ? jsonOk : pasteResult.cards
  const activeErrors = tab === 'json' ? jsonErrors : pasteResult.issues.map((issue) => ({
    index: issue.line, message: `${issue.line}행: ${issueMessage[issue.reason]}`, text: issue.text,
  }))
  const hasInput = tab === 'json' ? Boolean(jsonFileName) : pasteText.trim().length > 0
  const reading = tab === 'json' && jsonReading

  const handleJsonFile = async (event: ChangeEvent<HTMLInputElement>) => {
    if (savingRef.current) return
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    const readId = ++fileReadId.current
    setJsonFileName(file.name)
    setJsonOk([])
    setJsonErrors([])
    setJsonReading(true)
    setSaveError('')

    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (readId !== fileReadId.current) return
      const fileDecks = readDecksFromFile(parsed)
      if (!fileDecks) {
        setJsonErrors(makeError('파일 형식이 올바르지 않습니다. cards 배열이 있는 JSON 파일을 선택해 주세요.'))
        return
      }
      const result = validateCards(fileDecks.flatMap((fileDeck) => fileDeck.cards))
      setJsonOk(result.ok)
      setJsonErrors(result.errors)
    } catch {
      if (readId === fileReadId.current) setJsonErrors(makeError('JSON 파일을 읽을 수 없습니다. 파일 내용을 확인해 주세요.'))
    } finally {
      if (readId === fileReadId.current) setJsonReading(false)
    }
  }

  const clearCurrent = () => {
    if (savingRef.current) return
    setSaveError('')
    if (tab === 'json') {
      fileReadId.current += 1
      setJsonReading(false)
      setJsonFileName('')
      setJsonOk([])
      setJsonErrors([])
    } else {
      setPasteText('')
    }
  }

  const importCards = async () => {
    if (!deckId || activeOk.length === 0 || savingRef.current || reading) return
    savingRef.current = true
    setSaving(true)
    setSaveError('')
    try {
      await createCards(deckId, activeOk)
      navigate(`/deck/${deckId}`)
    } catch {
      setSaveError('카드를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const footer = <>
    <Button variant="primary" onClick={importCards} disabled={activeOk.length === 0 || saving || reading}>
      {saving ? '저장 중…' : activeErrors.length > 0 ? `정상 카드 ${activeOk.length}장만 넣기` : `${activeOk.length}장 넣기`}
    </Button>
    {activeErrors.length > 0 && <Button variant="ghost" onClick={clearCurrent} disabled={saving}>전부 취소</Button>}
  </>

  return (
    <Screen title="불러오기" back={saving ? undefined : () => { if (!savingRef.current) navigate(`/deck/${deckId ?? ''}`) }} foot={footer}>
      <fieldset className="import__form" disabled={saving} aria-busy={saving}>
        <Tabs options={tabOptions} value={tab} onChange={(value) => { if (!savingRef.current) { setTab(value); setSaveError('') } }} label="불러오기 방식" />

        {tab === 'json' ? <section className="import__section">
          <h2>JSON 파일에서 가져오기</h2>
          <p className="import__hint">단어 카드와 객관식 카드를 가져올 수 있습니다. 파일을 고르면 저장할 카드를 먼저 보여 드립니다.</p>
          <p className="import__hint">파일의 덱 이름과 관계없이 현재 덱에 카드를 추가합니다. 학습 기록은 가져오지 않습니다.</p>
          <Field as="input" type="file" accept=".json,application/json" label="JSON 파일 선택" onChange={handleJsonFile} />
          {jsonFileName && <p className="import__filename">선택한 파일: {jsonFileName}</p>}
          <details className="import__details">
            <summary>JSON 형식과 예시 보기</summary>
            <div className="import__details-content">
              <p className="import__hint">term은 앞면(front)과 뒷면(back), mcq는 문제(question), 보기(choices), 정답 번호(answer)를 씁니다. 정답 번호는 0부터 셉니다.</p>
              <p className="import__hint">id·stats·deckId는 쓰지 않아도 됩니다. 쉼표와 따옴표를 포함한 JSON 형식을 확인해 주세요.</p>
              <pre className="import__sample">{SAMPLE_JSON}</pre>
              <Button onClick={() => downloadJson('memonowz-sample.json', JSON.parse(SAMPLE_JSON))}>JSON 예시 파일 받기</Button>
            </div>
          </details>
        </section> : <section className="import__section">
          <h2>복사한 카드 붙여넣기</h2>
          <p className="import__hint" id="paste-help">Excel이나 Google Sheets에서 앞면과 뒷면 두 열을 제목 행 없이 복사해 아래에 붙여넣으세요. 한 행이 카드 한 장이 됩니다.</p>
          <div className="import__example">
            <table aria-label="두 열로 작성하는 카드 예시">
              <thead><tr><th scope="col">앞면</th><th scope="col">뒷면</th></tr></thead>
              <tbody><tr><td>cohesion</td><td>응집도</td></tr><tr><td>coupling</td><td>결합도</td></tr></tbody>
            </table>
            <Button onClick={() => { setPasteText(SAMPLE_PASTE); setPasteOptions({ cardSep: 'newline', fieldSep: 'tab' }); setSaveError('') }}>예시 넣어 보기</Button>
          </div>
          <Field as="textarea" label="카드 목록" aria-describedby="paste-help" rows={6} value={pasteText} onChange={(event) => { setPasteText(event.target.value); setSaveError('') }} placeholder={'cohesion\t응집도\ncoupling\t결합도'} />
          <div className="import__options">
            <label className="import__select-label">카드 나누기
              <select className="import__select" aria-label="카드 나누기" value={pasteOptions.cardSep} onChange={(event) => setPasteOptions({ ...pasteOptions, cardSep: event.target.value as PasteOptions['cardSep'] })}>
                <option value="newline">한 줄에 한 장</option><option value="blank">빈 줄 사이에 한 장</option>
              </select>
            </label>
            <label className="import__select-label">앞뒤 나누기
              <select className="import__select" aria-label="앞뒤 나누기" value={pasteOptions.fieldSep} onChange={(event) => setPasteOptions({ ...pasteOptions, fieldSep: event.target.value as PasteOptions['fieldSep'] })}>
                <option value="tab">탭 (Excel·Sheets)</option><option value="comma">쉼표</option><option value="newline">줄바꿈</option><option value="custom">직접 입력</option>
              </select>
            </label>
          </div>
          {pasteOptions.fieldSep === 'custom' && <Field label="직접 입력한 구분자" value={pasteOptions.custom ?? ''} onChange={(event) => setPasteOptions({ ...pasteOptions, custom: event.target.value })} placeholder="예: ::" />}
          <p className="import__hint">메모는 앞면::뒷면처럼 써도 됩니다. 앞뒤 나누기에서 직접 입력을 고르고 ::를 넣으세요. 처음 나온 구분자 뒤의 내용은 모두 뒷면으로 가져옵니다.</p>
          {pasteOptions.fieldSep === 'newline' && <p className="import__hint">앞면과 뒷면을 서로 다른 줄에 쓰고, 카드 사이는 빈 줄로 나눠 주세요. 카드 나누기도 ‘빈 줄 사이에 한 장’으로 선택하세요.</p>}
          {pasteOptions.fieldSep === 'comma' && <p className="import__hint">첫 쉼표에서 앞뒤를 나눕니다. 따옴표를 처리하는 CSV 파일 형식은 지원하지 않습니다.</p>}
          {pasteOptions.fieldSep === 'custom' && !pasteOptions.custom && <p className="import__hint">구분자를 비워 두면 탭으로 나눕니다.</p>}
        </section>}
      </fieldset>

      <p className="import__count" role="status">{reading ? '파일을 읽는 중…' : `저장할 카드 ${activeOk.length}장`}</p>
      {tab === 'paste' && hasInput && pasteResult.ignoredBlankCount > 0 && <p className="import__hint">내용이 없는 줄 또는 묶음 {pasteResult.ignoredBlankCount}개는 건너뛰었습니다.</p>}
      {hasInput && activeErrors.length > 0 && <section className="import__errors" role="alert">
        <strong>제외되는 카드 {activeErrors.length}건</strong>
        <p>아래 내용을 고치거나, 정상 카드만 넣을 수 있습니다.</p>
        <ul>{activeErrors.map((error, index) => <li key={`${error.index}-${index}`}>
          <p>{error.message}</p>
          {'text' in error && <pre className="import__invalid-text">{String(error.text)}</pre>}
        </li>)}</ul>
      </section>}
      {activeOk.length > 0 && <section className="import__preview" aria-label="저장 전 미리보기">
        <div className="import__preview-heading"><h2>저장 전 미리보기</h2>{activeOk.length > 3 && <span>전체 {activeOk.length}장 중 처음 3장</span>}</div>
        <ol>{activeOk.slice(0, 3).map((card, index) => <li key={index}>
          {card.type === 'term' ? <div className="import__term-preview"><div><span className="import__preview-label">앞면</span><p>{card.front}</p></div><div><span className="import__preview-label">뒷면</span><p>{card.back}</p></div></div>
            : <div className="import__mcq-preview"><span className="import__preview-label">객관식</span><p>{card.question}</p><ol>{card.choices.map((choice, choiceIndex) => <li key={choiceIndex}>{choice}</li>)}</ol><p className="import__answer">정답: {card.answer + 1}. {card.choices[card.answer]}</p></div>}
          {card.explanation && <p className="import__hint">설명: {card.explanation}</p>}
        </li>)}</ol>
      </section>}
      {hasInput && !reading && activeOk.length === 0 && activeErrors.length === 0 && <p className="import__hint">가져올 카드가 없습니다. 앞면과 뒷면이 있는 내용을 넣어 주세요.</p>}
      {saveError && <p className="import__save-error" role="alert">{saveError}</p>}
    </Screen>
  )
}
