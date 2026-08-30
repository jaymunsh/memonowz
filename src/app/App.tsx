import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from '../deck/HomePage'
import { DeckPage } from '../deck/DeckPage'
import { StudyPage } from '../study/StudyPage'
import { BrowsePage } from '../study/BrowsePage'
import { ResultPage } from '../study/ResultPage'
import { ImportPage } from '../import/ImportPage'
import { SettingsPage } from '../import/SettingsPage'

export const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/deck/:deckId" element={<DeckPage />} />
      <Route path="/deck/:deckId/import" element={<ImportPage />} />
      <Route path="/study/:deckId" element={<StudyPage />} />
      <Route path="/browse/:deckId" element={<BrowsePage />} />
      <Route path="/study/:deckId/result" element={<ResultPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  </BrowserRouter>
)
