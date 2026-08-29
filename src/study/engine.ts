import type { Card } from '../types'

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

export const orderCards = (cards: Card[], rng: () => number = Math.random): string[] => {
  const wrong = cards.filter((card) => card.stats.wrong > card.stats.right)
  const rest = cards.filter((card) => card.stats.wrong <= card.stats.right)
  return [...shuffle(wrong, rng), ...shuffle(rest, rng)].map((card) => card.id)
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
