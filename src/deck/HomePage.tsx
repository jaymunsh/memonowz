import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listSessions, listDeckSummaries } from '../db'
import type { ActiveSession, DeckSummary } from '../types'
import { Badge, Button, EmptyState, Icon, ProgressBar, Screen } from '../ui'
import { CreateDeckDialog } from '../app/CreateDeckDialog'
import './HomePage.css'

export const HomePage = () => {
  const navigate = useNavigate()
  const [decks, setDecks] = useState<DeckSummary[]>([])
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    Promise.all([listDeckSummaries(), listSessions()]).then(([nextDecks, nextSessions]) => {
      if (mounted) { setDecks(nextDecks); setSessions(nextSessions) }
    }).catch(() => { if (mounted) setError('덱을 불러오지 못했습니다. 다시 시도해 주세요.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [attempt])
  const byDeck = new Map(sessions.map((session) => [session.deckId, session]))
  const active = (deckId: string) => { const session = byDeck.get(deckId); return Boolean(session && session.cursor < session.cardIds.length) }
  const sorted = [...decks].sort((a, b) => Number(active(b.id)) - Number(active(a.id)))

  return <>
    <Screen title="Memonowz" logo action={<><Link className="home__history" to="/history">학습 기록</Link><Link className="home__settings" to="/settings" aria-label="설정" title="설정"><Icon name="settings" /></Link></>}>
      {loading ? <EmptyState>덱을 불러오는 중입니다.</EmptyState> : error ? <div className="home__empty">
        <p role="alert" className="home__error">{error}</p><Button onClick={retry}>다시 시도</Button>
      </div> : decks.length === 0 ? <div className="home__empty">
        <Icon name="cards" size={40} />
        <h2>첫 덱을 만들어 보세요</h2>
        <p>단어와 문제를 묶어 공부하고,<br />틀린 카드만 다시 풀어보세요.</p>
        <Button variant="primary" onClick={() => setCreateOpen(true)}><Icon name="plus" size={18} />덱 만들기</Button>
        <Link to="/settings">예시 덱으로 먼저 둘러보기</Link>
      </div> : <>
        <div className="home__intro"><div><h2>내 덱</h2><p>{decks.length}덱 · {decks.reduce((n, deck) => n + deck.cardCount, 0)}장</p></div>
          <Button onClick={() => setCreateOpen(true)}><Icon name="plus" size={18} />덱 만들기</Button>
        </div>
        <div className="home__list">{sorted.map((deck) => {
          const session = byDeck.get(deck.id)
          const completed = session && session.cursor >= session.cardIds.length
          return <Link className={`home__deck${active(deck.id) ? ' home__deck--active' : ''}`} key={deck.id} to={`/deck/${deck.id}`}>
            <div className="home__deck-head"><h2 className="home__deck-name">{deck.name}</h2>
              {session && <Badge tone="accent">{completed ? '결과 보기' : `이어하기 ${session.cursor}/${session.cardIds.length}`}</Badge>}
            </div>
            {deck.description && <p className="home__description">{deck.description}</p>}
            {session && !completed && <div className="home__progress"><ProgressBar value={session.cursor} max={session.cardIds.length} /></div>}
            <div className="home__deck-meta">
              <span>{deck.flipOnly ? '플래시카드' : '단어장'}</span><span>{deck.cardCount}장</span>
              <span>{deck.accuracy === null ? '아직 안 품' : `정답률 ${Math.round(deck.accuracy * 100)}%`}</span>
            </div>
          </Link>
        })}</div>
      </>}
    </Screen>
    <CreateDeckDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(deck) => navigate(`/deck/${deck.id}`)} />
  </>
}
