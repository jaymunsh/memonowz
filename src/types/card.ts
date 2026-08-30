import { z } from 'zod'

export const cardStatsSchema = z.object({
  right: z.number().int().nonnegative(),
  wrong: z.number().int().nonnegative(),
  lastSeenAt: z.number().nullable(),
})
export type CardStats = z.infer<typeof cardStatsSchema>

const shared = {
  tags: z.array(z.string()).default([]),
  explanation: z.string().optional(),
}

export const termInputSchema = z.object({
  type: z.literal('term'),
  front: z.string().min(1),
  back: z.string().min(1),
  /** 직접 넣은 오답 보기. 없으면 같은 덱 다른 카드의 back에서 뽑는다 */
  distractors: z.array(z.string()).optional(),
  ...shared,
})

export const mcqInputSchema = z.object({
  type: z.literal('mcq'),
  question: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2),
  answer: z.number().int().nonnegative(),
  ...shared,
})

export const qaInputSchema = z.object({
  type: z.literal('qa'),
  question: z.string().min(1),
  answer: z.string().min(1),
  ...shared,
})

// discriminatedUnion의 멤버에는 .refine을 걸 수 없어(ZodEffects가 되어 거부된다)
// 교차 필드 검증은 union 바깥에서 한다.
export const cardInputSchema = z
  .discriminatedUnion('type', [termInputSchema, mcqInputSchema, qaInputSchema])
  .superRefine((card, ctx) => {
    if (card.type === 'mcq' && card.answer >= card.choices.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['answer'],
        message: 'answer가 choices 범위를 벗어남',
      })
    }
  })

export type CardInput = z.infer<typeof cardInputSchema>
export type CardType = CardInput['type']

/** 저장 값(term/mcq/qa)은 JSON 계약이라 그대로 두고, 화면에 보이는 이름만 여기서 정한다 */
export const cardTypeLabel: Record<CardType, string> = {
  term: '단어',
  mcq: '객관식',
  qa: '주관식',
}

export type Card = CardInput & {
  id: string
  deckId: string
  stats: CardStats
}

export const emptyStats = (): CardStats => ({ right: 0, wrong: 0, lastSeenAt: null })

/** 카드의 첫머리. 목록·결과·정렬이 모두 이걸 기준으로 삼는다 */
export const cardPrompt = (card: Card) => (card.type === 'term' ? card.front : card.question)
