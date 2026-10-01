import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const defaults = {
  textSize: 'normal', showAnswers: false, studyOrder: 'random', studySize: '10', studyTimed: false,
}
const key = 'memonowz.preferences'
let storage: Map<string, string>
let attributes: Map<string, string>

beforeEach(() => {
  vi.resetModules()
  storage = new Map()
  attributes = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => storage.get(name) ?? null,
    setItem: (name: string, value: string) => storage.set(name, value),
  })
  vi.stubGlobal('document', {
    documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('user preferences', () => {
  it('starts with hidden answers and a standard, untimed study session', async () => {
    const { readPreferences } = await import('./preferences')
    expect(readPreferences()).toEqual(defaults)
  })

  it.each(['{broken', 'null', '[]', '42'])('falls back safely for invalid stored data %s', async (saved) => {
    storage.set(key, saved)
    const { readPreferences } = await import('./preferences')
    expect(readPreferences()).toEqual(defaults)
  })

  it('validates each stored field without discarding valid choices', async () => {
    storage.set(key, JSON.stringify({
      textSize: 'huge', showAnswers: 'true', studyOrder: 'alpha', studySize: '500', studyTimed: true,
    }))
    const { readPreferences } = await import('./preferences')
    expect(readPreferences()).toEqual({ ...defaults, studyOrder: 'alpha', studyTimed: true })
  })

  it('persists choices and restores them after a fresh module load', async () => {
    const { updatePreferences } = await import('./preferences')
    const saved = { textSize: 'xlarge', showAnswers: true, studyOrder: 'alpha', studySize: 'all', studyTimed: true } as const
    expect(updatePreferences(saved)).toBe(true)
    vi.resetModules()
    const { readPreferences } = await import('./preferences')
    expect(readPreferences()).toEqual(saved)
  })

  it('merges a setting change with previously saved choices', async () => {
    storage.set(key, JSON.stringify({ ...defaults, studySize: '50', studyTimed: true }))
    const { updatePreferences, readPreferences } = await import('./preferences')
    updatePreferences({ showAnswers: true })
    expect(readPreferences()).toEqual({ ...defaults, studySize: '50', studyTimed: true, showAnswers: true })
  })

  it('returns defaults when access to browser storage is denied', async () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied') } })
    const { readPreferences } = await import('./preferences')
    expect(readPreferences()).toEqual(defaults)
  })

  it('applies font size and retains session choices even when persistence fails', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify(defaults),
      setItem: () => { throw new Error('quota exceeded') },
    })
    const { updatePreferences, readPreferences } = await import('./preferences')
    expect(updatePreferences({ textSize: 'large', showAnswers: true })).toBe(false)
    expect(attributes.get('data-text-size')).toBe('large')
    expect(readPreferences()).toEqual({ ...defaults, textSize: 'large', showAnswers: true })
    expect(updatePreferences({ studySize: '20' })).toBe(false)
    expect(readPreferences()).toEqual({ ...defaults, textSize: 'large', showAnswers: true, studySize: '20' })
  })

  it('can apply a saved font size before rendering the app', async () => {
    storage.set(key, JSON.stringify({ ...defaults, textSize: 'xlarge' }))
    const { applyTextSize, readPreferences } = await import('./preferences')
    applyTextSize(readPreferences().textSize)
    expect(attributes.get('data-text-size')).toBe('xlarge')
  })

  it('does not let callers mutate stored settings through a returned object', async () => {
    const { readPreferences } = await import('./preferences')
    readPreferences().showAnswers = true
    expect(readPreferences().showAnswers).toBe(false)
  })
})
