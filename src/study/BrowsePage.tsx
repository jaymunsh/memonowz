import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getDeck, listCards, toggleStar } from '../db'
import { cardAnswer, cardPrompt, cardTypeLabel, type Card } from '../types'
import { Badge, Button, EmptyState, ProgressBar, Screen } from '../ui'
import { orderCards, type StudyOrder } from './engine'
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

  const order = state?.order ?? 'alpha'
  const limit = state?.limit

  useEffect(() => {
    let cancelled = false
    const load = async () => {
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
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [deckId, navigate, order, limit, state?.cardIds])

  const card = cards[index]
  const isLast = index === cards.length - 1
  const goDeck = () => navigate(`/deck/${deckId}`)
  const move = (step: number) => {
    setIndex((current) => Math.min(Math.max(current + step, 0), cards.length - 1))
    setFlipped(false)
  }

  const star = async () => {
    if (!card) return
    const starred = await toggleStar(card.id)
    setCards((current) => current.map((item) => (item.id === card.id ? { ...item, starred } : item)))
  }

  const explanation = useMemo(
    () => (flipped && card?.explanation ? card.explanation : null),
    [flipped, card],
  )

  if (loading) {
    return <Screen title="공부하기" back={goDeck}><EmptyState>불러오는 중입니다.</EmptyState></Screen>
  }
  if (!card) {
    return (
      <Screen title="공부하기" back={goDeck}>
        <EmptyState>볼 카드가 없습니다.</EmptyState>
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
          aria-pressed={card.starred}
          aria-label="핵심 단어"
          onClick={() => void star()}
        >
          {card.starred ? '★' : '☆'}
        </button>
      }
      foot={
        <div className="browse__foot">
          <Button onClick={() => move(-1)} disabled={index === 0}>이전</Button>
          <Button
            variant="primary"
            block
            onClick={() => {
              if (!flipped) return setFlipped(true)
              if (isLast) return goDeck()
              move(1)
            }}
          >
            {!flipped ? '답 보기' : isLast ? '목록으로' : '다음'}
          </Button>
        </div>
      }
    >
      <ProgressBar value={index + 1} max={cards.length} />

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
    </Screen>
  )
}
