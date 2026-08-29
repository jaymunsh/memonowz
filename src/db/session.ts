import { db } from './db'
import type { ActiveSession } from '../types'

const strip = ({ key: _key, ...session }: { key: string } & ActiveSession): ActiveSession => session

/** 덱 하나의 진행 중 세션 */
export const getSession = async (deckId: string): Promise<ActiveSession | undefined> => {
  const stored = await db.sessions.get(deckId)
  return stored ? strip(stored) : undefined
}

/** 진행 중인 세션 전부. 홈에서 덱마다 이어하기를 보여줄 때 쓴다 */
export const listSessions = async (): Promise<ActiveSession[]> =>
  (await db.sessions.toArray()).map(strip)

export const saveSession = async (session: ActiveSession) => {
  await db.sessions.put({ ...session, key: session.deckId })
}

export const clearSession = (deckId: string) => db.sessions.delete(deckId)
