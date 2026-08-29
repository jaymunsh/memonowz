import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listSessions, listDeckSummaries } from '../db'
import type { ActiveSession, DeckSummary } from '../types'
import { Badge, EmptyState, ProgressBar, Screen } from '../ui'
import './HomePage.css'

const GearIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a1.9 1.9 0 1 1-2.69 2.69l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47v.17a1.9 1.9 0 0 1-3.8 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a1.9 1.9 0 1 1-2.69-2.69l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97H3.6a1.9 1.9 0 0 1 0-3.8h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a1.9 1.9 0 1 1 2.69-2.69l.06.06a1.6 1.6 0 0 0 1.77.32h.08A1.6 1.6 0 0 0 10.3 3.7v-.17a1.9 1.9 0 0 1 3.8 0v.09a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.9 1.9 0 1 1 2.69 2.69l-.06.06a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.47.97h.17a1.9 1.9 0 0 1 0 3.8h-.09a1.6 1.6 0 0 0-1.46.97z" />
  </svg>
)

const deckAccuracy = (accuracy: number | null) =>
  accuracy === null ? '아직 안 품' : `정답률 ${Math.round(accuracy * 100)}%`

export const HomePage = () => {
  const [decks, setDecks] = useState<DeckSummary[]>([])
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  useEffect(() => {
    let mounted = true
    Promise.all([listDeckSummaries(), listSessions()]).then(([nextDecks, nextSessions]) => {
      if (!mounted) return
      setDecks(nextDecks)
      setSessions(nextSessions)
    })
    return () => { mounted = false }
  }, [])

  const sessionOf = (deckId: string) => sessions.find((session) => session.deckId === deckId)
  // 진행 중인 덱을 위로 올린다. 그 안에서는 원래 순서를 지킨다
  const sorted = [...decks].sort((a, b) => Number(Boolean(sessionOf(b.id))) - Number(Boolean(sessionOf(a.id))))

  return (
    <Screen
      title="Memonowz"
      logo
      action={
        <Link className="home__settings" to="/settings" aria-label="설정" title="설정">
          <GearIcon />
        </Link>
      }
    >
      {decks.length === 0 ? (
        <EmptyState>
          아직 덱이 없습니다. <Link to="/settings">설정</Link>에서 덱을 만들어 시작하세요.
        </EmptyState>
      ) : (
        <div className="home__list">
          {sorted.map((deck) => {
            const session = sessionOf(deck.id)
            return (
              <Link
                className={`home__deck${session ? ' home__deck--active' : ''}`}
                key={deck.id}
                to={session ? `/study/${deck.id}` : `/deck/${deck.id}`}
              >
                <div className="home__deck-head">
                  <h2 className="home__deck-name">{deck.name}</h2>
                  {session && <Badge tone="accent">이어하기 {session.cursor}/{session.cardIds.length}</Badge>}
                </div>
                {session && (
                  <div className="home__progress">
                    <ProgressBar value={session.cursor} max={session.cardIds.length} />
                  </div>
                )}
                <div className="home__deck-meta">
                  <span>카드 {deck.cardCount}장</span>
                  <span>{deckAccuracy(deck.accuracy)}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </Screen>
  )
}
