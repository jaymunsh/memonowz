import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CardEditor } from '../card/CardEditor'
import {
  clearSession,
  getSession,
  deleteDeck,
  getDeck,
  listCards,
  updateDeck,
} from '../db'
import { cardAnswer, cardPrompt, cardTypeLabel, type ActiveSession, type Card, type CardType, type Deck } from '../types'
import { wrongCards, type StudyOrder } from '../study/engine'
import { Badge, Button, EmptyState, Field, Modal, Screen, type TabOption } from '../ui'
import './DeckPage.css'

type CardFilter = 'all' | CardType | 'wrong' | 'starred'

const cardSearchText = (card: Card) => {
  if (card.type === 'term') return [card.front, card.back, card.explanation].filter(Boolean).join(' ')
  if (card.type === 'mcq') return [card.question, ...card.choices, card.explanation].filter(Boolean).join(' ')
  return [card.question, card.answer, card.explanation].filter(Boolean).join(' ')
}

const typeLabel = (type: CardType) => cardTypeLabel[type]

const filterLabel = (filter: CardFilter) => {
  if (filter === 'all') return '전체'
  if (filter === 'wrong') return '틀림'
  if (filter === 'starred') return '★ 핵심'
  return typeLabel(filter)
}

type StudySize = '10' | '20' | '50' | 'all'

const sizeOptions: TabOption<StudySize>[] = [
  { value: '10', label: '10장' },
  { value: '20', label: '20장' },
  { value: '50', label: '50장' },
  { value: 'all', label: '전체' },
]

const orderOptions: TabOption<StudyOrder>[] = [
  { value: 'alpha', label: '글자순' },
  { value: 'random', label: '랜덤순' },
  { value: 'wrong', label: '오답노트' },
  { value: 'starred', label: '★ 핵심' },
]

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
  const [order, setOrder] = useState<StudyOrder>('random')
  const [size, setSize] = useState<StudySize>('20')
  const [session, setSession] = useState<ActiveSession>()
  const pool =
    order === 'wrong' ? wrongCards(cards).length
      : order === 'starred' ? cards.filter((card) => card.starred).length
        : cards.length
  const studyCount = size === 'all' ? pool : Math.min(pool, Number(size))
  const menuRef = useRef<HTMLDetailsElement>(null)
  const closeMenu = () => menuRef.current?.removeAttribute('open')

  // 메뉴 밖을 누르면 닫는다. details는 스스로 닫히지 않는다
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) closeMenu()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const loadDeck = async () => {
    if (!deckId) return
    const [nextDeck, nextCards, nextSession] = await Promise.all([
      getDeck(deckId), listCards(deckId), getSession(deckId),
    ])
    setDeck(nextDeck)
    setCards(nextCards)
    setSession(nextSession)
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
      const matchesType =
        filter === 'all' ? true
          : filter === 'wrong' ? card.stats.wrong > 0
            : filter === 'starred' ? card.starred
              : card.type === filter
      const matchesQuery = !normalized || cardSearchText(card).toLocaleLowerCase().includes(normalized)
      return matchesType && matchesQuery
    })
  }, [cards, filter, query])

  const counts = useMemo(() => ({
    all: cards.length,
    term: cards.filter((card) => card.type === 'term').length,
    mcq: cards.filter((card) => card.type === 'mcq').length,
    qa: cards.filter((card) => card.type === 'qa').length,
    wrong: wrongCards(cards).length,
    starred: cards.filter((card) => card.starred).length,
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

  const limit = size === 'all' ? undefined : Number(size)

  const startStudy = () => {
    if (!deckId || cards.length === 0) return
    navigate(`/study/${deckId}`, { state: { order, limit } })
  }

  const startBrowse = () => {
    if (!deckId || studyCount === 0) return
    navigate(`/browse/${deckId}`, { state: { order, limit } })
  }

  // 이어하기 중인 세션은 시작할 때 정한 순서를 그대로 쓴다. 순서를 바꾸려면 새로 시작해야 한다
  const restartStudy = async () => {
    if (!deckId || cards.length === 0) return
    await clearSession(deckId)
    setSession(undefined)
    navigate(`/study/${deckId}`, { state: { order } })
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
      action={
        <details className="deck__menu" ref={menuRef}>
          <summary aria-label="덱 메뉴">⋯</summary>
          <div className="deck__menu-items">
            <button type="button" onClick={() => { closeMenu(); openNewCard() }}>카드 추가</button>
            <Link to={`/deck/${deck.id}/import`}>불러오기</Link>
            <button type="button" onClick={() => { closeMenu(); openEdit() }}>덱 편집</button>
          </div>
        </details>
      }
      foot={
        <div className="deck__foot">
          <div className="deck__opts">
            <select
              className="deck__opt"
              aria-label="학습 순서"
              value={order}
              onChange={(event) => setOrder(event.target.value as StudyOrder)}
            >
              {orderOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              className="deck__opt"
              aria-label="한 번에 풀 양"
              value={size}
              onChange={(event) => setSize(event.target.value as StudySize)}
            >
              {sizeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          {session && (
            <Button block onClick={startStudy}>
              이어하기 {session.cursor}/{session.cardIds.length}
            </Button>
          )}
          <div className="deck__foot-row">
            <Button onClick={startBrowse} disabled={studyCount === 0}>공부하기</Button>
            <Button variant="primary" onClick={() => void restartStudy()} disabled={studyCount === 0}>
              시험보기 ({studyCount}장)
            </Button>
          </div>
        </div>
      }
    >
      <Field
        label="검색"
        placeholder="카드 검색"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="deck__filters" aria-label="유형 필터">
        {(['all', 'term', 'mcq', 'qa', 'wrong', 'starred'] as const).map((value) => (
          <button
            className="deck__filter"
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            <Badge tone={filter === value ? (value === 'wrong' ? 'bad' : 'accent') : 'neutral'}>
              {filterLabel(value)} {counts[value]}
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
              <span className="deck__card-text">
                <strong className="deck__card-front">{cardPrompt(card)}</strong>
                <span className="deck__card-back">{cardAnswer(card)}</span>
              </span>
              <span className="deck__card-badges">
                <Badge>{typeLabel(card.type)}</Badge>
                {card.stats.wrong > 0 && <Badge tone="bad">틀림 {card.stats.wrong}</Badge>}
                {card.starred && <Badge tone="accent">★ 핵심</Badge>}
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

    </Screen>
  )
}
