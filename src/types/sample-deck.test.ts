import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { allBackupSchema } from './backup'

// 문서(docs/card-authoring.md)가 설명하는 형식을 예시 파일이 실제로 지키는지 본다.
// 스키마가 바뀌면 여기서 먼저 깨진다.
describe('예시 덱', () => {
  const raw: unknown = JSON.parse(readFileSync('docs/examples/sample-deck.json', 'utf8'))

  it('전체 백업 스키마를 통과한다', () => {
    expect(allBackupSchema.safeParse(raw).success).toBe(true)
  })

  it('세 가지 카드 유형을 모두 담고 있다', () => {
    const cards = allBackupSchema.parse(raw).decks[0].cards
    expect(new Set(cards.map((card) => card.type))).toEqual(new Set(['term', 'mcq', 'qa']))
  })
})
