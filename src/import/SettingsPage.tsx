import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { exportAll, importBackups, listDeckSummaries, restoreAll } from '../db'
import { fullBackupSchema, type Backup, type FullBackup } from '../types'
import { getThemePref, setThemePref, type ThemePref } from '../app/theme'
import { readPreferences, updatePreferences, type TextSize } from '../app/preferences'
import { CreateDeckDialog } from '../app/CreateDeckDialog'
import { Button, Field, Modal, Screen, Tabs, type TabOption } from '../ui'
import { readDecksFromFile, validateCards } from './validate'
import { downloadJson } from '../lib/download'
import { version } from '../../package.json'
import sampleDeckJson from '../../docs/examples/sample-deck.json?raw'
import './SettingsPage.css'

const themeOptions: TabOption<ThemePref>[] = [
  { value: 'system', label: '시스템' }, { value: 'light', label: '라이트' }, { value: 'dark', label: '다크' },
]
const textSizeOptions: TabOption<TextSize>[] = [
  { value: 'normal', label: '기본' }, { value: 'large', label: '크게' }, { value: 'xlarge', label: '아주 크게' },
]
type Preview = { name: string; full?: FullBackup; legacy?: Backup[]; decks: number; cards: number; warnings: string[] }
const todayKey = () => new Date().toLocaleDateString('sv-SE').replaceAll('-', '')

export const SettingsPage = () => {
  const navigate = useNavigate()
  const [theme, setTheme] = useState<ThemePref>(() => getThemePref())
  const [textSize, setTextSize] = useState<TextSize>(() => readPreferences().textSize)
  const [preferenceMessage, setPreferenceMessage] = useState('')
  const [preferencePersisted, setPreferencePersisted] = useState(true)
  const [counts, setCounts] = useState<{ decks: number; cards: number }>()
  const [deckOpen, setDeckOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview>()
  const pending = useRef(false)

  const refreshCounts = async () => {
    try {
      const decks = await listDeckSummaries()
      setCounts({ decks: decks.length, cards: decks.reduce((n, deck) => n + deck.cardCount, 0) })
    } catch { setError('덱 정보를 읽지 못했습니다. 다시 시도해 주세요.') }
  }
  useEffect(() => { void refreshCounts() }, [])

  const readFile = async (text: string, name: string) => {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && 'version' in parsed) {
      const full = fullBackupSchema.safeParse(parsed)
      if (!full.success) throw new Error('백업 버전 또는 내용이 올바르지 않습니다. 파일을 확인해 주세요.')
      setPreview({ name, full: full.data, decks: full.data.decks.length, cards: full.data.cards.length, warnings: [] })
      return
    }
    const fileDecks = readDecksFromFile(parsed)
    if (!fileDecks) throw new Error('덱 파일 또는 Memonowz 전체 백업 파일을 선택해 주세요.')
    const legacy: Backup[] = []
    const warnings: string[] = []
    for (const [index, fileDeck] of fileDecks.entries()) {
      if (!fileDeck.deck) { warnings.push(`${index + 1}번째 덱: 이름이 없어 건너뜁니다.`); continue }
      const result = validateCards(fileDeck.cards)
      legacy.push({ deck: fileDeck.deck, cards: result.ok })
      warnings.push(...result.errors.map((item) => `${fileDeck.deck?.name}: ${item.message}`))
    }
    setPreview({ name, legacy, decks: legacy.length, cards: legacy.reduce((n, item) => n + item.cards.length, 0), warnings })
  }
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try { await readFile(await file.text(), file.name) }
    catch (cause) { setError(cause instanceof SyntaxError ? 'JSON을 읽지 못했습니다. 파일 형식을 확인해 주세요.' : cause instanceof Error ? cause.message : '파일을 읽지 못했습니다.') }
    finally { pending.current = false; setBusy(false) }
  }
  const restore = async () => {
    if (!preview || pending.current || preview.decks === 0) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      if (preview.full) await restoreAll(preview.full)
      else await importBackups(preview.legacy ?? [])
      setMessage(`${preview.decks}덱 · ${preview.cards}장을 가져왔습니다.${preview.full ? ' 학습 기록과 이어하기도 복원했습니다.' : ''}`)
      setPreview(undefined)
      await refreshCounts()
    } catch { setError('가져오기를 완료하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.') }
    finally { pending.current = false; setBusy(false) }
  }
  const handleExport = async () => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      downloadJson(`memonowz-backup-${todayKey()}.json`, await exportAll())
      setMessage('백업 파일을 만들었습니다. 다운로드한 파일을 안전한 곳에 보관하세요.')
    } catch { setError('백업 파일을 만들지 못했습니다. 다시 시도해 주세요.') }
    finally { pending.current = false; setBusy(false) }
  }

  return <Screen title="설정" back={() => navigate('/')}>
    <section className="settings__section"><h2>테마</h2>
      <Tabs options={themeOptions} value={theme} onChange={(value) => {
        try { setThemePref(value); setTheme(value) }
        catch { setError('테마 설정을 저장하지 못했습니다. 브라우저 저장소 설정을 확인해 주세요.') }
      }} label="테마 선택" />
    </section>
    <section className="settings__section" aria-labelledby="text-size-title"><h2 id="text-size-title">글자 크기</h2>
      <Tabs options={textSizeOptions} value={textSize} onChange={(value) => {
        const persisted = updatePreferences({ textSize: value })
        setTextSize(value)
        setPreferencePersisted(persisted)
        setPreferenceMessage(persisted ? '글자 크기를 저장했습니다.' : '글자 크기는 적용했습니다. 브라우저 저장소에 저장하지 못해 새로 열면 초기화될 수 있습니다.')
      }} label="글자 크기" />
      <div className="settings__text-example" aria-label="글자 크기 미리보기">
        <p className="settings__example-question">모듈 안의 요소가 한 목적에 모인 정도는?</p>
        <p className="settings__example-body">응집도 · 문제와 답을 편하게 읽을 수 있는 크기를 골라 보세요.</p>
      </div>
      <p className="settings__hint">문제, 답, 목록의 글자가 함께 바뀝니다.</p>
      {preferenceMessage && <p className={`settings__hint${preferencePersisted ? '' : ' settings__preference-warning'}`} role="status">{preferenceMessage}</p>}
    </section>
    <section className="settings__section"><h2>덱</h2>
      <p className="settings__hint">{counts ? `현재 ${counts.decks}덱 · ${counts.cards}장` : '덱 정보를 불러오는 중입니다.'}</p>
      <Button variant="primary" block disabled={busy} onClick={() => setDeckOpen(true)}>+ 덱 만들기</Button>
      <Button block disabled={busy} onClick={() => { setError(''); void readFile(sampleDeckJson, '예시 덱').catch(() => setError('예시 덱을 불러오지 못했습니다.')) }}>예시 덱 넣기</Button>
      <p className="settings__hint">단어장과 플래시카드 덱을 하나씩 넣어 두 유형을 둘러볼 수 있습니다.</p>
    </section>
    <section className="settings__section"><h2>학습 기록</h2>
      <Link className="settings__history-link" to="/history">날짜별 학습 기록 보기</Link>
    </section>
    <section className="settings__section"><h2>키보드로 학습하기</h2>
      <dl className="settings__shortcuts">
        <div><dt>시험</dt><dd>숫자 키로 보기 선택 · <kbd>Space</kbd>로 답 보기·다음</dd></div>
        <div><dt>뒤집기 채점</dt><dd><kbd>1</kbd> 몰랐음 · <kbd>2</kbd> 알았음</dd></div>
        <div><dt>공부</dt><dd><kbd>Space</kbd>로 답 보기·다음 · 방향키로 이동</dd></div>
      </dl>
    </section>
    <section className="settings__section"><h2>백업과 복원</h2>
      <p className="settings__hint">데이터는 이 브라우저에 저장됩니다. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 백업해 주세요.</p>
      <Button block disabled={busy} onClick={() => void handleExport()}>{busy && !preview ? '처리 중…' : '전체 백업 내보내기'}</Button>
      <Field type="file" accept="application/json,.json" label="백업 또는 덱 파일 가져오기" onChange={handleFile} disabled={busy} />
      <p className="settings__hint">전체 백업에는 카드, 덱 유형, 학습 기록과 이어하기가 포함됩니다. 가져올 때는 기존 덱을 유지하고 새 덱으로 추가합니다.</p>
    </section>
    {message && <p className="settings__notice" role="status">{message}</p>}
    {error && !preview && <div className="settings__error" role="alert"><p>{error}</p><Button disabled={busy} onClick={() => { setError(''); void refreshCounts() }}>다시 확인</Button></div>}
    <p className="settings__version">Memonowz {version}</p>
    <CreateDeckDialog open={deckOpen} onClose={() => setDeckOpen(false)} onCreated={(deck) => { setMessage(`“${deck.name}” 덱을 만들었습니다.`); void refreshCounts() }} />
    <Modal open={Boolean(preview)} title="가져오기 확인" busy={busy} onClose={() => { if (!pending.current) { setPreview(undefined); setError('') } }} footer={<>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button variant="primary" disabled={busy || !preview?.decks} onClick={() => void restore()}>{busy ? '가져오는 중…' : preview?.warnings.length ? '통과분만 가져오기' : '가져오기'}</Button>
      <Button disabled={busy} onClick={() => { setPreview(undefined); setError('') }}>취소</Button>
    </>}>
      {preview && <>
        <p className="settings__filename">{preview.name}</p>
        <p>{preview.decks}덱 · {preview.cards}장을 새 덱으로 추가합니다.</p>
        <p className="settings__hint">{preview.full ? '학습 기록과 이어하기도 함께 복원합니다.' : '카드 내용과 덱 유형을 가져옵니다. 이 파일에는 학습 기록이 없습니다.'}</p>
        {preview.warnings.length > 0 && <div className="settings__warnings" role="alert"><strong>가져오지 않는 항목 {preview.warnings.length}건</strong>{preview.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
      </>}
    </Modal>
  </Screen>
}
