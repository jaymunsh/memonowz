import { z } from 'zod'

/** 실제 채점 한 건. 카드가 삭제되어도 ID와 결과·시각은 보존한다. */
export const answerEventSchema = z.object({
  id: z.string().min(1),
  deckId: z.string().min(1),
  cardId: z.string().min(1),
  sessionId: z.string().min(1),
  cursor: z.number().int().nonnegative(),
  correct: z.boolean(),
  answeredAt: z.number().finite().nonnegative().max(8_640_000_000_000_000),
})
export type AnswerEvent = z.infer<typeof answerEventSchema>

export const answerEventId = (sessionId: string, cursor: number): string => JSON.stringify([sessionId, cursor])
export const legacySessionId = (deckId: string, startedAt: number): string => JSON.stringify([deckId, startedAt])
