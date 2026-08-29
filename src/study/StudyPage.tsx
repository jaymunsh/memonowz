import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { clearActiveSession, getActiveSession, getDeck, listCards, recordAnswer, saveActiveSession } from '../db'
import type { ActiveSession, Card } from '../types'
import { Button, EmptyState, ProgressBar, Screen } from '../ui'
import { CardEditor } from '../card/CardEditor'
import { buildQuestion, orderCards } from './engine'
import './StudyPage.css'

type RetryState = { cardIds?: string[] }
type AnswerState = { correct?: boolean; selectedValue?: string; revealed?: boolean }

export const StudyPage = () => {
  const { deckId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const retryCardIds = useMemo(() => {
    const state = location.state as RetryState | null
    return Array.isArray(state?.cardIds) ? state.cardIds : undefined
  }, [location.state])
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
      const [deck, availableCards, active] = await Promise.all([getDeck(deckId), listCards(deckId), getActiveSession()])
      if (cancelled) return
      if (!deck) {
        navigate(`/deck/${deckId}`, { replace: true })
        return
      }

      const availableIds = new Set(availableCards.map((card) => card.id))
      const sameDeck = !retryCardIds && active?.deckId === deckId
      const ids = retryCardIds
        ? retryCardIds.filter((id, index) => availableIds.has(id) && retryCardIds.indexOf(id) === index)
        : sameDeck
          ? active.cardIds.filter((id) => availableIds.has(id))
          : orderCards(availableCards)
      const next: ActiveSession = sameDeck && active
        ? { ...active, cardIds: ids, cursor: Math.min(active.cursor, ids.length) }
        : { deckId, cardIds: ids, cursor: 0, results: [], startedAt: Date.now() }

      setCards(availableCards)
      setSession(next)
      setAnswer(null)
      setAnsweredCardId(null)
      setLoading(false)

      if (ids.length === 0) {
        await clearActiveSession()
      } else if (!sameDeck || next.cardIds.length !== active?.cardIds.length || next.cursor !== active?.cursor) {
        await saveActiveSession(next)
      }
    }
    void load().catch(() => {
      if (!cancelled) {
        setError('학습 세션을 불러오지 못했습니다.')
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [deckId, navigate, retryCardIds])
  const displayedCardId = answeredCardId ?? (session ? session.cardIds[session.cursor] : undefined)
  const card = cards.find((item) => item.id === displayedCardId)
  const question = useMemo(() => card ? buildQuestion(card, cards) : undefined, [card, cards])
  const total = session?.cardIds.length ?? 0
  const questionIndex = displayedCardId && session
    ? Math.max(0, session.cardIds.indexOf(displayedCardId))
    : session?.cursor ?? 0
  const isLast = questionIndex >= total - 1

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
      await Promise.all([recordAnswer(card.id, correct), saveActiveSession(next)])
      setSession(next)
    } catch {
      setError('채점 결과를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }
  const reveal = () => {
    if (!answer) setAnswer({ revealed: true })
  }
  const next = async () => {
    if (!session || answer?.correct === undefined || saving) return
    if (isLast) {
      await clearActiveSession()
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
    if (cardIds.length > 0) await saveActiveSession(nextSession)
    else await clearActiveSession()
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
        action={<Button onClick={() => setEditorOpen(true)}>이 카드 수정</Button>}
        foot={answer?.correct !== undefined && (
          <Button variant="primary" block disabled={saving} onClick={() => void next()}>
            {isLast ? '결과 보기' : '다음'}
          </Button>
        )}
      >
        <ProgressBar value={Math.min(session.cursor, total)} max={total} />
        <article className="study__question">
          <p className="study__stem">{question.stem}</p>

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
