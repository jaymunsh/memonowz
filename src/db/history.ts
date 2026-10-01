import { db } from './db'
import type { AnswerEvent } from '../types'

/** 전체 또는 덱별 실제 답변 기록. 최근 채점부터 반환한다. */
export const listAnswerHistory = async (deckId?: string): Promise<AnswerEvent[]> => {
  const events = deckId === undefined
    ? await db.answerEvents.toArray()
    : await db.answerEvents.where('deckId').equals(deckId).toArray()
  return events.sort((a, b) => b.answeredAt - a.answeredAt || b.cursor - a.cursor || a.id.localeCompare(b.id))
}

export const summarizeAnswerHistory = (events: readonly AnswerEvent[]) => {
  const days = new Map<string, { date: string; timestamp: number; total: number; right: number }>()
  const cards = new Map<string, { cardId: string; deckId: string; total: number; wrong: number; lastWrongAt: number }>()
  let right = 0
  for (const event of events) {
    const local = new Date(event.answeredAt)
    const date = [local.getFullYear(), String(local.getMonth() + 1).padStart(2, '0'), String(local.getDate()).padStart(2, '0')].join('-')
    const day = days.get(date) ?? { date, timestamp: event.answeredAt, total: 0, right: 0 }
    day.total += 1
    day.right += Number(event.correct)
    right += Number(event.correct)
    days.set(date, day)
    const key = JSON.stringify([event.deckId, event.cardId])
    const card = cards.get(key) ?? { cardId: event.cardId, deckId: event.deckId, total: 0, wrong: 0, lastWrongAt: 0 }
    card.total += 1
    if (!event.correct) { card.wrong += 1; card.lastWrongAt = Math.max(card.lastWrongAt, event.answeredAt) }
    cards.set(key, card)
  }
  return { total: events.length, right,
    days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)),
    wrongCards: [...cards.values()].filter((card) => card.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong || b.lastWrongAt - a.lastWrongAt),
  }
}
