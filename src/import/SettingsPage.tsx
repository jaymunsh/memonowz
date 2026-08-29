import { useEffect, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { exportAll, importBackup, listDeckSummaries } from '../db'
import { allBackupSchema, type Backup } from '../types'
import { getThemePref, setThemePref, type ThemePref } from '../app/theme'
import { Button, Field, Screen, Tabs, type TabOption } from '../ui'
import { validateCards } from './validate'
import './SettingsPage.css'

const themeOptions: TabOption<ThemePref>[] = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
]

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined

const downloadJson = (filename: string, value: unknown) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const todayKey = () => {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}${month}${day}`
}

export const SettingsPage = () => {
  const navigate = useNavigate()
  const [theme, setTheme] = useState<ThemePref>(() => getThemePref())
  const [deckCount, setDeckCount] = useState(0)
  const [cardCount, setCardCount] = useState(0)
  const [backupResults, setBackupResults] = useState<string[]>([])
  const [backupError, setBackupError] = useState('')
  const [busy, setBusy] = useState(false)

  const refreshCounts = async () => {
    try {
      const summaries = await listDeckSummaries()
      setDeckCount(summaries.length)
      setCardCount(summaries.reduce((count, deck) => count + deck.cardCount, 0))
    } catch {
      setBackupError('덱 정보를 읽지 못했습니다.')
    }
  }

  useEffect(() => { void refreshCounts() }, [])

  const handleExport = async () => {
    setBackupError('')
    try {
      const backup = await exportAll()
      downloadJson(`memonowz-backup-${todayKey()}.json`, backup)
    } catch {
      setBackupError('백업 파일을 만들지 못했습니다.')
    }
  }

  const handleBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setBusy(true)
    setBackupError('')
    setBackupResults([])
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const root = asRecord(parsed)
      if (!root || !Array.isArray(root.decks)) {
        setBackupError('백업 형식이 올바르지 않습니다: decks 배열이 필요합니다.')
        return
      }
      const results: string[] = []
      for (const [index, rawDeck] of root.decks.entries()) {
        const record = asRecord(rawDeck)
        const cards = record?.cards
        const envelope = allBackupSchema.safeParse({ decks: [{ deck: record?.deck, cards: [] }] })
        if (!record || !Array.isArray(cards) || !envelope.success) {
          results.push(`${index + 1}번째 덱: 형식 오류 · 실패 1건`)
          continue
        }
        const result = validateCards(cards)
        const backup: Backup = { deck: envelope.data.decks[0].deck, cards: result.ok }
        await importBackup(backup)
        results.push(`${backup.deck.name}: ${result.ok.length}장 · 실패 ${result.errors.length}건`)
      }
      setBackupResults(results)
      await refreshCounts()
    } catch {
      setBackupError('백업 파일을 읽을 수 없습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="설정" back={() => navigate('/')}>
      <section className="settings__section">
        <h2>테마</h2>
        <Tabs options={themeOptions} value={theme} onChange={(value) => { setTheme(value); setThemePref(value) }} label="테마 선택" />
      </section>

      <section className="settings__section">
        <h2>전체 백업</h2>
        <p className="settings__hint">현재 {deckCount}덱 · {cardCount}장</p>
        <Button variant="primary" block onClick={handleExport}>모든 덱 내보내기 ({deckCount}덱 · {cardCount}장)</Button>
        <Field as="input" type="file" accept="application/json" label="백업 파일 가져오기" onChange={handleBackupFile} disabled={busy} />
        <p className="settings__hint">가져오기는 기존 덱을 지우지 않고 뒤에 덧붙입니다.</p>
      </section>

      {backupResults.length > 0 && <section className="settings__results" aria-live="polite">
        <strong>가져오기 결과</strong>
        {backupResults.map((result) => <p key={result}>{result}</p>)}
      </section>}
      {backupError && <p className="settings__error" role="alert">{backupError}</p>}
      <p className="settings__version">Memonowz 0.1.0</p>
    </Screen>
  )
}
