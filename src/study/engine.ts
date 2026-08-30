import { cardPrompt, type Card } from '../types'

export type Question =
  | { kind: 'choice'; cardId: string; stem: string; choices: string[]; answerIndex: number }
  | { kind: 'flip'; cardId: string; stem: string; answer: string }

/** 배열을 바꾸지 않고 Fisher–Yates 방식으로 섞는다. */
const shuffle = <T>(items: T[], rng: () => number = Math.random): T[] => {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** 무엇을 어떤 순서로 낼지 */
export type StudyOrder = 'alpha' | 'random' | 'wrong' | 'starred'

/** 틀린 적 있는 카드. 덱 목록의 "틀림 n" 배지와 같은 기준이다 */
export const wrongCards = (cards: Card[]) => cards.filter((card) => card.stats.wrong > 0)

export const orderCards = (
  cards: Card[],
  order: StudyOrder = 'alpha',
  rng: () => number = Math.random,
): string[] => {
  if (order === 'random') return shuffle(cards, rng).map((card) => card.id)
  if (order === 'wrong') return wrongCards(cards).map((card) => card.id)
  if (order === 'starred') return cards.filter((card) => card.starred).map((card) => card.id)
  // 한글·영어·한자가 섞여도 로케일 규칙으로 정렬한다
  return [...cards]
    .sort((a, b) => cardPrompt(a).localeCompare(cardPrompt(b), 'ko'))
    .map((card) => card.id)
}

const unique = (items: string[]) => [...new Set(items)]

export const buildQuestion = (
  card: Card,
  pool: Card[],
  rng: () => number = Math.random,
): Question => {
  if (card.type === 'term') {
    const rawCandidates = card.distractors ?? pool
      .filter((candidate) => (
        candidate.deckId === card.deckId && candidate.type === 'term' &&
        candidate.id !== card.id && candidate.back !== card.back
      ))
      .map((candidate) => (candidate as Card & { type: 'term'; back: string }).back)
    const candidates = unique(rawCandidates.filter((candidate) => candidate !== card.back))
    const selected = shuffle(candidates, rng).slice(0, 3)

    if (selected.length === 0) {
      return { kind: 'flip', cardId: card.id, stem: card.front, answer: card.back }
    }

    const choices = shuffle([card.back, ...selected], rng)
    return {
      kind: 'choice',
      cardId: card.id,
      stem: card.front,
      choices,
      answerIndex: choices.indexOf(card.back),
    }
  }

  if (card.type === 'mcq') {
    const choices = shuffle(
      card.choices.map((choice, index) => ({ choice, index })),
      rng,
    )
    return {
      kind: 'choice',
      cardId: card.id,
      stem: card.question,
      choices: choices.map(({ choice }) => choice),
      answerIndex: choices.findIndex(({ index }) => index === card.answer),
    }
  }

  return { kind: 'flip', cardId: card.id, stem: card.question, answer: card.answer }
}
