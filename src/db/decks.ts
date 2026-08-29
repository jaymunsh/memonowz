import { nanoid } from 'nanoid'
import { db } from './db'
import { clearActiveSession, getActiveSession } from './session'
import type { Deck, DeckInput, DeckSummary } from '../types'

export const createDeck = async (input: DeckInput): Promise<Deck> => {
  const deck: Deck = { ...input, id: nanoid(), createdAt: Date.now() }
  await db.decks.add(deck)
  return deck
}

export const getDeck = (id: string) => db.decks.get(id)

export const updateDeck = async (id: string, patch: Partial<DeckInput>) => {
  await db.decks.update(id, patch)
}

export const deleteDeck = async (id: string) => {
  await db.transaction('rw', db.decks, db.cards, async () => {
    await db.cards.where('deckId').equals(id).delete()
    await db.decks.delete(id)
  })
  // 지운 덱의 세션이 남아 있으면 이어하기가 빈 덱을 가리킨다
  const session = await getActiveSession()
  if (session?.deckId === id) await clearActiveSession()
}

export const listDeckSummaries = async (): Promise<DeckSummary[]> => {
  const decks = await db.decks.orderBy('createdAt').reverse().toArray()
  const cards = await db.cards.toArray()
  return decks.map((deck) => {
    const own = cards.filter((c) => c.deckId === deck.id)
    const right = own.reduce((n, c) => n + c.stats.right, 0)
    const wrong = own.reduce((n, c) => n + c.stats.wrong, 0)
    const total = right + wrong
    return { ...deck, cardCount: own.length, accuracy: total === 0 ? null : right / total }
  })
}
