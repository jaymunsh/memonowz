import { describe, expect, it } from 'vitest'
import Dexie from 'dexie'

// v1 저장소에 남아 있던 단일 세션('active')이 v2에서 deckId 키로 옮겨지는지 본다.
// 이 마이그레이션이 조용히 실패하면 진행 중이던 학습이 통째로 사라진다.
describe('세션 마이그레이션 v1 → v2', () => {
  it("key 'active' 한 건이 deckId 키로 다시 매겨진다", async () => {
    const legacy = new Dexie('memonowz')
    legacy.version(1).stores({ decks: 'id, createdAt', cards: 'id, deckId', sessions: 'key' })
    await legacy.open()
    await legacy.table('sessions').put({
      key: 'active', deckId: 'deck-1', cardIds: ['c1', 'c2'], cursor: 1, results: [], startedAt: 1,
    })
    legacy.close()

    const { getSession, listSessions } = await import('./index')

    expect(await getSession('deck-1')).toMatchObject({ deckId: 'deck-1', cursor: 1 })
    expect(await listSessions()).toHaveLength(1)
  })
})
