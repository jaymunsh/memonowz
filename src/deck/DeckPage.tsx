import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { readPreferences, updatePreferences, type UserPreferences } from '../app/preferences'
import { CardEditor } from '../card/CardEditor'
import {
  clearSession,
  getSession,
  deleteDeck,
  exportDeck,
  getDeck,
  listCards,
  updateDeck,
} from '../db'
import { cardAnswer, cardPrompt, cardTypeLabel, deckModeHint, deckModeOptions, type ActiveSession, type Card, type CardType, type Deck } from '../types'
import { wrongCards, type StudyOrder } from '../study/engine'
import { Badge, Button, EmptyState, Field, Icon, Modal, ProgressBar, Screen, Tabs, type TabOption } from '../ui'
import { downloadJson } from '../lib/download'
import './DeckPage.css'

type CardFilter = 'all' | CardType | 'wrong' | 'starred'

const cardSearchText = (card: Card) => {
  const tags = card.tags.join(' ')
  if (card.type === 'term') return [card.front, card.back, card.explanation, tags].filter(Boolean).join(' ')
  return [card.question, ...card.choices, card.explanation, tags].filter(Boolean).join(' ')
}

const typeLabel = (type: CardType) => cardTypeLabel[type]

const filterLabel = (filter: CardFilter) => {
  if (filter === 'all') return '전체'
  if (filter === 'wrong') return '틀림'
  if (filter === 'starred') return '핵심'
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
  { value: 'random', label: '랜덤순' },
  { value: 'alpha', label: '글자순' },
]

export const DeckPage = () => {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [deck, setDeck] = useState<Deck>()
  const [cards, setCards] = useState<Card[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CardFilter>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorCard, setEditorCard] = useState<Card>()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [order, setOrder] = useState<StudyOrder>(() => readPreferences().studyOrder)
  const [size, setSize] = useState<StudySize>(() => readPreferences().studySize)
  const [timed, setTimed] = useState(() => readPreferences().studyTimed)
  const [showAnswers, setShowAnswers] = useState(() => readPreferences().showAnswers)
  const [preferenceNotice, setPreferenceNotice] = useState('')
  const [session, setSession] = useState<ActiveSession>()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const pending = useRef(false)
  const loadRequest = useRef(0)
  const menuRef = useRef<HTMLDetailsElement>(null)
  const closeMenu = () => menuRef.current?.removeAttribute('open')
  const remember = (patch: Partial<UserPreferences>) => {
    setPreferenceNotice(updatePreferences(patch) ? '' : '선택은 적용됐지만 이 브라우저에 저장하지 못했습니다.')
  }

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
  const [editFlipOnly, setEditFlipOnly] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const loadDeck = async () => {
    if (!deckId) return
    const request = ++loadRequest.current
    setLoadError('')
    try {
      const [nextDeck, nextCards, nextSession] = await Promise.all([getDeck(deckId), listCards(deckId), getSession(deckId)])
      if (request !== loadRequest.current) return
      setDeck(nextDeck)
      setCards(nextCards)
      setSession(nextSession)
      if (nextDeck) { setEditName(nextDeck.name); setEditDescription(nextDeck.description ?? '') }
    } catch { if (request === loadRequest.current) setLoadError('덱을 불러오지 못했습니다. 다시 시도해 주세요.') }
    finally { if (request === loadRequest.current) setLoading(false) }
  }

  useEffect(() => {
    setLoading(true)
    void loadDeck()
    return () => { loadRequest.current += 1 }
  }, [deckId])

  const requestedCardId = searchParams.get('card')
  useEffect(() => {
    if (loading || !requestedCardId) return
    const requestedCard = cards.find((card) => card.id === requestedCardId)
    if (requestedCard) { setEditorCard(requestedCard); setEditorOpen(true) }
    else setLoadError('이 카드는 삭제되어 열 수 없습니다.')
    const next = new URLSearchParams(searchParams)
    next.delete('card')
    setSearchParams(next, { replace: true })
  }, [loading, requestedCardId, cards, searchParams, setSearchParams])

  const visibleCards = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return cards.filter((card) => {
      const matchesType =
        filter === 'all' ? true
          : filter === 'wrong' ? card.stats.wrong > 0
            : filter === 'starred' ? card.starred
              : card.type === filter
      const matchesQuery = !normalized || cardSearchText(card).toLocaleLowerCase().includes(normalized)
      const matchesTag = !tag || card.tags.includes(tag)
      return matchesType && matchesTag && matchesQuery
    })
  }, [cards, filter, tag, query])

  const counts = useMemo(() => ({
    all: cards.length,
    term: cards.filter((card) => card.type === 'term').length,
    mcq: cards.filter((card) => card.type === 'mcq').length,
    wrong: wrongCards(cards).length,
    starred: cards.filter((card) => card.starred).length,
  }), [cards])

  // 덱에 실제로 쓰인 태그를 많이 쓰인 순으로. 한 종류뿐이면 거를 게 없으니 줄을 띄우지 않는다
  const tagCounts = useMemo(() => {
    const counter = new Map<string, number>()
    for (const card of cards) {
      for (const name of card.tags) counter.set(name, (counter.get(name) ?? 0) + 1)
    }
    return [...counter.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  }, [cards])

  // 비어 있는 필터는 뒤로 민다. 전체는 늘 맨 앞
  const filterOrder = useMemo(() => {
    const rest: CardFilter[] = ['term', 'mcq', 'wrong', 'starred']
    return ['all' as CardFilter, ...rest.filter((f) => counts[f] > 0), ...rest.filter((f) => counts[f] === 0)]
  }, [counts])

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
    setEditFlipOnly(deck.flipOnly ?? false)
    setEditError(null)
    setEditOpen(true)
  }

  const saveDeck = async () => {
    if (!deckId || pending.current) return
    const name = editName.trim()
    if (!name) {
      setEditError('덱 이름을 입력하세요.')
      return
    }
    pending.current = true
    setBusy(true)
    setEditError(null)
    try {
      await updateDeck(deckId, { name, description: editDescription.trim() || undefined, flipOnly: editFlipOnly })
      await loadDeck()
      setEditOpen(false)
    } catch { setEditError('덱을 저장하지 못했습니다. 입력한 내용은 유지됩니다. 다시 시도해 주세요.') }
    finally { pending.current = false; setBusy(false) }
  }

  const removeDeck = async () => {
    if (!deckId || pending.current) return
    pending.current = true
    setBusy(true)
    setEditError(null)
    try { await deleteDeck(deckId); navigate('/') }
    catch { setEditError('덱을 삭제하지 못했습니다. 다시 시도해 주세요.') }
    finally { pending.current = false; setBusy(false) }
  }

  // 시험·공부 대상은 지금 화면에 보이는 카드다 (유형·틀림·★·태그·검색 결과)
  const studyCount = size === 'all' ? visibleCards.length : Math.min(visibleCards.length, Number(size))
  const limit = size === 'all' ? undefined : Number(size)
  const visibleIds = visibleCards.map((card) => card.id)

  /** 이어하기 — 세션에 적힌 조건(순서·장수·타임어택)을 그대로 쓴다. 아무것도 넘기지 않는다 */
  const resumeStudy = () => {
    if (!deckId) return
    navigate(session && session.cursor >= session.cardIds.length ? `/study/${deckId}/result` : `/study/${deckId}`)
  }

  // 세션이 무엇으로 시작됐는지 나중에 이어하기 카드에 보여준다
  const studyLabel = [
    filter === 'all' ? null : filterLabel(filter),
    tag ? `#${tag}` : null,
    query.trim() ? `"${query.trim()}"` : null,
    orderOptions.find((option) => option.value === order)?.label,
  ].filter(Boolean).join(' · ')

  /** 새 시험 — 지금 화면에 보이는 카드로 시작한다 */
  const beginStudy = async () => {
    if (!deckId || studyCount === 0 || pending.current) return
    pending.current = true
    setBusy(true)
    setEditError(null)
    try {
      await clearSession(deckId)
      setSession(undefined)
      navigate(`/study/${deckId}`, { state: { order, limit, timed: timed && !deck?.flipOnly, cardIds: visibleIds, label: studyLabel } })
    } catch { setEditError('새 시험을 시작하지 못했습니다. 다시 시도해 주세요.'); setLoadError('새 시험을 시작하지 못했습니다. 다시 시도해 주세요.') }
    finally { pending.current = false; setBusy(false) }
  }
  const startStudy = () => {
    if (session && session.cursor < session.cardIds.length) { setEditError(null); setReplaceOpen(true) }
    else void beginStudy()
  }
  const exportCurrentDeck = async () => {
    if (!deckId || !deck || pending.current) return
    pending.current = true
    setBusy(true)
    try { downloadJson(`${deck.name.replace(/[\\/:*?"<>|]/g, '-')}.json`, await exportDeck(deckId)) }
    catch { setLoadError('덱 파일을 만들지 못했습니다. 다시 시도해 주세요.') }
    finally { pending.current = false; setBusy(false) }
  }

  const startBrowse = () => {
    if (!deckId || studyCount === 0) return
    navigate(`/browse/${deckId}`, { state: { order, limit, timed, cardIds: visibleIds } })
  }
  const activeSession = session && session.cursor < session.cardIds.length

  if (loading) return <Screen title="덱" back={() => navigate('/')}><EmptyState>덱을 불러오는 중입니다.</EmptyState></Screen>
  if (!deck) {
    return (
      <Screen title="덱을 찾을 수 없습니다" back={() => navigate('/')}>
        <EmptyState>{loadError || '덱이 없거나 삭제되었습니다.'}</EmptyState>
        {loadError && <Button onClick={() => { setLoading(true); void loadDeck() }}>다시 시도</Button>}
        <Button onClick={() => navigate('/')}>홈으로</Button>
      </Screen>
    )
  }

  return (
    <Screen
      title={deck.name}
      back={() => navigate('/')}
      action={
        <details className="deck__menu" ref={menuRef}>
          <summary aria-label="덱 메뉴"><Icon name="more" /></summary>
          <div className="deck__menu-items">
            <button type="button" onClick={() => { closeMenu(); openNewCard() }}>카드 추가</button>
            <Link to={`/deck/${deck.id}/import`}>불러오기</Link>
            <Link to={`/history?deck=${deck.id}`}>학습 기록</Link>
            <button type="button" disabled={busy} onClick={() => { closeMenu(); void exportCurrentDeck() }}>덱 내보내기</button>
            <button type="button" onClick={() => { closeMenu(); openEdit() }}>덱 편집</button>
          </div>
        </details>
      }
      foot={
        <div className="deck__foot">
          {activeSession && <div className="deck__session-status">
            <span>{session.cursor}/{session.cardIds.length}장 완료 · {session.cardIds.length - session.cursor}장 남음{session.label ? ` · ${session.label}` : ''}</span>
            <ProgressBar value={session.cursor} max={session.cardIds.length} />
          </div>}
          {session && !activeSession && <button type="button" className="deck__last-result" onClick={resumeStudy}>지난 시험 결과 보기</button>}
          <details className="deck__study-settings">
          <summary>{activeSession ? '새 시험·학습 설정' : '학습 설정'}</summary>
          <div className="deck__opts">
            <label>순서
            <select
              className="deck__opt"
              aria-label="학습 순서"
              value={order}
              onChange={(event) => { const value = event.target.value as StudyOrder; setOrder(value); remember({ studyOrder: value }) }}
            >
              {orderOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            </label>
            <label>장수
            <select
              className="deck__opt"
              aria-label="한 번에 풀 양"
              value={size}
              onChange={(event) => { const value = event.target.value as StudySize; setSize(value); remember({ studySize: value }) }}
            >
              {sizeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            </label>
            {deck.flipOnly ? (
              <span className="deck__timed" title="이 덱은 보기 없이 뒤집어 스스로 채점한다"><Icon name="cards" size={16} />뒤집기</span>
            ) : (
              <label className="deck__timed" title="단어 카드에 10초 제한">
                <input type="checkbox" checked={timed} onChange={(event) => { setTimed(event.target.checked); remember({ studyTimed: event.target.checked }) }} />
                <Icon name="clock" size={16} /><span>10초</span>
              </label>
            )}
          </div>
          <p className="deck__study-hint">현재 검색·필터에 맞는 카드 중 {studyCount}장을 학습합니다.</p>
          {activeSession && <Button block disabled={studyCount === 0 || busy} onClick={startStudy}>새 시험 시작 ({studyCount}장)</Button>}
          </details>
          {preferenceNotice && <p className="form-hint" role="status">{preferenceNotice}</p>}
          <div className="deck__foot-row">
            <Button onClick={startBrowse} disabled={studyCount === 0 || busy}>공부하기</Button>
            <Button variant="primary" aria-label={activeSession ? `이어하기 (${session.cardIds.length - session.cursor}장 남음)` : undefined} onClick={activeSession ? resumeStudy : startStudy} disabled={busy || (!activeSession && studyCount === 0)}>
              {activeSession ? '이어하기' : `시험보기 (${studyCount}장)`}
            </Button>
          </div>
        </div>
      }
    >
      {deck.description && <p className="deck__description">{deck.description}</p>}
      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      <Field
        label="검색"
        type="search"
        placeholder="카드 검색"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="deck__filters" aria-label="유형 필터">
        {filterOrder.map((value) => (
          <button
            className="deck__filter"
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            <Badge tone={filter === value ? (value === 'wrong' ? 'bad' : 'accent') : 'neutral'}>
              {value === 'starred' && <Icon name="star" size={14} />}
              {filterLabel(value)} <span className="badge__count">{counts[value]}</span>
            </Badge>
          </button>
        ))}
      </div>

      {tagCounts.length > 1 && (
        <div className="deck__filters" aria-label="태그 필터">
          {tagCounts.map(([name, count]) => (
            <button
              className="deck__filter"
              key={name}
              type="button"
              aria-pressed={tag === name}
              onClick={() => setTag((current) => (current === name ? null : name))}
            >
              <Badge tone={tag === name ? 'accent' : 'neutral'}>
                #{name} <span className="badge__count">{count}</span>
              </Badge>
            </button>
          ))}
        </div>
      )}

      {cards.length > 0 && <div className="deck__list-tools">
        <span>{visibleCards.length}장{visibleCards.length !== cards.length ? ` / 전체 ${cards.length}장` : ''}</span>
        <label><input type="checkbox" checked={showAnswers} onChange={(event) => { setShowAnswers(event.target.checked); remember({ showAnswers: event.target.checked }) }} />정답 표시</label>
      </div>}
      {cards.length === 0 ? (
        <div className="deck__empty"><EmptyState>첫 카드를 추가해 보세요.<br />한 장씩 만들거나 파일로 한 번에 가져올 수 있습니다.</EmptyState>
          <Button variant="primary" onClick={openNewCard}><Icon name="plus" size={18} />카드 추가</Button>
          <Button onClick={() => navigate(`/deck/${deck.id}/import`)}>파일·텍스트 불러오기</Button>
        </div>
      ) : visibleCards.length === 0 ? (
        <div className="deck__empty"><EmptyState>검색 조건에 맞는 카드가 없습니다.</EmptyState>
          <Button onClick={() => { setQuery(''); setFilter('all'); setTag(null) }}>검색·필터 초기화</Button>
        </div>
      ) : (
        <div className="deck__list">
          {visibleCards.map((card) => (
            <button className="deck__card" key={card.id} type="button" onClick={() => openCard(card)}>
              <span className="deck__card-text">
                <strong className="deck__card-front">{cardPrompt(card)}</strong>
                {showAnswers && <span className="deck__card-back">{cardAnswer(card)}</span>}
              </span>
              <span className="deck__card-badges">
                <Badge>{typeLabel(card.type)}</Badge>
                {card.stats.wrong > 0 && <Badge tone="bad">틀림 {card.stats.wrong}</Badge>}
                {card.starred && <Badge tone="accent"><Icon name="star" size={12} filled />핵심</Badge>}
                {card.tags.slice(0, 2).map((name) => (
                  <span className="deck__card-tag" key={name}>#{name}</span>
                ))}
              </span>
            </button>
          ))}
        </div>
      )}

      <CardEditor
        deckId={deck.id}
        open={editorOpen}
        card={editorCard}
        defaultType={counts.mcq > counts.term ? 'mcq' : 'term'}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { void loadDeck() }}
        onDeleted={() => { void loadDeck() }}
      />

      <Modal
        open={editOpen}
        title="덱 편집"
        busy={busy}
        onClose={() => { if (!pending.current) setEditOpen(false) }}
        footer={
          <>
            {editError && <p className="form-error" role="alert">{editError}</p>}
            <Button variant="primary" disabled={busy} onClick={saveDeck}>{busy ? '저장 중…' : '저장'}</Button>
            <Button disabled={busy} onClick={() => setEditOpen(false)}>취소</Button>
            <Button variant="danger" disabled={busy} onClick={() => { setEditError(null); setEditOpen(false); setDeleteOpen(true) }}>덱 삭제</Button>
          </>
        }
      >
        <fieldset className="form-fields" disabled={busy}>
        <Field label="이름" value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus />
        <Field
          label="설명 · 선택"
          as="textarea"
          value={editDescription}
          onChange={(event) => setEditDescription(event.target.value)}
        />
        <Tabs
          label="덱 유형"
          options={deckModeOptions}
          value={editFlipOnly ? 'flip' : 'word'}
          onChange={(value) => setEditFlipOnly(value === 'flip')}
        />
        <p className="deck__modal-copy">{deckModeHint}</p>
        </fieldset>
      </Modal>

      <Modal
        open={deleteOpen}
        title="덱 삭제"
        busy={busy}
        onClose={() => { if (!pending.current) setDeleteOpen(false) }}
        footer={
          <>
            {editError && <p className="form-error" role="alert">{editError}</p>}
            <Button variant="danger" disabled={busy} onClick={removeDeck}>{busy ? '삭제 중…' : '삭제'}</Button>
            <Button disabled={busy} onClick={() => setDeleteOpen(false)}>취소</Button>
          </>
        }
      >
        <p className="deck__modal-copy">“{deck.name}” 덱과 카드 {cards.length}장, 학습 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.</p>
      </Modal>
      <Modal open={replaceOpen} title="새 시험을 시작할까요?" busy={busy} onClose={() => { if (!pending.current) setReplaceOpen(false) }} footer={<>
        {editError && <p className="form-error" role="alert">{editError}</p>}
        <Button variant="primary" disabled={busy} onClick={() => void beginStudy()}>새 시험 시작</Button>
        <Button disabled={busy} onClick={() => setReplaceOpen(false)}>이어하기 유지</Button>
      </>}><p>진행 중인 시험의 남은 {session ? session.cardIds.length - session.cursor : 0}장을 대신해 새 시험을 시작합니다. 지금까지 쌓인 학습 기록은 유지됩니다.</p></Modal>
    </Screen>
  )
}
