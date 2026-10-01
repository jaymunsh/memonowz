export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'memonowz.theme'

export const getThemePref = (): ThemePref => {
  try {
    const saved = localStorage.getItem(KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch { return 'system' }
}

export const applyTheme = (pref: ThemePref) => {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
}

export const setThemePref = (pref: ThemePref) => {
  if (pref === 'system') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, pref)
  applyTheme(pref)
}
