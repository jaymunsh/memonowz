import { z } from 'zod'

export const deckInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
})
export type DeckInput = z.infer<typeof deckInputSchema>

export type Deck = DeckInput & {
  id: string
  createdAt: number
}

/** 홈 화면이 쓰는 덱 요약 */
export type DeckSummary = Deck & {
  cardCount: number
  /** 아직 한 번도 안 푼 덱은 null */
  accuracy: number | null
}
