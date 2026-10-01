import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getDeck, listCards, toggleStar } from '../db'
import { cardAnswer, cardPrompt, cardTypeLabel, type Card } from '../types'
import { Badge, Button, EmptyState, Icon, ProgressBar, Screen } from '../ui'
import { orderCards, type StudyOrder } from './engine'
import { useStudyShortcuts } from './useStudyShortcuts'
import './BrowsePage.css'

type BrowseState = { order?: StudyOrder; limit?: number; cardIds?: string[] }

/** 공부하기 — 채점 없이 앞뒤만 넘겨 본다. 기록도 세션도 남기지 않는다 */
export const BrowsePage = () => {
  const { deckId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as BrowseState | null
  const [cards, setCards] = useState<Card[]>([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  const order = state?.order ?? 'alpha'
  const limit = state?.limit

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      const [deck, all] = await Promise.all([getDeck(deckId), listCards(deckId)])
      if (cancelled) return
      if (!deck) {
        navigate('/', { replace: true })
        return
      }
      const picked = state?.cardIds ? all.filter((card) => state.cardIds?.includes(card.id)) : all
      const ids = orderCards(picked, order).slice(0, limit)
      const byId = new Map(all.map((card) => [card.id, card]))
      setCards(ids.map((id) => byId.get(id)).filter((card): card is Card => Boolean(card)))
      setIndex(0)
      setFlipped(false)
      setLoading(false)
    }
    void load().catch(() => { if (!cancelled) { setError('카드를 불러오지 못했습니다. 다시 시도해 주세요.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [deckId, navigate, order, limit, state?.cardIds, attempt])

  const card = cards[index]
  const isLast = index === cards.length - 1
  const goDeck = () => navigate(`/deck/${deckId}`)
  const move = (step: number) => {
    setIndex((current) => Math.min(Math.max(current + step, 0), cards.length - 1))
    setFlipped(false)
  }

  const star = async () => {
    if (!card) return
    try {
      const starred = await toggleStar(card.id)
      setCards((current) => current.map((item) => (item.id === card.id ? { ...item, starred } : item)))
    } catch { setError('핵심 표시를 저장하지 못했습니다. 다시 눌러 주세요.') }
  }

  const explanation = useMemo(
    () => (flipped && card?.explanation ? card.explanation : null),
    [flipped, card],
  )
  const advance = () => {
    if (!flipped) return setFlipped(true)
    if (isLast) return goDeck()
    move(1)
  }
  useStudyShortcuts(!loading && Boolean(card), (key) => {
    if (key === ' ') { advance(); return true }
    if (key === 'ArrowLeft' && index > 0) { move(-1); return true }
    if (key === 'ArrowRight' && !isLast) { move(1); return true }
    return false
  })

  if (loading) {
    return <Screen title="공부하기" back={goDeck}><EmptyState>불러오는 중입니다.</EmptyState></Screen>
  }
  if (!card) {
    return (
      <Screen title="공부하기" back={goDeck}>
        <EmptyState>{error || '볼 카드가 없습니다.'}</EmptyState>
        {error && <Button onClick={() => setAttempt((value) => value + 1)}>다시 시도</Button>}
        <Button variant="primary" block onClick={goDeck}>덱으로 돌아가기</Button>
      </Screen>
    )
  }

  return (
    <Screen
      title={`${index + 1} / ${cards.length}`}
      back={goDeck}
      action={
        <button
          type="button"
          className={`star-btn${card.starred ? ' is-on' : ''}`}
          aria-pressed={Boolean(card.starred)}
          aria-label="핵심 단어"
          onClick={() => void star()}
        >
          <Icon name="star" filled={Boolean(card.starred)} />
        </button>
      }
      foot={
        <div className="browse__foot">
          <Button onClick={() => move(-1)} disabled={index === 0}>이전</Button>
          <Button
            variant="primary"
            block
            onClick={advance}
          >
            {!flipped ? '답 보기' : isLast ? '목록으로' : '다음'}
          </Button>
        </div>
      }
    >
      <ProgressBar value={index + 1} max={cards.length} />
      {error && <p className="form-error" role="alert">{error}</p>}

      <button type="button" className="browse__card" onClick={() => setFlipped((on) => !on)}>
        <Badge>{cardTypeLabel[card.type]}</Badge>
        <p className={`browse__face${cardPrompt(card).length <= 24 ? ' browse__face--short' : ''}`}>
          {cardPrompt(card)}
        </p>
        {flipped && <p className="browse__answer">{cardAnswer(card)}</p>}
        {!flipped && <span className="browse__hint">눌러서 뒤집기</span>}
      </button>

      {explanation && (
        <section className="browse__explanation">
          <h2>개념 설명</h2>
          <p>{explanation}</p>
        </section>
      )}
      <p className="study__shortcuts">Space로 답 보기·다음 · 방향키로 이전·다음</p>
    </Screen>
  )
}
