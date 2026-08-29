import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createDeck, getActiveSession, listDeckSummaries } from '../db'
import type { ActiveSession, DeckSummary } from '../types'
import { Badge, Button, EmptyState, Field, Modal, ProgressBar, Screen } from '../ui'
import './HomePage.css'

const deckAccuracy = (accuracy: number | null) =>
  accuracy === null ? '아직 안 품' : `정답률 ${Math.round(accuracy * 100)}%`

export const HomePage = () => {
  const [decks, setDecks] = useState<DeckSummary[]>([])
  const [session, setSession] = useState<ActiveSession>()
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const loadDecks = async () => {
    const [nextDecks, nextSession] = await Promise.all([
      listDeckSummaries(),
      getActiveSession(),
    ])
    setDecks(nextDecks)
    setSession(nextSession)
  }

  useEffect(() => {
    let mounted = true
    Promise.all([listDeckSummaries(), getActiveSession()]).then(([nextDecks, nextSession]) => {
      if (!mounted) return
      setDecks(nextDecks)
      setSession(nextSession)
    })
    return () => { mounted = false }
  }, [])

  const openModal = () => {
    setName('')
    setDescription('')
    setError(null)
    setModalOpen(true)
  }

  const saveDeck = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('덱 이름을 입력하세요.')
      return
    }

    await createDeck({
      name: trimmedName,
      ...(description.trim() ? { description: description.trim() } : {}),
    })
    await loadDecks()
    setModalOpen(false)
  }

  const activeDeck = session ? decks.find((deck) => deck.id === session.deckId) : undefined
  const otherDecks = activeDeck ? decks.filter((deck) => deck.id !== activeDeck.id) : decks

  return (
    <Screen
      title="Memonowz"
      action={
        <div className="home__actions">
          <Link className="home__settings" to="/settings" aria-label="설정">설정</Link>
          <Button onClick={openModal}>+ 덱</Button>
        </div>
      }
    >
      {decks.length === 0 ? (
        <EmptyState>아직 덱이 없습니다. 덱을 만들어 시작하세요.</EmptyState>
      ) : (
        <div className="home__list">
          {activeDeck && session && (
            <Link className="home__deck home__deck--active" to={`/study/${activeDeck.id}`}>
              <div className="home__deck-head">
                <h2 className="home__deck-name">{activeDeck.name}</h2>
                <Badge tone="accent">이어하기 {session.cursor}/{session.cardIds.length}</Badge>
              </div>
              <div className="home__progress">
                <ProgressBar value={session.cursor} max={session.cardIds.length} />
              </div>
              <div className="home__deck-meta">
                <span>카드 {activeDeck.cardCount}장</span>
                <span>{deckAccuracy(activeDeck.accuracy)}</span>
              </div>
            </Link>
          )}

          {otherDecks.map((deck) => (
            <Link className="home__deck" key={deck.id} to={`/deck/${deck.id}`}>
              <div className="home__deck-head">
                <h2 className="home__deck-name">{deck.name}</h2>
              </div>
              <div className="home__deck-meta">
                <span>카드 {deck.cardCount}장</span>
                <span>{deckAccuracy(deck.accuracy)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title="덱 추가"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="primary" onClick={saveDeck}>저장</Button>
            <Button onClick={() => setModalOpen(false)}>취소</Button>
          </>
        }
      >
        <Field label="이름" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        <Field
          label="설명 · 선택"
          as="textarea"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        {error && <p className="home__error" role="alert">{error}</p>}
      </Modal>
    </Screen>
  )
}
