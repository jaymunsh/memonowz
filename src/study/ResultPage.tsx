import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { clearSession, clearWrong, getSession, listCards, toggleStar } from '../db'
import { cardAnswer, cardPrompt, type ActiveSession, type Card } from '../types'
import { Badge, Button, EmptyState, Icon, Screen } from '../ui'
import './ResultPage.css'

export const ResultPage = () => {
  const { deckId = '' } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<ActiveSession>()
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const pending = useRef(false)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([getSession(deckId), listCards(deckId)]).then(([stored, available]) => {
      if (cancelled) return
      if (!stored || stored.cursor < stored.cardIds.length) { navigate(`/deck/${deckId}`, { replace: true }); return }
      setSession(stored)
      setCards(available)
    }).catch(() => { if (!cancelled) setError('결과를 불러오지 못했습니다. 다시 시도해 주세요.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [deckId, navigate, attempt])
  const cardMap = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])
  const goDeck = () => navigate(`/deck/${deckId}`)
  const action = async (operation: () => Promise<unknown>) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try { await operation(); setCards(await listCards(deckId)) }
    catch { setError('변경 내용을 저장하지 못했습니다. 다시 시도해 주세요.') }
    finally { pending.current = false; setBusy(false) }
  }
  if (loading || !session) return <Screen title="결과" back={goDeck}>
    <EmptyState>{error || '결과를 불러오는 중입니다.'}</EmptyState>
    {error && <Button onClick={() => setAttempt((value) => value + 1)}>다시 시도</Button>}
  </Screen>
  const results = session.results
  const right = results.filter((result) => result.correct).length
  const wrong = results.filter((result) => !result.correct && cardMap.has(result.cardId))
  const entries = results.map((result, index) => ({ result, card: cardMap.get(result.cardId), index }))
    .sort((a, b) => Number(a.result.correct) - Number(b.result.correct) || a.index - b.index)
  const retry = async () => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      await clearSession(deckId)
      navigate(`/study/${deckId}`, { state: { cardIds: wrong.map((item) => item.cardId), order: 'random', timed: session.timed, label: '오답 다시 풀기' } })
    } catch { setError('새 시험을 시작하지 못했습니다. 다시 시도해 주세요.') }
    finally { pending.current = false; setBusy(false) }
  }
  return <Screen title="결과" back={goDeck} foot={<>
    {wrong.length > 0 ? <Button variant="primary" block disabled={busy} onClick={() => void retry()}>틀린 것만 다시 풀기 ({wrong.length})</Button>
      : <p className="result__complete">다 맞혔습니다.</p>}
    <Button block onClick={goDeck}>덱으로</Button>
  </>}>
    <section className="result__summary" aria-label="학습 결과 요약">
      <h2>{results.length}문제 중 {right}개</h2>
      <p className="result__note">{wrong.length ? '틀린 카드를 확인하고 한 번 더 풀어보세요.' : '이번 시험을 모두 마쳤습니다.'}</p>
      <div className="result__stats"><div className="result__stat result__stat--ok"><span>맞음</span><strong>{right}</strong></div>
        <div className="result__stat result__stat--bad"><span>틀림</span><strong>{results.length - right}</strong></div></div>
    </section>
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="result__list" aria-label="푼 카드 목록">
      {entries.length === 0 && <EmptyState>이번 시험에서 푼 카드가 없습니다.</EmptyState>}
      {entries.map(({ result, card }) => <details key={result.cardId} className="result__item">
        <summary><Badge tone={result.correct ? 'ok' : 'bad'}>{result.correct ? '정답' : '오답'}</Badge><span>{card ? cardPrompt(card).split('\n')[0] : '삭제된 카드'}</span></summary>
        <div className="result__detail">
          {card ? <><p><strong>문제</strong><span>{cardPrompt(card)}</span></p><p><strong>정답</strong><span>{cardAnswer(card)}</span></p></>
            : <p>이 카드는 삭제되어 내용을 표시할 수 없습니다.</p>}
          {card?.explanation && <p><strong>설명</strong><span>{card.explanation}</span></p>}
          {card && <div className="result__actions">
            <Button disabled={busy} onClick={() => void action(() => toggleStar(card.id))}><Icon name="star" size={16} filled={Boolean(card.starred)} />{card.starred ? '핵심 해제' : '핵심으로'}</Button>
            {card.stats.wrong > 0 && <Button disabled={busy} onClick={() => void action(() => clearWrong(card.id))}>외웠어요 (틀림 {card.stats.wrong})</Button>}
          </div>}
        </div>
      </details>)}
    </section>
  </Screen>
}
