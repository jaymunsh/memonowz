import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { db, listAnswerHistory, summarizeAnswerHistory } from '../db'
import { cardPrompt, type AnswerEvent, type Card, type Deck } from '../types'
import { Button, EmptyState, Screen } from '../ui'
import './HistoryPage.css'

const count = new Intl.NumberFormat('ko-KR')
const dateLabel = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
const accuracy = (right: number, total: number) => `${Math.round(right / total * 100)}%`

export const HistoryPage = () => {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const deckId = params.get('deck') ?? ''
  const [decks, setDecks] = useState<Deck[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [events, setEvents] = useState<AnswerEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    db.transaction('r', db.decks, db.cards, db.answerEvents, async () =>
      Promise.all([db.decks.orderBy('createdAt').reverse().toArray(), db.cards.toArray(), listAnswerHistory()]),
    ).then(([nextDecks, nextCards, nextEvents]) => {
      if (cancelled) return
      setDecks(nextDecks); setCards(nextCards); setEvents(nextEvents)
    }).catch(() => { if (!cancelled) setError('학습 기록을 불러오지 못했습니다. 다시 시도해 주세요.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [attempt])
  const selected = decks.find((deck) => deck.id === deckId)
  const summary = useMemo(() => summarizeAnswerHistory(deckId ? events.filter((event) => event.deckId === deckId) : events), [deckId, events])
  const cardMap = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])
  const deckMap = useMemo(() => new Map(decks.map((deck) => [deck.id, deck])), [decks])
  const back = () => navigate(selected ? `/deck/${selected.id}` : '/')

  return <Screen title="학습 기록" back={back}>
    {loading ? <EmptyState>학습 기록을 불러오는 중입니다.</EmptyState> : error ? <div className="history__empty">
      <p className="form-error" role="alert">{error}</p>
      <Button onClick={() => setAttempt((value) => value + 1)}>다시 시도</Button>
    </div> : <div className="history">
      <label className="history__filter">기록을 볼 덱
        <select value={deckId} onChange={(event) => setParams(event.target.value ? { deck: event.target.value } : {})}>
          <option value="">모든 덱</option>
          {deckId && !selected && <option value={deckId}>삭제되었거나 없는 덱</option>}
          {decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
        </select>
      </label>
      {summary.total === 0 ? <div className="history__empty">
        <h2>{deckId && !selected ? '덱을 찾을 수 없습니다' : '아직 학습 기록이 없습니다'}</h2>
        <p>카드를 채점하면 날짜별 정답률과 자주 틀린 카드가 여기에 쌓입니다. 이전 버전에서 푼 카드는 날짜 정보가 없어 포함되지 않습니다.</p>
        {selected ? <Link to={`/deck/${selected.id}`}>이 덱 학습하기</Link> : <Link to="/">내 덱으로</Link>}
      </div> : <>
        <section className="history__section" aria-labelledby="history-days">
          <div className="history__heading"><h2 id="history-days">날짜별 학습</h2>
            <p>총 {count.format(summary.total)}번 채점 · {count.format(summary.right)}번 정답 · 정답률 {accuracy(summary.right, summary.total)}</p>
          </div>
          <div className="history__table-wrap"><table className="history__table">
            <caption>현재 시간대 기준으로, 학습한 날짜만 표시합니다.</caption>
            <thead><tr><th scope="col">날짜</th><th scope="col">푼 수</th><th scope="col">정답</th><th scope="col">정답률</th></tr></thead>
            <tbody>{summary.days.map((day) => <tr key={day.date}>
              <th scope="row"><time dateTime={day.date}>{dateLabel.format(day.timestamp)}</time></th>
              <td>{count.format(day.total)}</td><td>{count.format(day.right)}</td><td>{accuracy(day.right, day.total)}</td>
            </tr>)}</tbody>
          </table></div>
          <p className="history__note">중간에 끝낸 학습도 포함됩니다. 이전 버전의 누적 통계에는 날짜가 없어 이 기록에 포함되지 않습니다.</p>
        </section>
        <section className="history__section" aria-labelledby="history-wrong">
          <div className="history__heading"><h2 id="history-wrong">자주 틀린 카드</h2>
            <p>틀린 횟수가 많은 순서입니다. ‘외웠어요’를 눌러도 지난 기록은 남습니다.</p>
          </div>
          {summary.wrongCards.length === 0 ? <EmptyState>기록된 오답이 없습니다.</EmptyState> : <ol className="history__wrong-list">
            {summary.wrongCards.slice(0, 10).map((entry) => {
              const card = cardMap.get(entry.cardId)
              const content = <><span className="history__card-copy"><strong>{card ? cardPrompt(card) : '삭제된 카드'}</strong>
                <span>{deckMap.get(entry.deckId)?.name ?? '삭제된 덱'}{!card && ' · 내용은 표시할 수 없습니다'}</span></span>
                <span className="history__card-count"><strong>틀림 {count.format(entry.wrong)}</strong><span>{count.format(entry.total)}번 중</span></span></>
              return <li key={`${entry.deckId}:${entry.cardId}`}>
                {card ? <Link className="history__wrong-row" to={`/deck/${encodeURIComponent(entry.deckId)}?card=${encodeURIComponent(entry.cardId)}`} aria-label={`${cardPrompt(card)} 카드 확인, ${entry.wrong}번 틀림`}>{content}</Link>
                  : <div className="history__wrong-row history__wrong-row--deleted">{content}</div>}
              </li>
            })}
          </ol>}
          {summary.wrongCards.length > 10 && <p className="history__note">오답 기록이 있는 {count.format(summary.wrongCards.length)}장 중 상위 10장입니다. 덱을 선택하면 해당 덱의 순위를 볼 수 있습니다.</p>}
        </section>
      </>}
    </div>}
  </Screen>
}
