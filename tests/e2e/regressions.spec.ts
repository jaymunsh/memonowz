import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// Each test receives a fresh browser context and its own real IndexedDB.
const seed = async (page: Page, mode: 'mcq' | 'term' | 'session' = 'session') => {
  await page.goto('/')
  return page.evaluate(async (mode) => {
    const m = await import('/src/db/index.ts')
    const deck = await m.createDeck({ name: '테스트 덱', flipOnly: mode === 'session' })
    const inputs = mode === 'mcq'
      ? [{ type: 'mcq', question: '정답 위치', choices: ['A', 'B', 'C', 'D'], answer: 1, tags: [], starred: false }]
      : mode === 'term'
        ? [{ type: 'term', front: '단어', back: '뜻', distractors: ['오답1', '오답2'], tags: [], starred: false }]
        : ['A', 'B', 'C'].map((front) => ({ type: 'term', front, back: `${front} 답`, tags: [], starred: false }))
    const cards = await m.createCards(deck.id, inputs)
    return { deckId: deck.id, cardIds: cards.map((card) => card.id) }
  }, mode)
}

test('빈 보기를 제거해도 선택한 정답을 유지한다', async ({ page }) => {
  const ids = await seed(page, 'mcq')
  await page.goto(`/deck/${ids.deckId}`)
  await page.locator('.deck__card').click()
  await page.getByRole('textbox', { name: '보기 1', exact: true }).fill('')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  const answer = await page.evaluate(async (id) => {
    const m = await import('/src/db/index.ts')
    const card = await m.getCard(id)
    return card.choices[card.answer]
  }, ids.cardIds[0])
  expect(answer).toBe('B')
})

test('단어를 편집해도 직접 지정한 오답 보기를 보존한다', async ({ page }) => {
  const ids = await seed(page, 'term')
  await page.goto(`/deck/${ids.deckId}`)
  await page.locator('.deck__card').click()
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  const distractors = await page.evaluate(async (id) => {
    const m = await import('/src/db/index.ts')
    return (await m.getCard(id)).distractors
  }, ids.cardIds[0])
  expect(distractors).toEqual(['오답1', '오답2'])
})

test('완료된 시험을 이어하면 결과를 볼 수 있다', async ({ page }) => {
  const ids = await seed(page)
  await page.evaluate(async ({ deckId, cardIds }) => {
    const m = await import('/src/db/index.ts')
    await m.saveSession({ deckId, cardIds, cursor: 3, results: cardIds.map((cardId) => ({ cardId, correct: true })), startedAt: 1 })
  }, ids)
  await page.goto(`/study/${ids.deckId}`)
  await expect(page.getByRole('heading', { name: '결과', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '3문제 중 3개' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '3문제 중 3개' })).toBeVisible()
})

test('푼 카드를 삭제해도 다음 미풀이 카드를 건너뛰지 않는다', async ({ page }) => {
  const ids = await seed(page)
  await page.evaluate(async ({ deckId, cardIds }) => {
    const m = await import('/src/db/index.ts')
    await m.saveSession({ deckId, cardIds, cursor: 1, results: [{ cardId: cardIds[0], correct: true }], startedAt: 1 })
    await m.deleteCard(cardIds[0])
  }, ids)
  await page.goto(`/study/${ids.deckId}`)
  await expect(page.locator('.study__stem')).toHaveText('B')
})

test('별표를 눌러도 풀고 있는 문제의 보기를 유지한다', async ({ page }) => {
  const ids = await seed(page, 'term')
  await page.evaluate(() => { Math.random = () => 0 })
  // Navigation within React preserves the deterministic random source.
  await page.goto(`/deck/${ids.deckId}`)
  await page.evaluate(() => { Math.random = () => 0 })
  await page.getByRole('button', { name: /시험보기/ }).click()
  await expect(page.locator('.study__choice')).toHaveCount(3)
  const before = await page.locator('.study__choice').allTextContents()
  await page.evaluate(() => { Math.random = () => 0.99 })
  await page.getByRole('button', { name: '핵심 단어', exact: true }).click()
  await expect(page.getByRole('button', { name: '핵심 단어', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.locator('.study__choice').allTextContents()).toEqual(before)
})

test('모달은 키보드 포커스를 유지하고 닫으면 원래 버튼으로 돌린다', async ({ page }) => {
  await page.goto('/settings')
  const trigger = page.getByRole('button', { name: '+ 덱 만들기', exact: true })
  await trigger.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '취소', exact: true }).focus()
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('채점 저장 실패는 기록을 남기지 않고 같은 답으로 재시도할 수 있다', async ({ page }) => {
  const ids = await seed(page)
  await page.goto(`/deck/${ids.deckId}`)
  await page.getByRole('button', { name: /시험보기/ }).click()
  await page.getByRole('button', { name: '답 보기', exact: true }).click()
  const cardId = await page.locator('.study__stem').innerText()
  await page.evaluate(async () => {
    const m = await import('/src/db/index.ts')
    const original = m.db.sessions.put.bind(m.db.sessions)
    let fail = true
    m.db.sessions.put = (...args) => {
      if (fail) { fail = false; return Promise.reject(new Error('test write failure')) }
      return original(...args)
    }
  })
  await page.getByRole('button', { name: '알았음', exact: true }).click()
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeDisabled()
  const stats = await page.evaluate(async ({ deckId }) => {
    const m = await import('/src/db/index.ts')
    return (await m.listCards(deckId)).reduce((n, card) => n + card.stats.right, 0)
  }, ids)
  expect(stats).toBe(0)
  await page.getByRole('button', { name: '저장 다시 시도', exact: true }).click()
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await expect(page.locator('.study__stem')).not.toHaveText(cardId)
})

test('알 수 없는 경로는 홈으로 이동한다', async ({ page }) => {
  await page.goto('/unknown-route')
  await expect(page.getByRole('heading', { name: 'Memonowz', exact: true })).toBeVisible()
})

test('시험 도중 새로고침해도 출제 순서와 진행도를 유지한다', async ({ page }) => {
  const ids = await seed(page)
  await page.goto(`/deck/${ids.deckId}`)
  await page.getByRole('button', { name: /시험보기/ }).click()
  await page.getByRole('button', { name: '답 보기', exact: true }).click()
  await page.getByRole('button', { name: '알았음', exact: true }).click()
  await page.getByRole('button', { name: '다음', exact: true }).click()
  const current = await page.locator('.study__stem').innerText()
  await page.reload()
  await expect(page.getByRole('heading', { name: '2 / 3', exact: true })).toBeVisible()
  await expect(page.locator('.study__stem')).toHaveText(current)
})

test('채점 후 설명을 편집해도 정답과 선택 표시가 바뀌지 않는다', async ({ page }) => {
  const ids = await seed(page, 'term')
  await page.goto(`/deck/${ids.deckId}`)
  await page.evaluate(() => { Math.random = () => 0 })
  await page.getByRole('button', { name: /시험보기/ }).click()
  await page.getByRole('button', { name: '뜻', exact: true }).click()
  await expect(page.getByText('맞았습니다.', { exact: true })).toBeVisible()
  const before = await page.locator('.study__choice').allTextContents()
  await page.evaluate(() => { Math.random = () => 0.99 })
  await page.getByRole('button', { name: '수정', exact: true }).click()
  await page.getByRole('textbox', { name: '개념 설명 · 선택', exact: true }).fill('추가한 설명')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByText('추가한 설명', { exact: true })).toBeVisible()
  await expect(page.locator('.study__choice--bad')).toHaveCount(0)
  expect(await page.locator('.study__choice').allTextContents()).toEqual(before)
})

test('홈에서 바로 플래시카드 덱을 만들 수 있다', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '덱 만들기', exact: true }).click()
  await page.getByRole('textbox', { name: '이름', exact: true }).fill('새 플래시카드')
  await page.getByRole('button', { name: '플래시카드', exact: true }).click()
  await page.getByRole('button', { name: '만들기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '새 플래시카드', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '카드 추가', exact: true })).toBeVisible()
  expect(await page.evaluate(async () => {
    const m = await import('/src/db/index.ts')
    return (await m.listDeckSummaries())[0].flipOnly
  })).toBe(true)
})

test('전체 백업은 기존 덱을 유지하며 기록과 이어하기를 복원한다', async ({ page }) => {
  const ids = await seed(page)
  await page.evaluate(async ({ deckId, cardIds }) => {
    const m = await import('/src/db/index.ts')
    await m.recordAnswer(cardIds[0], false)
    await m.toggleStar(cardIds[0])
    await m.saveSession({ deckId, cardIds, cursor: 1, results: [{ cardId: cardIds[0], correct: false }], startedAt: 1 })
  }, ids)
  await page.goto('/settings')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '전체 백업 내보내기', exact: true }).click()
  const download = await downloading
  const path = await download.path()
  if (!path) throw new Error('No backup file was downloaded')
  const buffer = await readFile(path)
  await page.getByLabel('백업 또는 덱 파일 가져오기').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer })
  await expect(page.getByRole('heading', { name: '가져오기 확인', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '가져오기', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  const restored = await page.evaluate(async (original) => {
    const m = await import('/src/db/index.ts')
    const decks = await m.listDeckSummaries()
    const copy = decks.find((deck) => deck.id !== original)
    const cards = await m.listCards(copy.id)
    return { decks: decks.length, flipOnly: copy.flipOnly, wrong: cards.reduce((n, card) => n + card.stats.wrong, 0), starred: cards.filter((card) => card.starred).length,
      cursor: (await m.getSession(copy.id)).cursor, originalExists: !!await m.getDeck(original), sessions: (await m.listSessions()).length }
  }, ids.deckId)
  expect(restored).toEqual({ decks: 2, flipOnly: true, wrong: 1, starred: 1, cursor: 1, originalExists: true, sessions: 2 })
})

test('10초가 지나면 한 번만 오답 처리하고 결과로 진행한다', async ({ page }) => {
  const ids = await seed(page, 'term')
  await page.goto(`/deck/${ids.deckId}`)
  await page.clock.install()
  await page.getByText('학습 설정', { exact: true }).click()
  await page.getByRole('checkbox', { name: '10초', exact: true }).check()
  await page.getByRole('button', { name: /시험보기/ }).click()
  await expect(page.locator('.study__timer')).toBeVisible()
  await page.clock.runFor(10_100)
  await expect(page.getByText('다시 살펴보세요.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '결과 보기', exact: true })).toBeEnabled()
  await page.clock.runFor(2_000)
  const wrong = await page.evaluate(async (id) => {
    const m = await import('/src/db/index.ts')
    return (await m.getCard(id)).stats.wrong
  }, ids.cardIds[0])
  expect(wrong).toBe(1)
  await page.getByRole('button', { name: '결과 보기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '1문제 중 0개', exact: true })).toBeVisible()
})
