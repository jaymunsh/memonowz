import { z } from 'zod'

export const deckInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  /**
   * 뒤집기로만 출제하는 덱. 보기를 만들지 않고 답을 떠올린 뒤 스스로 채점한다.
   * 면접질문·서술형처럼 정답이 문장인 것들. 기본값은 단어장(객관식 출제)이다.
   */
  flipOnly: z.boolean().default(false),
})
export type DeckInput = z.infer<typeof deckInputSchema>

/** 덱 유형 탭. 저장은 flipOnly 불리언 하나다 */
export const deckModeOptions = [
  { value: 'word' as const, label: '단어장' },
  { value: 'flip' as const, label: '플래시카드' },
]
export const deckModeHint = '단어장은 보기 중에 고르고, 플래시카드는 답을 떠올린 뒤 뒤집어 스스로 채점한다.'

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
