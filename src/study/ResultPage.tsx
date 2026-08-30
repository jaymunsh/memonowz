import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { listCards } from '../db'
import { cardAnswer, cardPrompt, type Card, type SessionResult } from '../types'
import { Badge, Button, EmptyState, Screen } from '../ui'
import './ResultPage.css'

type ResultState = { results?: SessionResult[]; total?: number }

export const ResultPage = () => {
  const { deckId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as ResultState | null
  const results = state?.results
  const valid = Array.isArray(results)
  const [cards, setCards] = useState<Card[]>([])

  useEffect(() => {
    if (!valid) {
      navigate(`/deck/${deckId}`, { replace: true })
      return
    }
    void listCards(deckId).then(setCards)
  }, [deckId, navigate, valid])

  const cardMap = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])
  if (!valid || !results) return null

  const total = state?.total ?? results.length
  const right = results.filter((result) => result.correct).length
  const wrongResults = results.filter((result) => !result.correct)
  const entries = [...results]
    .map((result, index) => ({ result, card: cardMap.get(result.cardId), index }))
    .sort((a, b) => Number(a.result.correct) - Number(b.result.correct) || a.index - b.index)

  const retry = () => navigate(`/study/${deckId}`, {
    state: { cardIds: wrongResults.map((result) => result.cardId) },
  })
  const goDeck = () => navigate(`/deck/${deckId}`)

  return (
    <Screen
      title="결과"
      back={goDeck}
      foot={
        <>
          {wrongResults.length > 0
            ? <Button variant="primary" block onClick={retry}>틀린 것만 다시 풀기 ({wrongResults.length})</Button>
            : <p className="result__complete">다 맞혔습니다.</p>}
          <Button block onClick={goDeck}>덱으로</Button>
        </>
      }
    >
      <section className="result__summary" aria-label="학습 결과 요약">
        <h2>{total}문제 중 {right}개</h2>
        <div className="result__stats">
          <div className="result__stat result__stat--ok"><span>맞음</span><strong>{right}</strong></div>
          <div className="result__stat result__stat--bad"><span>틀림</span><strong>{wrongResults.length}</strong></div>
        </div>
      </section>

      <section className="result__list" aria-label="푼 카드 목록">
        {entries.length === 0 && <EmptyState>이번 세션에서 푼 카드가 없습니다.</EmptyState>}
        {entries.map(({ result, card }) => (
          <details key={`${result.cardId}-${result.correct}`} className="result__item">
            <summary>
              <Badge tone={result.correct ? 'ok' : 'bad'}>{result.correct ? '정답' : '오답'}</Badge>
              <span>{card ? cardPrompt(card).split('\n')[0] : '삭제된 카드'}</span>
            </summary>
            <div className="result__detail">
              {card
                ? <p><strong>정답</strong><span>{cardAnswer(card)}</span></p>
                : <p>이 카드는 삭제되어 내용을 표시할 수 없습니다.</p>}
              {card?.explanation && <p><strong>설명</strong><span>{card.explanation}</span></p>}
            </div>
          </details>
        ))}
      </section>
    </Screen>
  )
}
