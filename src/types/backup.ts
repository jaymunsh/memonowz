import { z } from 'zod'
import { cardInputSchema } from './card'
import { deckInputSchema } from './deck'
import { answerEventSchema, legacySessionId } from './history'

/** 덱 하나짜리 임포트/익스포트 파일 */
export const backupSchema = z.object({
  deck: deckInputSchema,
  cards: z.array(cardInputSchema),
})
export type Backup = z.infer<typeof backupSchema>

/** 이전 버전의 전체 교환 파일. 통계와 세션은 포함하지 않는다. */
export const allBackupSchema = z.object({
  decks: z.array(backupSchema),
})
export type AllBackup = z.infer<typeof allBackupSchema>

/** 덱마다 한 건의 학습 진행도. 완료 상태도 결과 복원을 위해 저장한다. */
export type SessionResult = { cardId: string; correct: boolean }

export type ActiveSession = {
  deckId: string
  /** 세션 시작 시 확정된 출제 순서. 이후 바뀌지 않는다 */
  cardIds: string[]
  /** 다음에 풀 인덱스 */
  cursor: number
  results: SessionResult[]
  startedAt: number
  /** 새 세션의 영구 식별자. 이전 저장소는 deckId와 startedAt으로 식별한다. */
  sessionId?: string
  /** 삭제된 결과도 포함한 총 채점 위치. 화면의 cursor와 별개다. */
  answerCount?: number
  /** 타임어택으로 시작했는지. 이어하기가 같은 조건으로 돌아온다 */
  timed?: boolean
  /** 어떤 조건으로 시작했는지 사람이 읽는 한 줄 (예: "★ 핵심 · #사자성어 · 랜덤순") */
  label?: string
}

const storedDeckSchema = deckInputSchema.extend({
  id: z.string().min(1),
  createdAt: z.number().finite().nonnegative(),
})

const storedCardSchema = cardInputSchema.and(z.object({
  id: z.string().min(1),
  deckId: z.string().min(1),
  stats: z.object({
    right: z.number().int().nonnegative(),
    wrong: z.number().int().nonnegative(),
    lastSeenAt: z.number().finite().nonnegative().nullable(),
  }),
}))

/** 저장된 진행도는 앞에서부터 cursor개를 순서대로 채점한 상태다. */
export const activeSessionSchema = z.object({
  deckId: z.string().min(1),
  cardIds: z.array(z.string().min(1)),
  cursor: z.number().int().nonnegative(),
  results: z.array(z.object({ cardId: z.string().min(1), correct: z.boolean() })),
  startedAt: z.number().finite().nonnegative(),
  sessionId: z.string().min(1).optional(),
  answerCount: z.number().int().nonnegative().optional(),
  timed: z.boolean().optional(),
  label: z.string().optional(),
}).superRefine((session, ctx) => {
  if (session.answerCount !== undefined && session.answerCount < session.cursor) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answerCount'], message: '채점 횟수가 진행도보다 작습니다' })
  }
  if (session.cursor > session.cardIds.length || session.results.length !== session.cursor) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cursor'], message: '세션 진행도와 결과가 일치하지 않습니다' })
  }
  if (new Set(session.cardIds).size !== session.cardIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cardIds'], message: '세션 카드가 중복됩니다' })
  }
  session.results.forEach((result, index) => {
    if (result.cardId !== session.cardIds[index]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['results', index], message: '결과와 출제 순서가 일치하지 않습니다' })
    }
  })
})

/** 교환용 파일과 구분되는, 통계와 진행 중 세션까지 보존하는 전체 백업. */
export const fullBackupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.number().finite().nonnegative(),
  decks: z.array(storedDeckSchema),
  cards: z.array(storedCardSchema),
  sessions: z.array(activeSessionSchema),
  history: z.array(answerEventSchema).optional(),
}).superRefine((backup, ctx) => {
  const decks = new Set<string>()
  const cards = new Map<string, string>()
  const sessions = new Set<string>()
  const activeSessionIds = new Set<string>()
  const activeSessions = new Map<string, ActiveSession>()
  backup.decks.forEach((deck, index) => {
    if (decks.has(deck.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['decks', index, 'id'], message: '덱 ID가 중복됩니다' })
    }
    decks.add(deck.id)
  })
  backup.cards.forEach((card, index) => {
    if (cards.has(card.id) || !decks.has(card.deckId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cards', index], message: '카드 ID 또는 덱 참조가 올바르지 않습니다' })
    }
    cards.set(card.id, card.deckId)
  })
  backup.sessions.forEach((session, index) => {
    const effectiveId = session.sessionId ?? legacySessionId(session.deckId, session.startedAt)
    if (sessions.has(session.deckId) || !decks.has(session.deckId)
      || activeSessionIds.has(effectiveId)
      || session.cardIds.some((id) => cards.get(id) !== session.deckId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sessions', index], message: '세션의 덱 또는 카드 참조가 올바르지 않습니다' })
    }
    sessions.add(session.deckId)
    activeSessionIds.add(effectiveId)
    activeSessions.set(effectiveId, session)
  })
  const eventIds = new Set<string>()
  const positions = new Set<string>()
  const sessionDecks = new Map<string, string>()
  backup.sessions.forEach((session) => {
    sessionDecks.set(session.sessionId ?? legacySessionId(session.deckId, session.startedAt), session.deckId)
  })
  backup.history?.forEach((event, index) => {
    const position = JSON.stringify([event.sessionId, event.cursor])
    const session = activeSessions.get(event.sessionId)
    const nextAnswer = session ? session.answerCount ?? session.cursor : undefined
    const result = session?.results.find((entry) => entry.cardId === event.cardId)
    // 기존 세션에 연결된 답은 다음 채점 위치보다 앞서야 한다. 삭제로 결과가
    // 압축됐을 때는 카드 ID로 비교하고, 압축 전에는 원래 위치도 확인한다.
    const conflictingProgress = session !== undefined && (
      event.cursor >= nextAnswer!
      || (result !== undefined && result.correct !== event.correct)
      || (session.cardIds.includes(event.cardId) && result === undefined)
      || (nextAnswer === session.cursor && session.results[event.cursor]?.cardId !== event.cardId)
    )
    // 삭제된 카드의 참조는 허용한다. 살아 있는 다른 덱의 카드 참조는 거절한다.
    if (!decks.has(event.deckId) || (cards.has(event.cardId) && cards.get(event.cardId) !== event.deckId)
      || eventIds.has(event.id) || positions.has(position)
      || conflictingProgress
      || (sessionDecks.has(event.sessionId) && sessionDecks.get(event.sessionId) !== event.deckId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['history', index], message: '학습 기록의 ID 또는 참조가 올바르지 않습니다' })
    }
    eventIds.add(event.id)
    positions.add(position)
    sessionDecks.set(event.sessionId, event.deckId)
  })
})
export type FullBackup = z.infer<typeof fullBackupSchema>
