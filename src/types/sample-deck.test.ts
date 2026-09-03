import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { allBackupSchema } from './backup'
import { cardAnswer, emptyStats } from './card'

// 문서(docs/card-authoring.md)가 설명하는 형식을 예시 파일이 실제로 지키는지 본다.
// 스키마가 바뀌면 여기서 먼저 깨진다.
describe('예시 덱', () => {
  const raw: unknown = JSON.parse(readFileSync('docs/examples/sample-deck.json', 'utf8'))

  it('전체 백업 스키마를 통과한다', () => {
    expect(allBackupSchema.safeParse(raw).success).toBe(true)
  })

  it('단어장 덱은 두 카드 유형을 모두 담고 있다', () => {
    const [word] = allBackupSchema.parse(raw).decks
    expect(word.deck.flipOnly).toBe(false)
    expect(new Set(word.cards.map((card) => card.type))).toEqual(new Set(['term', 'mcq']))
  })

  it('플래시카드 덱은 flipOnly이고 답이 문장이다', () => {
    const flip = allBackupSchema.parse(raw).decks[1]
    expect(flip.deck.flipOnly).toBe(true)
    // 보기로 만들 수 없는 길이여야 예시 구실을 한다
    for (const card of flip.cards) expect(cardAnswer({ ...card, id: 'x', deckId: 'd', stats: emptyStats() }).length).toBeGreaterThan(30)
  })
})
