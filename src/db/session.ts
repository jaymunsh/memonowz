import { ACTIVE_SESSION_KEY, db } from './db'
import type { ActiveSession } from '../types'

export const getActiveSession = async (): Promise<ActiveSession | undefined> => {
  const stored = await db.sessions.get(ACTIVE_SESSION_KEY)
  if (!stored) return undefined
  const { key: _key, ...session } = stored
  return session
}

export const saveActiveSession = async (session: ActiveSession) => {
  await db.sessions.put({ ...session, key: ACTIVE_SESSION_KEY })
}

export const clearActiveSession = () => db.sessions.delete(ACTIVE_SESSION_KEY)
