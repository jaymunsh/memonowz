import { describe, expect, it } from 'vitest'
import { parsePaste, parsePasteDetailed } from './parsePaste'

describe('parsePaste', () => {
  it('탭 구분 + 줄바꿈으로 term 카드를 만든다', () => {
    const cards = parsePaste('cohesion\t응집도\ncoupling\t결합도', {
      cardSep: 'newline', fieldSep: 'tab',
    })
    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatchObject({ type: 'term', front: 'cohesion', back: '응집도' })
  })

  it('쉼표 구분도 처리한다', () => {
    const cards = parsePaste('a,1\nb,2', { cardSep: 'newline', fieldSep: 'comma' })
    expect(cards[1]).toMatchObject({ front: 'b', back: '2' })
  })

  it('빈 줄 구분(cardSep=blank)에서는 앞뒤가 각각 한 줄이다', () => {
    const cards = parsePaste('cohesion\n응집도\n\ncoupling\n결합도', {
      cardSep: 'blank', fieldSep: 'newline',
    })
    expect(cards).toHaveLength(2)
    expect(cards[1]).toMatchObject({ front: 'coupling', back: '결합도' })
  })

  it('구분자가 없는 줄은 건너뛴다', () => {
    const cards = parsePaste('a\t1\n쓰레기줄\nb\t2', { cardSep: 'newline', fieldSep: 'tab' })
    expect(cards).toHaveLength(2)
  })

  it('앞뒤 공백을 떼고, 양쪽이 다 있어야 카드가 된다', () => {
    const cards = parsePaste('  a  \t  1  \nc\t', { cardSep: 'newline', fieldSep: 'tab' })
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ front: 'a', back: '1' })
  })

  it('사용자 지정 구분자를 쓴다', () => {
    const cards = parsePaste('a::1\nb::2', { cardSep: 'newline', fieldSep: 'custom', custom: '::' })
    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatchObject({ back: '1' })
  })

  it('빈 입력은 빈 배열', () => {
    expect(parsePaste('   ', { cardSep: 'newline', fieldSep: 'tab' })).toEqual([])
  })
})

describe('parsePasteDetailed', () => {
  it('빈 줄과 잘못된 줄을 구별하고 빠진 앞면·뒷면을 알려 준다', () => {
    const result = parsePasteDetailed('a\t1\n\n구분자 없음\n\t뜻\n단어\t\nb\t2', {
      cardSep: 'newline', fieldSep: 'tab',
    })
    expect(result.cards).toHaveLength(2)
    expect(result.issues).toEqual([
      { line: 3, text: '구분자 없음', reason: 'missing-separator' },
      { line: 4, text: '\t뜻', reason: 'empty-front' },
      { line: 5, text: '단어\t', reason: 'empty-back' },
    ])
    expect(result.ignoredBlankCount).toBe(1)
  })

  it('빈 줄로 나눈 카드도 실제 시작 행을 가리키고 CRLF를 처리한다', () => {
    const result = parsePasteDetailed('a\r\n1\r\n\r\n잘못된 카드\r\n\r\nb\r\n2', {
      cardSep: 'blank', fieldSep: 'newline',
    })
    expect(result.cards).toHaveLength(2)
    expect(result.issues).toEqual([{ line: 4, text: '잘못된 카드', reason: 'missing-separator' }])
  })

  it('첫 구분자 이후의 내용은 기존처럼 뒷면에 모두 보존한다', () => {
    const text = '단어\t뜻\t추가 정보\n다음\t뜻'
    const options = { cardSep: 'newline', fieldSep: 'tab' } as const
    const result = parsePasteDetailed(text, options)
    expect(result.cards[0]).toMatchObject({ front: '단어', back: '뜻\t추가 정보' })
    expect(result.cards).toEqual(parsePaste(text, options))
    expect(result.issues).toEqual([])
  })

  it('빈 사용자 구분자는 기존 탭 구분으로 처리한다', () => {
    expect(parsePasteDetailed('a\t1', { cardSep: 'newline', fieldSep: 'custom', custom: '' }).cards)
      .toEqual(parsePaste('a\t1', { cardSep: 'newline', fieldSep: 'tab' }))
  })
})
