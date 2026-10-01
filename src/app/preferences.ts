export type TextSize = 'normal' | 'large' | 'xlarge'
export type UserPreferences = {
  textSize: TextSize
  showAnswers: boolean
  studyOrder: 'random' | 'alpha'
  studySize: '10' | '20' | '50' | 'all'
  studyTimed: boolean
}

const KEY = 'memonowz.preferences'
const defaults: UserPreferences = {
  textSize: 'normal', showAnswers: false, studyOrder: 'random', studySize: '10', studyTimed: false,
}
let current: UserPreferences | undefined

const validatePreferences = (value: unknown, fallback = defaults): UserPreferences => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...fallback }
  const saved = value as Record<string, unknown>
  return {
    textSize: saved.textSize === 'normal' || saved.textSize === 'large' || saved.textSize === 'xlarge'
      ? saved.textSize : fallback.textSize,
    showAnswers: typeof saved.showAnswers === 'boolean' ? saved.showAnswers : fallback.showAnswers,
    studyOrder: saved.studyOrder === 'random' || saved.studyOrder === 'alpha' ? saved.studyOrder : fallback.studyOrder,
    studySize: saved.studySize === '10' || saved.studySize === '20' || saved.studySize === '50' || saved.studySize === 'all'
      ? saved.studySize : fallback.studySize,
    studyTimed: typeof saved.studyTimed === 'boolean' ? saved.studyTimed : fallback.studyTimed,
  }
}

export const readPreferences = (): UserPreferences => {
  if (!current) {
    try { current = validatePreferences(JSON.parse(localStorage.getItem(KEY) ?? 'null')) }
    catch { current = { ...defaults } }
  }
  // A denied write must not discard choices when navigating within this session.
  return { ...current }
}

export const applyTextSize = (size: TextSize): void => {
  document.documentElement.setAttribute('data-text-size', size)
}

/** Applies choices now and reports whether they will survive a reload. */
export const updatePreferences = (patch: Partial<UserPreferences>): boolean => {
  current = validatePreferences(patch, readPreferences())
  applyTextSize(current.textSize)
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
    return true
  } catch { return false }
}
