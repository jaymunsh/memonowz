import { cardInputSchema, type CardInput } from '../types'

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
