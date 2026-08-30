import { nanoid } from 'nanoid'
import { db } from './db'
import { emptyStats, type Card, type CardInput } from '../types'

export const listCards = (deckId: string) =>
  db.cards.where('deckId').equals(deckId).toArray()

export const getCard = (id: string) => db.cards.get(id)

const toCard = (deckId: string, input: CardInput): Card => ({
  ...input,
  id: nanoid(),
  deckId,
  stats: emptyStats(),
})

export const createCard = async (deckId: string, input: CardInput): Promise<Card> => {
  const card = toCard(deckId, input)
  await db.cards.add(card)
  return card
}

export const createCards = async (deckId: string, inputs: CardInput[]): Promise<Card[]> => {
  const cards = inputs.map((input) => toCard(deckId, input))
  await db.cards.bulkAdd(cards)
  return cards
}

/** 편집은 내용만 바꾼다. 누적된 stats는 유지한다 */
export const updateCard = async (id: string, input: CardInput) => {
  const existing = await db.cards.get(id)
  if (!existing) return
  await db.cards.put({ ...input, id, deckId: existing.deckId, stats: existing.stats })
}

export const deleteCard = (id: string) => db.cards.delete(id)

/** 외웠다고 표시한다. 틀림 기록만 지우고 맞힌 횟수는 남긴다 */
export const clearWrong = async (cardId: string) => {
  const card = await db.cards.get(cardId)
  if (!card) return
  await db.cards.update(cardId, { stats: { ...card.stats, wrong: 0 } })
}

/** 세션 종료가 아니라 매 채점마다 부른다. 중간에 나가도 푼 만큼은 남는다 */
export const recordAnswer = async (cardId: string, correct: boolean) => {
  const card = await db.cards.get(cardId)
  if (!card) return
  await db.cards.update(cardId, {
    stats: {
      right: card.stats.right + (correct ? 1 : 0),
      wrong: card.stats.wrong + (correct ? 0 : 1),
      lastSeenAt: Date.now(),
    },
  })
}
