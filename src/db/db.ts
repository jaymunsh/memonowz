import Dexie, { type Table } from 'dexie'
import type { ActiveSession, AnswerEvent, Card, Deck } from '../types'

/** v1에서 쓰던 단일 세션 키. 마이그레이션에서만 등장한다 */
const LEGACY_SESSION_KEY = 'active'

/** 세션은 덱마다 하나다. key가 곧 deckId다 */
export type StoredSession = ActiveSession & { key: string }

class MemonowzDB extends Dexie {
  decks!: Table<Deck, string>
  cards!: Table<Card, string>
  sessions!: Table<StoredSession, string>
  answerEvents!: Table<AnswerEvent, string>

  constructor() {
    super('memonowz')
    this.version(1).stores({
      decks: 'id, createdAt',
      cards: 'id, deckId',
      sessions: 'key',
    })
    // v2: 앱 전체 한 건이던 세션을 덱별로 나눈다. 키를 deckId로 다시 매긴다
    this.version(2).stores({
      decks: 'id, createdAt',
      cards: 'id, deckId',
      sessions: 'key',
    }).upgrade(async (tx) => {
      const sessions = tx.table<StoredSession, string>('sessions')
      const legacy = await sessions.get(LEGACY_SESSION_KEY)
      if (!legacy) return
      await sessions.delete(LEGACY_SESSION_KEY)
      if (legacy.deckId) await sessions.put({ ...legacy, key: legacy.deckId })
    })
    // 과거 누적 통계에는 답변 날짜가 없으므로 새 기록을 만들어 채우지 않는다.
    this.version(3).stores({
      decks: 'id, createdAt', cards: 'id, deckId', sessions: 'key',
      answerEvents: 'id, deckId, cardId, answeredAt, &[sessionId+cursor]',
    })
  }
}

export const db = new MemonowzDB()
