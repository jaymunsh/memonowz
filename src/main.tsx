import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans-kr/400.css'
import '@fontsource/ibm-plex-sans-kr/500.css'
import '@fontsource/ibm-plex-sans-kr/600.css'
import './ui/tokens.css'
import { App } from './app/App'
import { StorageGuard } from './app/StorageGuard'
import { ErrorBoundary } from './app/ErrorBoundary'
import { applyTheme, getThemePref } from './app/theme'
import { applyTextSize, readPreferences } from './app/preferences'

// 첫 페인트 전에 테마를 적용해 깜빡임을 막는다
applyTheme(getThemePref())
applyTextSize(readPreferences().textSize)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><StorageGuard>
      <App />
    </StorageGuard></ErrorBoundary>
  </StrictMode>,
)
