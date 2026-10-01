import type { CardInput } from '../types'

export type PasteOptions = {
  /** newline: 한 줄이 카드 하나 · blank: 빈 줄로 카드를 나눈다 */
  cardSep: 'newline' | 'blank'
  fieldSep: 'tab' | 'comma' | 'newline' | 'custom'
  custom?: string
}

const fieldDelimiter = (options: PasteOptions): string => {
  if (options.fieldSep === 'tab') return '\t'
  if (options.fieldSep === 'comma') return ','
  if (options.fieldSep === 'custom') return options.custom || '\t'
  return '\n'
}

export type PasteIssue = {
  /** 원문에서 카드가 시작하는 행 (1부터). */
  line: number
  text: string
  reason: 'missing-separator' | 'empty-front' | 'empty-back'
}

/** 첫 구분자를 기준으로 나누며, 제외한 내용도 미리보기에서 설명한다. */
export const parsePasteDetailed = (text: string, options: PasteOptions): {
  cards: CardInput[]; issues: PasteIssue[]; ignoredBlankCount: number
} => {
  const normalized = text.replace(/\r\n?/g, '\n')
  const separator = options.cardSep === 'blank' ? /\n\s*\n/g : /\n/g
  const delimiter = fieldDelimiter(options)
  const cards: CardInput[] = []
  const issues: PasteIssue[] = []
  let ignoredBlankCount = 0
  let offset = 0
  let line = 1

  const readChunk = (chunk: string) => {
    if (!chunk.trim()) {
      if (chunk.length > 0 || normalized.length > 0) ignoredBlankCount += 1
      return
    }
    const separatorIndex = chunk.indexOf(delimiter)
    if (separatorIndex < 0) {
      issues.push({ line, text: chunk, reason: 'missing-separator' })
      return
    }

    const front = chunk.slice(0, separatorIndex).trim()
    const back = chunk.slice(separatorIndex + delimiter.length).trim()
    if (!front || !back) {
      issues.push({ line, text: chunk, reason: !front ? 'empty-front' : 'empty-back' })
      return
    }
    cards.push({ type: 'term', front, back, tags: [], starred: false })
  }

  for (const match of normalized.matchAll(separator)) {
    const chunk = normalized.slice(offset, match.index)
    readChunk(chunk)
    line += (chunk.match(/\n/g)?.length ?? 0) + (match[0].match(/\n/g)?.length ?? 0)
    offset = match.index + match[0].length
  }
  readChunk(normalized.slice(offset))
  return { cards, issues, ignoredBlankCount }
}

/** 기존 호출자를 위해 카드 배열 반환을 유지한다. */
export const parsePaste = (text: string, options: PasteOptions): CardInput[] =>
  parsePasteDetailed(text, options).cards
