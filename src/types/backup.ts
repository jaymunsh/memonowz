import { z } from 'zod'
import { cardInputSchema } from './card'
import { deckInputSchema } from './deck'

/** 덱 하나짜리 임포트/익스포트 파일 */
export const backupSchema = z.object({
  deck: deckInputSchema,
  cards: z.array(cardInputSchema),
})
export type Backup = z.infer<typeof backupSchema>

/** 전체 백업 파일 */
export const allBackupSchema = z.object({
  decks: z.array(backupSchema),
})
export type AllBackup = z.infer<typeof allBackupSchema>

/** 진행 중인 세션. 앱 전체에 한 건만 존재한다 */
export type SessionResult = { cardId: string; correct: boolean }

export type ActiveSession = {
  deckId: string
  /** 세션 시작 시 확정된 출제 순서. 이후 바뀌지 않는다 */
  cardIds: string[]
  /** 다음에 풀 인덱스 */
  cursor: number
  results: SessionResult[]
  startedAt: number
  /** 타임어택으로 시작했는지. 이어하기가 같은 조건으로 돌아온다 */
  timed?: boolean
}
