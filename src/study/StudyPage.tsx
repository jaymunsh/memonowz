import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { clearSession, commitAnswer, getDeck, getSession, listCards, reconcileSessionCards, saveSession, toggleStar } from '../db'
import type { ActiveSession, Card } from '../types'
import { Button, EmptyState, Icon, ProgressBar, Screen } from '../ui'
import { CardEditor } from '../card/CardEditor'
import { buildQuestion, orderCards, type Question, type StudyOrder } from './engine'
import { useStudyShortcuts } from './useStudyShortcuts'
import './StudyPage.css'

type RetryState = { cardIds?: string[]; order?: StudyOrder; limit?: number; timed?: boolean; label?: string }
const TIME_LIMIT_MS = 10_000

type AnswerState = { correct?: boolean; selectedIndex?: number; revealed?: boolean }

export const StudyPage = () => {
  const { deckId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const requested = useMemo(() => (location.state as RetryState | null), [location.state])
  const [remaining, setRemaining] = useState(TIME_LIMIT_MS)
  const [cards, setCards] = useState<Card[]>([])
  const [session, setSession] = useState<ActiveSession>()
  const [question, setQuestion] = useState<Question>()
  const [answer, setAnswer] = useState<AnswerState | null>(null)
  const [answeredCardId, setAnsweredCardId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [flipOnly, setFlipOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'failed' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const expire = useRef<() => void>(() => {})

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      const [deck, available, active] = await Promise.all([getDeck(deckId), listCards(deckId), getSession(deckId)])
      if (cancelled) return
      if (!deck) { navigate('/', { replace: true }); return }
      const requestedIds = Array.isArray(requested?.cardIds) ? requested.cardIds : undefined
      // Explicit starts clear the previous session in DeckPage/ResultPage.
      // History state survives reloads, so it must not reset a saved session.
      const resuming = Boolean(active)
      const availableIds = new Set(available.map((card) => card.id))
      const selectedIds = requestedIds ? new Set(requestedIds) : undefined
      const picked = selectedIds ? available.filter((card) => selectedIds.has(card.id)) : available
      const next: ActiveSession = resuming && active
        ? reconcileSessionCards(active, availableIds)
        : {
            deckId, sessionId: nanoid(), cardIds: orderCards(picked, requested?.order ?? 'alpha').slice(0, requested?.limit),
            cursor: 0, results: [], startedAt: Date.now(), timed: Boolean(requested?.timed), label: requested?.label,
          }
      if (resuming && active && (next.cardIds.length !== active.cardIds.length || next.cursor !== active.cursor)) {
        if (next.cardIds.length) await saveSession(next)
        else await clearSession(deckId)
      }
      if (cancelled) return
      if (next.cardIds.length && next.cursor >= next.cardIds.length) {
        navigate(`/study/${deckId}/result`, { replace: true })
        return
      }
      const current = available.find((card) => card.id === next.cardIds[next.cursor])
      setCards(available)
      setFlipOnly(Boolean(deck.flipOnly))
      setSession(next)
      setQuestion(current ? buildQuestion(current, available, Math.random, Boolean(deck.flipOnly)) : undefined)
      setAnswer(null)
      setAnsweredCardId(null)
      setSaveState('idle')
      setRemaining(TIME_LIMIT_MS)
      setLoading(false)
    }
    void load().catch(() => {
      if (!cancelled) { setError('학습을 불러오지 못했습니다. 다시 시도해 주세요.'); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [deckId, navigate, requested, loadAttempt])

  const displayedCardId = answeredCardId ?? session?.cardIds[session.cursor]
  const card = cards.find((item) => item.id === displayedCardId)
  const total = session?.cardIds.length ?? 0
  const questionIndex = displayedCardId && session ? Math.max(0, session.cardIds.indexOf(displayedCardId)) : 0
  const isLast = questionIndex >= total - 1
  const saving = saveState === 'saving'
  const timerCard = Boolean(session?.timed) && card?.type === 'term' && !flipOnly
  const timerOn = timerCard && answer?.correct === undefined
  const goDeck = () => navigate(`/deck/${deckId}`)

  const persistAnswer = async (correct: boolean, selectedIndex?: number) => {
    if (!session || !card || !question || pending.current) return
    pending.current = true
    setAnswer({ correct, selectedIndex, revealed: question.kind === 'flip' })
    setAnsweredCardId(card.id)
    setSaveState('saving')
    setError(null)
    try {
      const next = await commitAnswer(session, card.id, correct)
      setSession(next)
      setSaveState('saved')
    } catch {
      setSaveState('failed')
      setError('채점 결과를 저장하지 못했습니다. 선택한 답은 유지됩니다. 저장을 다시 시도해 주세요.')
    } finally { pending.current = false }
  }
  const score = (correct: boolean, selectedIndex?: number) => {
    if (answer?.correct !== undefined) return
    void persistAnswer(correct, selectedIndex)
  }
  expire.current = () => score(false)

  useEffect(() => {
    if (!timerOn || editorOpen) return
    const deadline = Date.now() + remaining
    const tick = setInterval(() => {
      const left = Math.max(0, deadline - Date.now())
      setRemaining(left)
      if (left === 0) { clearInterval(tick); expire.current() }
    }, 100)
    return () => clearInterval(tick)
    // Remaining is captured when a question starts or editing pauses/resumes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerOn, card?.id, editorOpen])

  const star = async () => {
    if (!card) return
    try {
      const starred = await toggleStar(card.id)
      setCards((items) => items.map((item) => item.id === card.id ? { ...item, starred } : item))
    } catch { setError('핵심 표시를 저장하지 못했습니다. 다시 눌러 주세요.') }
  }
  const next = () => {
    if (!session || saveState !== 'saved') return
    if (isLast) { navigate(`/study/${deckId}/result`); return }
    const nextCard = cards.find((item) => item.id === session.cardIds[session.cursor])
    setQuestion(nextCard ? buildQuestion(nextCard, cards, Math.random, flipOnly) : undefined)
    setAnswer(null)
    setAnsweredCardId(null)
    setSaveState('idle')
    setError(null)
    setRemaining(TIME_LIMIT_MS)
  }
  const refreshCard = async (updated: Card) => {
    const available = await listCards(deckId)
    setCards(available)
    if (answer?.correct === undefined) {
      setQuestion(buildQuestion(updated, available, Math.random, flipOnly))
      setAnswer(null)
    }
  }
  const removeCard = async () => {
    if (!session) return
    try {
      const available = await listCards(deckId)
      const nextSession = await getSession(deckId) ?? reconcileSessionCards(session, new Set(available.map((item) => item.id)))
      setCards(available)
      setSession(nextSession)
      setAnswer(null)
      setAnsweredCardId(null)
      setSaveState('idle')
      setRemaining(TIME_LIMIT_MS)
      if (nextSession.cardIds.length && nextSession.cursor >= nextSession.cardIds.length) {
        navigate(`/study/${deckId}/result`)
        return
      }
      const current = available.find((item) => item.id === nextSession.cardIds[nextSession.cursor])
      setQuestion(current ? buildQuestion(current, available, Math.random, flipOnly) : undefined)
    } catch { setError('카드 목록을 갱신하지 못했습니다. 덱으로 돌아가 다시 열어 주세요.') }
  }

  useStudyShortcuts(!loading && !editorOpen && !saving && saveState !== 'failed' && Boolean(question), (key) => {
    if (!question) return false
    if (key === ' ') {
      if (saveState === 'saved') { next(); return true }
      if (question.kind === 'flip' && !answer?.revealed) {
        setAnswer((current) => ({ ...current, revealed: true }))
        return true
      }
    }
    if (answer?.correct !== undefined) return false
    if (/^[1-9]$/.test(key)) {
      const index = Number(key) - 1
      if (question.kind === 'choice' && index < question.choices.length) {
        score(index === question.answerIndex, index)
        return true
      }
      if (question.kind === 'flip' && answer?.revealed && index < 2) {
        score(index === 1)
        return true
      }
    }
    return false
  })

  if (loading) return <Screen title="학습" back={goDeck}><EmptyState>학습을 불러오는 중입니다.</EmptyState></Screen>
  if (!session || !card || !question) return <Screen title="학습" back={goDeck}>
    <EmptyState>{error ?? '학습할 카드가 없습니다.'}</EmptyState>
    {error && <Button variant="primary" onClick={() => setLoadAttempt((value) => value + 1)}>다시 시도</Button>}
    <Button block onClick={goDeck}>덱으로 돌아가기</Button>
  </Screen>

  const graded = answer?.correct !== undefined
  return <>
    <Screen
      title={`${Math.min(questionIndex + 1, total)} / ${total}`}
      back={goDeck}
      action={<>
        <Button disabled={saving || saveState === 'failed'} onClick={() => setEditorOpen(true)}>수정</Button>
        <button type="button" className={`star-btn${card.starred ? ' is-on' : ''}`} aria-pressed={Boolean(card.starred)} aria-label="핵심 단어" onClick={() => void star()}><Icon name="star" filled={Boolean(card.starred)} /></button>
      </>}
      foot={graded && <Button variant="primary" block disabled={saveState !== 'saved'} onClick={next}>
        {saving ? '저장 중…' : isLast ? '결과 보기' : '다음'}
      </Button>}
    >
      {!timerCard && <ProgressBar value={Math.min(session.cursor, total)} max={total} />}
      {timerCard && <div className={`study__timer${remaining <= 3000 ? ' is-urgent' : ''}`} aria-label={`남은 시간 ${Math.ceil(remaining / 1000)}초`}>
        <Icon name="clock" size={16} />
        <span className="study__timer-track"><span className="study__timer-fill" style={{ transform: `scaleX(${remaining / TIME_LIMIT_MS})` }} /></span>
        <span className="study__timer-num">{Math.ceil(remaining / 1000)}초</span>
      </div>}
      <article className="study__question">
        <p className={`study__stem${question.stem.length <= 24 ? ' study__stem--short' : ''}`}>{question.stem}</p>
        {question.kind === 'choice' && <div className="study__choices">{question.choices.map((choice, index) => {
          const isCorrect = graded && index === question.answerIndex
          const isSelected = graded && answer?.selectedIndex === index
          return <Button key={`${choice}-${index}`} block className={[
            'study__choice', isCorrect && 'study__choice--ok', isSelected && !isCorrect && 'study__choice--bad',
            graded && !isCorrect && !isSelected && 'study__choice--dim',
          ].filter(Boolean).join(' ')} disabled={graded || saving} onClick={() => score(index === question.answerIndex, index)}><span className="study__choice-number" aria-hidden="true">{index + 1}</span><span>{choice}</span></Button>
        })}</div>}
        {question.kind === 'flip' && <div className="study__flip">
          {!answer?.revealed ? <Button variant="primary" block onClick={() => setAnswer((current) => ({ ...current, revealed: true }))}>답 보기</Button> : <>
            <div className="study__answer"><strong>정답</strong><p>{question.answer}</p></div>
            <div className="study__flip-actions">
              <Button variant="danger" block disabled={saving || graded} onClick={() => score(false)}>몰랐음</Button>
              <Button variant="primary" block disabled={saving || graded} onClick={() => score(true)}>알았음</Button>
            </div>
          </>}
        </div>}
        {graded && <p role="status" className={`study__result study__result--${answer?.correct ? 'ok' : 'bad'}`}>{answer?.correct ? '맞았습니다.' : '다시 살펴보세요.'}</p>}
        {card.explanation && graded && <section className="study__explanation"><h2>개념 설명</h2><p>{card.explanation}</p></section>}
        {error && <div className="study__error" role="alert"><p>{error}</p>
          {saveState === 'failed' && <Button onClick={() => { if (answer?.correct !== undefined) void persistAnswer(answer.correct, answer.selectedIndex) }}>저장 다시 시도</Button>}
        </div>}
      </article>
      <p className="study__shortcuts">{question.kind === 'choice' ? '숫자키로 답 선택 · Space로 다음' : 'Space로 답 보기·다음 · 1 몰랐음 · 2 알았음'}</p>
    </Screen>
    <CardEditor deckId={deckId} open={editorOpen} card={card} onClose={() => setEditorOpen(false)}
      onSaved={(updated) => { void refreshCard(updated).catch(() => setError('수정한 카드를 불러오지 못했습니다. 덱으로 돌아가 다시 열어 주세요.')) }}
      onDeleted={() => { void removeCard() }} />
  </>
}
