import { cardInputSchema, deckInputSchema, type CardInput, type DeckInput } from '../types'

export type ImportError = { index: number; message: string }

export const validateCards = (raw: unknown[]): { ok: CardInput[]; errors: ImportError[] } => {
  const ok: CardInput[] = []
  const errors: ImportError[] = []

  raw.forEach((item, i) => {
    const parsed = cardInputSchema.safeParse(item)
    if (parsed.success) {
      ok.push(parsed.data)
      return
    }

    const issue = parsed.error.issues[0]
    const path = issue.path.join('.')
    const where = path && !issue.message.startsWith(`${path}가`) ? `${path}가 ` : ''
    errors.push({ index: i + 1, message: `${i + 1}번째 항목: ${where}${issue.message}` })
  })

  return { ok, errors }
}

export type FileDeck = { deck: DeckInput | undefined; cards: unknown[] }

/**
 * 카드 파일이 취할 수 있는 세 가지 모양을 하나로 편다.
 *   { decks: [{ deck, cards }] }  전체 백업
 *   { deck, cards }               덱 하나
 *   [ ...cards ]                  카드만
 * 화면마다 다른 모양만 받으면 사람이 만든 파일이 이유 없이 거부된다.
 */
export const readDecksFromFile = (parsed: unknown): FileDeck[] | null => {
  const entry = (value: unknown): FileDeck | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    if (!Array.isArray(record.cards)) return null
    const deck = deckInputSchema.safeParse(record.deck)
    return { deck: deck.success ? deck.data : undefined, cards: record.cards }
  }

  if (Array.isArray(parsed)) return [{ deck: undefined, cards: parsed }]

  const root = parsed as Record<string, unknown> | null
  if (root && typeof root === 'object' && Array.isArray(root.decks)) {
    const decks = root.decks.map(entry)
    return decks.every((deck): deck is FileDeck => deck !== null) ? decks : null
  }

  const single = entry(parsed)
  return single ? [single] : null
}
