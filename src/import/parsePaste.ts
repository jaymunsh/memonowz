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

/** 스프레드시트나 메모에서 붙여넣은 두 열을 term 카드로 바꾼다. */
export const parsePaste = (text: string, options: PasteOptions): CardInput[] => {
  const normalized = text.replace(/\r\n?/g, '\n')
  const chunks = options.cardSep === 'blank'
    ? normalized.split(/\n\s*\n/)
    : normalized.split('\n')
  const delimiter = fieldDelimiter(options)

  return chunks.flatMap((chunk) => {
    const separatorIndex = chunk.indexOf(delimiter)
    if (separatorIndex < 0) return []

    const front = chunk.slice(0, separatorIndex).trim()
    const back = chunk.slice(separatorIndex + delimiter.length).trim()
    if (!front || !back) return []

    return [{ type: 'term', front, back, tags: [] }]
  })
}
