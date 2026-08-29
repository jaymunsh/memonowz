import { db } from './db'
import { createDeck } from './decks'
import { createCards, listCards } from './cards'
import type { AllBackup, Backup, Card, CardInput, Deck } from '../types'

/** 저장소에만 있는 필드를 떨어뜨린다 — 백업 파일은 임포트 스키마와 같은 모양이어야 한다 */
const toInput = (card: Card): CardInput => {
  const { id: _id, deckId: _deckId, stats: _stats, ...input } = card
  return input as CardInput
}

export const exportDeck = async (deckId: string): Promise<Backup> => {
  const deck = await db.decks.get(deckId)
  if (!deck) throw new Error('덱을 찾을 수 없습니다')
  const cards = await listCards(deckId)
  return {
    deck: { name: deck.name, ...(deck.description ? { description: deck.description } : {}) },
    cards: cards.map(toInput),
  }
}

export const exportAll = async (): Promise<AllBackup> => {
  const decks = await db.decks.toArray()
  const all = await Promise.all(decks.map((d: Deck) => exportDeck(d.id)))
  return { decks: all }
}

/** 가져오기는 항상 새 덱으로 붙인다. 기존 덱을 지우거나 덮어쓰지 않는다 */
export const importBackup = async (backup: Backup): Promise<Deck> => {
  const deck = await createDeck(backup.deck)
  if (backup.cards.length > 0) await createCards(deck.id, backup.cards)
  return deck
}
