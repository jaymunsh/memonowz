import Dexie, { type Table } from 'dexie'
import type { ActiveSession, Card, Deck } from '../types'

/** 세션 테이블은 항상 이 키 하나만 쓴다 — 진행 중 세션은 앱 전체에 한 건이다 */
export const ACTIVE_SESSION_KEY = 'active'

export type StoredSession = ActiveSession & { key: string }

class MemonowzDB extends Dexie {
  decks!: Table<Deck, string>
  cards!: Table<Card, string>
  sessions!: Table<StoredSession, string>

  constructor() {
    super('memonowz')
    this.version(1).stores({
      decks: 'id, createdAt',
      cards: 'id, deckId',
      sessions: 'key',
    })
  }
}

export const db = new MemonowzDB()
