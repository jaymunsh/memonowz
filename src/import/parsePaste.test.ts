import { describe, expect, it } from 'vitest'
import { parsePaste } from './parsePaste'

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
