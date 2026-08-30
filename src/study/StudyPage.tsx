import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { clearSession, getDeck, getSession, listCards, recordAnswer, saveSession, toggleStar } from '../db'
import type { ActiveSession, Card } from '../types'
import { Button, EmptyState, ProgressBar, Screen } from '../ui'
import { CardEditor } from '../card/CardEditor'
import { buildQuestion, orderCards, type StudyOrder } from './engine'
import './StudyPage.css'

type RetryState = { cardIds?: string[]; order?: StudyOrder; limit?: number; timed?: boolean }

/** 타임어택 제한 시간. 단어 카드에만 건다 — 나머지는 답을 떠올렸는지 앱이 알 수 없다 */
const TIME_LIMIT_MS = 10_000

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)
type AnswerState = { correct?: boolean; selectedValue?: string; revealed?: boolean }

export const StudyPage = () => {
  const { deckId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const retryCardIds = useMemo(() => {
    const state = location.state as RetryState | null
    return Array.isArray(state?.cardIds) ? state.cardIds : undefined
  }, [location.state])
  const studyOrder = useMemo(() => (location.state as RetryState | null)?.order ?? 'alpha', [location.state])
  const studyLimit = useMemo(() => (location.state as RetryState | null)?.limit, [location.state])
  const requestedTimed = useMemo(() => Boolean((location.state as RetryState | null)?.timed), [location.state])
  const [remaining, setRemaining] = useState(TIME_LIMIT_MS)
  const [cards, setCards] = useState<Card[]>([])
  const [session, setSession] = useState<ActiveSession>()
  const [answer, setAnswer] = useState<AnswerState | null>(null)
  const [answeredCardId, setAnsweredCardId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      const [deck, availableCards, active] = await Promise.all([getDeck(deckId), listCards(deckId), getSession(deckId)])
      if (cancelled) return
      if (!deck) {
        navigate(`/deck/${deckId}`, { replace: true })
        return
      }

      const availableIds = new Set(availableCards.map((card) => card.id))
      const resuming = !retryCardIds && Boolean(active)
      // 덱 화면에서 필터로 추린 카드만 넘어온다. 없으면 덱 전체
      const picked = retryCardIds
        ? availableCards.filter((card) => retryCardIds.includes(card.id))
        : availableCards
      const ids = resuming && active
        ? active.cardIds.filter((id) => availableIds.has(id))
        : orderCards(picked, studyOrder).slice(0, studyLimit)
      const next: ActiveSession = resuming && active
        ? { ...active, cardIds: ids, cursor: Math.min(active.cursor, ids.length) }
        : { deckId, cardIds: ids, cursor: 0, results: [], startedAt: Date.now(), timed: requestedTimed }

      setCards(availableCards)
      setSession(next)
      setAnswer(null)
      setAnsweredCardId(null)
      setLoading(false)

      if (ids.length === 0) {
        await clearSession(deckId)
      } else if (resuming && (next.cardIds.length !== active?.cardIds.length || next.cursor !== active?.cursor)) {
        // 새 세션은 첫 채점 때 저장한다 — 들어갔다 바로 나온 것까지 이어하기로 남으면 곤란하다
        await saveSession(next)
      }
    }
    void load().catch(() => {
      if (!cancelled) {
        setError('학습 세션을 불러오지 못했습니다.')
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [deckId, navigate, retryCardIds, studyOrder, studyLimit, requestedTimed])
  const displayedCardId = answeredCardId ?? (session ? session.cardIds[session.cursor] : undefined)
  const card = cards.find((item) => item.id === displayedCardId)
  const question = useMemo(() => card ? buildQuestion(card, cards) : undefined, [card, cards])
  const total = session?.cardIds.length ?? 0
  const questionIndex = displayedCardId && session
    ? Math.max(0, session.cardIds.indexOf(displayedCardId))
    : session?.cursor ?? 0
  const isLast = questionIndex >= total - 1

  // 이 카드에 타이머가 붙는지 (채점 뒤에도 남은 시간을 보여주려고 answer와 분리)
  const timerCard = Boolean(session?.timed) && card?.type === 'term'
  const timerOn = timerCard && answer?.correct === undefined
  useEffect(() => {
    if (!timerOn || !card) return
    const startedAt = Date.now()
    setRemaining(TIME_LIMIT_MS)
    const tick = setInterval(() => {
      const left = TIME_LIMIT_MS - (Date.now() - startedAt)
      setRemaining(Math.max(0, left))
      if (left <= 0) {
        clearInterval(tick)
        void score(false)
      }
    }, 100)
    return () => clearInterval(tick)
    // card.id가 바뀔 때마다 새로 잰다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerOn, card?.id])

  const goDeck = () => navigate(`/deck/${deckId}`)
  const score = async (correct: boolean, selectedValue?: string) => {
    if (!session || !card || !question || answer?.correct !== undefined || saving) return
    const next: ActiveSession = {
      ...session,
      cursor: Math.min(session.cursor + 1, session.cardIds.length),
      results: [...session.results, { cardId: card.id, correct }],
    }
    setAnswer({ correct, selectedValue, revealed: question.kind === 'flip' })
    setAnsweredCardId(card.id)
    setSaving(true)
    try {
      await Promise.all([recordAnswer(card.id, correct), saveSession(next)])
      setSession(next)
    } catch {
      setError('채점 결과를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }
  const star = async () => {
    if (!card) return
    await toggleStar(card.id)
    await refreshCards()
  }
  const reveal = () => {
    if (!answer) setAnswer({ revealed: true })
  }
  const next = async () => {
    if (!session || answer?.correct === undefined || saving) return
    if (isLast) {
      await clearSession(deckId)
      navigate(`/study/${deckId}/result`, {
        state: { results: session.results, total: session.cardIds.length },
      })
      return
    }
    setAnswer(null)
    setAnsweredCardId(null)
    setError(null)
  }
  const refreshCards = async () => {
    setCards(await listCards(deckId))
  }
  const removeCard = async (cardId: string) => {
    if (!session) return
    const deletedIndex = session.cardIds.indexOf(cardId)
    const cardIds = session.cardIds.filter((id) => id !== cardId)
    const cursor = session.cursor - (deletedIndex >= 0 && deletedIndex < session.cursor ? 1 : 0)
    const nextSession: ActiveSession = { ...session, cardIds, cursor: Math.min(cursor, cardIds.length) }
    setCards((items) => items.filter((item) => item.id !== cardId))
    setSession(nextSession)
    setAnswer(null)
    setAnsweredCardId(null)
    if (cardIds.length > 0) await saveSession(nextSession)
    else await clearSession(deckId)
  }

  if (loading) {
    return <Screen title="학습"><EmptyState>학습 세션을 불러오는 중입니다.</EmptyState></Screen>
  }
  if (!session || !card || !question) {
    return <Screen title="학습" back={goDeck}>
      <EmptyState>{error ?? '학습할 카드가 없습니다.'}</EmptyState>
      <Button variant="primary" block onClick={goDeck}>덱으로 돌아가기</Button>
    </Screen>
  }
  const choiceAnswer = question.kind === 'choice' && answer?.correct !== undefined
  const explanation = card.explanation && answer?.correct !== undefined
    ? <section className="study__explanation"><h2>개념 설명</h2><p>{card.explanation}</p></section>
    : null
  return (
    <>
      <Screen
        title={`${Math.min(questionIndex + 1, total)} / ${total}`}
        back={goDeck}
        action={
          <>
            <Button onClick={() => setEditorOpen(true)}>수정</Button>
            <button
              type="button"
              className={`star-btn${card.starred ? ' is-on' : ''}`}
              aria-pressed={card.starred}
              aria-label="핵심 단어"
              onClick={() => void star()}
            >
              {card.starred ? '★' : '☆'}
            </button>
          </>
        }
        foot={answer?.correct !== undefined && (
          <Button variant="primary" block disabled={saving} onClick={() => void next()}>
            {isLast ? '결과 보기' : '다음'}
          </Button>
        )}
      >
        {/* 제목에 이미 3 / 10 이 있다. 막대는 한 번에 하나만 둔다 */}
        {!timerCard && <ProgressBar value={Math.min(session.cursor, total)} max={total} />}
        {timerCard && (
          <div className={`study__timer${remaining <= 3000 ? ' is-urgent' : ''}`}>
            <ClockIcon />
            <span className="study__timer-track">
              <span className="study__timer-fill" style={{ width: `${(remaining / TIME_LIMIT_MS) * 100}%` }} />
            </span>
            <span className="study__timer-num">{Math.ceil(remaining / 1000)}초</span>
          </div>
        )}
        <article className="study__question">
          <p className={`study__stem${question.stem.length <= 24 ? ' study__stem--short' : ''}`}>
            {question.stem}
          </p>

          {question.kind === 'choice' && <div className="study__choices">
            {question.choices.map((choice, index) => {
              const isCorrect = Boolean(choiceAnswer && index === question.answerIndex)
              const isSelected = Boolean(choiceAnswer && answer?.selectedValue === choice)
              return <Button key={`${choice}-${index}`} block className={[
                'study__choice', isCorrect && 'study__choice--ok',
                isSelected && !isCorrect && 'study__choice--bad',
                choiceAnswer && !isCorrect && !isSelected && 'study__choice--dim',
              ].filter(Boolean).join(' ')} disabled={Boolean(answer) || saving}
                onClick={() => void score(index === question.answerIndex, choice)}>{choice}</Button>
            })}
          </div>}

          {question.kind === 'flip' && <div className="study__flip">
            {!answer?.revealed ? <Button variant="primary" block onClick={reveal}>답 보기</Button> : <>
              <div className="study__answer"><strong>정답</strong><p>{question.answer}</p></div>
              <div className="study__flip-actions">
                <Button variant="danger" block disabled={saving || answer.correct !== undefined} onClick={() => void score(false)}>몰랐음</Button>
                <Button variant="primary" block disabled={saving || answer.correct !== undefined} onClick={() => void score(true)}>알았음</Button>
              </div>
            </>}
          </div>}

          {answer?.correct !== undefined && <p className={`study__result study__result--${answer.correct ? 'ok' : 'bad'}`}>{answer.correct ? '맞았습니다.' : '다시 살펴보세요.'}</p>}
          {explanation}
          {error && <p className="study__error">{error}</p>}
        </article>
      </Screen>
      <CardEditor
        deckId={deckId}
        open={editorOpen}
        card={card}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { void refreshCards() }}
        onDeleted={(id) => { void removeCard(id) }}
      />
    </>
  )
}
