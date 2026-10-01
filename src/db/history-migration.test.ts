import { expect, it } from 'vitest'
import Dexie from 'dexie'
import { db, listAnswerHistory } from './index'

it('v2 통계와 진행도는 보존하고 날짜 없는 과거 답을 만들지 않는다', async () => {
  await db.delete()
  const old = new Dexie('memonowz')
  old.version(2).stores({ decks: 'id, createdAt', cards: 'id, deckId', sessions: 'key' })
  await old.open()
  await old.table('decks').add({ id: 'd', name: '덱', createdAt: 1 })
  await old.table('cards').add({ id: 'c', deckId: 'd', stats: { right: 4, wrong: 2, lastSeenAt: 20 } })
  await old.table('sessions').add({ key: 'd', deckId: 'd', cardIds: ['c'], cursor: 1, results: [{ cardId: 'c', correct: true }], startedAt: 10 })
  old.close()
  await db.open()
  expect(await db.cards.get('c')).toMatchObject({ stats: { right: 4, wrong: 2 } })
  expect(await db.sessions.get('d')).toMatchObject({ cursor: 1, startedAt: 10 })
  expect(await listAnswerHistory()).toEqual([])
  expect(db.verno).toBe(3)
})
