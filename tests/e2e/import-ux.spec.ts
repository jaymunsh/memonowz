import { expect, test, type Page } from '@playwright/test'

const openImport = async (page: Page) => {
  await page.goto('/')
  const deckId = await page.evaluate(async () => {
    const m = await import('/src/db/index.ts')
    return (await m.createDeck({ name: '불러오기 테스트' })).id
  })
  await page.goto(`/deck/${deckId}/import`)
  return deckId
}

test('붙여넣기가 기본이고 Excel 예시를 확인한 뒤 현재 덱에 저장한다', async ({ page }) => {
  const deckId = await openImport(page)
  await expect(page.getByRole('button', { name: '붙여넣기', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/Excel이나 Google Sheets/)).toBeVisible()
  await expect(page.getByRole('button', { name: '0장 넣기', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '예시 넣어 보기', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '카드 목록', exact: true })).toHaveValue('cohesion\t응집도\ncoupling\t결합도')
  await expect(page.getByRole('region', { name: '저장 전 미리보기', exact: true })).toContainText('응집도')
  await page.getByRole('button', { name: '2장 넣기', exact: true }).click()
  await expect(page).toHaveURL(`/deck/${deckId}`)
  expect(await page.evaluate(async (id) => {
    const m = await import('/src/db/index.ts')
    return (await m.listCards(id)).map((card) => [card.front, card.back]).sort((a, b) => a[0].localeCompare(b[0]))
  }, deckId)).toEqual([['cohesion', '응집도'], ['coupling', '결합도']])
})

test('잘못된 줄의 위치와 이유를 보여 주고 정상 카드만 저장한다', async ({ page }) => {
  const deckId = await openImport(page)
  await page.getByRole('textbox', { name: '카드 목록', exact: true }).fill('a\t1\n구분자 없음\nb\t\nc\t3')
  await expect(page.getByRole('alert')).toContainText('제외되는 카드 2건')
  await expect(page.getByRole('alert')).toContainText('2행: 앞뒤 구분자가 없습니다')
  await expect(page.getByRole('alert')).toContainText('3행: 뒷면이 비어 있습니다')
  await page.getByRole('button', { name: '정상 카드 2장만 넣기', exact: true }).click()
  await expect(page).toHaveURL(`/deck/${deckId}`)
  expect(await page.evaluate(async (id) => {
    const m = await import('/src/db/index.ts')
    return (await m.listCards(id)).length
  }, deckId)).toBe(2)
})

test('직접 입력 구분자와 빈 줄 구분을 미리보기로 확인할 수 있다', async ({ page }) => {
  await openImport(page)
  await page.getByRole('combobox', { name: '앞뒤 나누기', exact: true }).selectOption('custom')
  await page.getByRole('textbox', { name: '직접 입력한 구분자', exact: true }).fill('::')
  await page.getByRole('textbox', { name: '카드 목록', exact: true }).fill('a::1\nb::2\nc::3\nd::4')
  await expect(page.getByText('저장할 카드 4장', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '저장 전 미리보기' })).toContainText('처음 3장')
  await page.getByRole('combobox', { name: '카드 나누기', exact: true }).selectOption('blank')
  await page.getByRole('combobox', { name: '앞뒤 나누기', exact: true }).selectOption('newline')
  await page.getByRole('textbox', { name: '카드 목록', exact: true }).fill('단어\n뜻\n\n다음 단어\n다음 뜻')
  await expect(page.getByRole('button', { name: '2장 넣기', exact: true })).toBeEnabled()
  await expect(page.getByRole('region', { name: '저장 전 미리보기' })).toContainText('다음 뜻')
})

test('JSON 형식 설명은 접혀 있고 단어와 객관식 파일을 저장 전에 미리 본다', async ({ page }) => {
  const deckId = await openImport(page)
  await page.getByRole('button', { name: 'JSON 파일', exact: true }).click()
  await expect(page.locator('.import__details')).not.toHaveAttribute('open', '')
  await expect(page.getByLabel('JSON 파일 선택', { exact: true })).toBeVisible()
  await page.getByLabel('JSON 파일 선택', { exact: true }).setInputFiles({
    name: 'cards.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ cards: [
      { type: 'term', front: '단어', back: '뜻' },
      { type: 'mcq', question: '정답은?', choices: ['오답', '정답'], answer: 1 },
      { type: 'term', front: '불완전' },
    ] })),
  })
  await expect(page.getByRole('region', { name: '저장 전 미리보기' })).toContainText('정답은?')
  await expect(page.getByRole('region', { name: '저장 전 미리보기' })).toContainText('정답: 2. 정답')
  await expect(page.getByRole('alert')).toContainText('제외되는 카드 1건')
  await page.getByRole('button', { name: '정상 카드 2장만 넣기', exact: true }).click()
  await expect(page).toHaveURL(`/deck/${deckId}`)
})

test('저장 중에는 입력과 이동을 막고 저장 실패 후 같은 카드로 재시도한다', async ({ page }) => {
  const deckId = await openImport(page)
  await page.getByRole('textbox', { name: '카드 목록', exact: true }).fill('a\t1\n잘못된 줄')
  await page.evaluate(async () => {
    const m = await import('/src/db/index.ts')
    const original = m.db.cards.bulkAdd.bind(m.db.cards)
    let first = true
    m.db.cards.bulkAdd = (...args) => {
      if (!first) return original(...args)
      first = false
      return new Promise((_resolve, reject) => { window.rejectImportWrite = () => reject(new Error('test write failure')) })
    }
  })
  await page.getByRole('button', { name: '정상 카드 1장만 넣기', exact: true }).click()
  await expect(page.getByRole('button', { name: '저장 중…', exact: true })).toBeDisabled()
  await expect(page.getByRole('textbox', { name: '카드 목록', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'JSON 파일', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '전부 취소', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '뒤로', exact: true })).toHaveCount(0)
  await page.evaluate(() => window.rejectImportWrite())
  await expect(page.getByText('카드를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '카드 목록', exact: true })).toHaveValue('a\t1\n잘못된 줄')
  await page.getByRole('button', { name: '정상 카드 1장만 넣기', exact: true }).click()
  await expect(page).toHaveURL(`/deck/${deckId}`)
})
