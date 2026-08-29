import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CardEditor } from '../card/CardEditor'
import {
  clearActiveSession,
  deleteDeck,
  getActiveSession,
  getDeck,
  listCards,
  updateDeck,
} from '../db'
import { cardTypeLabel, type Card, type CardType, type Deck } from '../types'
import { Badge, Button, EmptyState, Field, Modal, Screen } from '../ui'
import './DeckPage.css'

type CardFilter = 'all' | CardType

const cardFront = (card: Card) => card.type === 'term' ? card.front : card.question

const cardBack = (card: Card) => {
  if (card.type === 'term') return card.back
  if (card.type === 'qa') return card.answer
  return `정답: ${card.choices[card.answer] ?? ''}`
}

const cardSearchText = (card: Card) => {
  if (card.type === 'term') return [card.front, card.back, card.explanation].filter(Boolean).join(' ')
  if (card.type === 'mcq') return [card.question, ...card.choices, card.explanation].filter(Boolean).join(' ')
  return [card.question, card.answer, card.explanation].filter(Boolean).join(' ')
}

const typeLabel = (type: CardType) => cardTypeLabel[type]

export const DeckPage = () => {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const [deck, setDeck] = useState<Deck>()
  const [cards, setCards] = useState<Card[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CardFilter>('all')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorCard, setEditorCard] = useState<Card>()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [studyConfirmOpen, setStudyConfirmOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const loadDeck = async () => {
    if (!deckId) return
    const [nextDeck, nextCards] = await Promise.all([getDeck(deckId), listCards(deckId)])
    setDeck(nextDeck)
    setCards(nextCards)
    if (nextDeck) {
      setEditName(nextDeck.name)
      setEditDescription(nextDeck.description ?? '')
    }
  }

  useEffect(() => {
    void loadDeck()
  }, [deckId])

  const visibleCards = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return cards.filter((card) => {
      const matchesType = filter === 'all' || card.type === filter
      const matchesQuery = !normalized || cardSearchText(card).toLocaleLowerCase().includes(normalized)
      return matchesType && matchesQuery
    })
  }, [cards, filter, query])

  const counts = useMemo(() => ({
    all: cards.length,
    term: cards.filter((card) => card.type === 'term').length,
    mcq: cards.filter((card) => card.type === 'mcq').length,
    qa: cards.filter((card) => card.type === 'qa').length,
  }), [cards])

  const openNewCard = () => {
    setEditorCard(undefined)
    setEditorOpen(true)
  }

  const openCard = (card: Card) => {
    setEditorCard(card)
    setEditorOpen(true)
  }

  const openEdit = () => {
    if (!deck) return
    setEditName(deck.name)
    setEditDescription(deck.description ?? '')
    setEditError(null)
    setEditOpen(true)
  }

  const saveDeck = async () => {
    if (!deckId) return
    const name = editName.trim()
    if (!name) {
      setEditError('덱 이름을 입력하세요.')
      return
    }
    await updateDeck(deckId, {
      name,
      ...(editDescription.trim() ? { description: editDescription.trim() } : { description: undefined }),
    })
    await loadDeck()
    setEditOpen(false)
  }

  const removeDeck = async () => {
    if (!deckId) return
    await deleteDeck(deckId)
    navigate('/')
  }

  const startStudy = async () => {
    if (!deckId || cards.length === 0) return
    const activeSession = await getActiveSession()
    if (activeSession && activeSession.deckId !== deckId) {
      setStudyConfirmOpen(true)
      return
    }
    navigate(`/study/${deckId}`)
  }

  const discardSessionAndStart = async () => {
    await clearActiveSession()
    if (deckId) navigate(`/study/${deckId}`)
  }

  if (!deck) {
    return (
      <Screen title="덱을 찾을 수 없습니다" back={() => navigate('/')}>
        <EmptyState>덱이 없거나 삭제되었습니다.</EmptyState>
      </Screen>
    )
  }

  return (
    <Screen
      title={deck.name}
      back={() => navigate('/')}
      action={<Button onClick={openEdit}>덱 편집</Button>}
      foot={
        <>
          <Button onClick={openNewCard}>카드 추가</Button>
          <Link className="btn btn--ghost deck__import" to={`/deck/${deck.id}/import`}>임포트</Link>
          <Button variant="primary" onClick={startStudy} disabled={cards.length === 0}>학습 시작</Button>
        </>
      }
    >
      <Field
        label="검색"
        placeholder="카드 검색"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="deck__filters" aria-label="유형 필터">
        {(['all', 'term', 'mcq', 'qa'] as const).map((value) => (
          <button
            className="deck__filter"
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            <Badge tone={filter === value ? 'accent' : 'neutral'}>
              {value === 'all' ? '전체' : typeLabel(value)} {counts[value]}
            </Badge>
          </button>
        ))}
      </div>

      {cards.length === 0 ? (
        <EmptyState>아직 카드가 없습니다. 직접 추가하거나 JSON으로 가져오세요.</EmptyState>
      ) : visibleCards.length === 0 ? (
        <EmptyState>검색 조건에 맞는 카드가 없습니다.</EmptyState>
      ) : (
        <div className="deck__list">
          {visibleCards.map((card) => (
            <button className="deck__card" key={card.id} type="button" onClick={() => openCard(card)}>
              <Badge>{typeLabel(card.type)}</Badge>
              <span className="deck__card-text">
                <strong className="deck__card-front">{cardFront(card)}</strong>
                <span className="deck__card-back">{cardBack(card)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <CardEditor
        deckId={deck.id}
        open={editorOpen}
        card={editorCard}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { void loadDeck() }}
        onDeleted={() => { void loadDeck() }}
      />

      <Modal
        open={editOpen}
        title="덱 편집"
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Button variant="primary" onClick={saveDeck}>저장</Button>
            <Button onClick={() => setEditOpen(false)}>취소</Button>
            <Button variant="danger" onClick={() => { setEditOpen(false); setDeleteOpen(true) }}>덱 삭제</Button>
          </>
        }
      >
        <Field label="이름" value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus />
        <Field
          label="설명 · 선택"
          as="textarea"
          value={editDescription}
          onChange={(event) => setEditDescription(event.target.value)}
        />
        {editError && <p className="deck__error" role="alert">{editError}</p>}
      </Modal>

      <Modal
        open={deleteOpen}
        title="덱 삭제"
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Button variant="danger" onClick={removeDeck}>삭제</Button>
            <Button onClick={() => setDeleteOpen(false)}>취소</Button>
          </>
        }
      >
        <p className="deck__modal-copy">이 덱과 모든 카드를 삭제할까요?</p>
      </Modal>

      <Modal
        open={studyConfirmOpen}
        title="진행 중인 세션이 있습니다"
        onClose={() => setStudyConfirmOpen(false)}
        footer={
          <>
            <Button variant="danger" onClick={discardSessionAndStart}>버리고 시작</Button>
            <Button onClick={() => setStudyConfirmOpen(false)}>취소</Button>
          </>
        }
      >
        <p className="deck__modal-copy">다른 덱의 세션이 진행 중입니다. 버리고 새로 시작할까요?</p>
      </Modal>
    </Screen>
  )
}
