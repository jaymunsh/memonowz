import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans-kr/400.css'
import '@fontsource/ibm-plex-sans-kr/500.css'
import '@fontsource/ibm-plex-sans-kr/600.css'
import './ui/tokens.css'
import { App } from './app/App'
import { applyTheme, getThemePref } from './app/theme'

// 첫 페인트 전에 테마를 적용해 깜빡임을 막는다
applyTheme(getThemePref())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
