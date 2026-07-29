import { useCallback, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { PinLockScreen } from './components/PinLockScreen'
import { LoginScreen } from './components/LoginScreen'
import { LoadingState } from './components/States'
import { useAuthSession } from './hooks/useAuthSession'
import { isPinSet } from './lib/pin'
import { DashboardPage } from './pages/DashboardPage'
import { AddProductionPage } from './pages/AddProductionPage'
import { AddSalePage } from './pages/AddSalePage'
import { RecordPurchasePage } from './pages/RecordPurchasePage'
import { RecordsPage } from './pages/RecordsPage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'

function App() {
  // Auth is the real boundary — every table's RLS requires a signed-in user,
  // so without a session there's nothing the app could show anyway. The PIN
  // (below) is a separate, optional convenience lock on top of that: it just
  // re-asks a signed-in device to show the screen, it doesn't touch the DB.
  const { session, loading } = useAuthSession()

  // Locked whenever a PIN exists at load time — opening the app always asks.
  const [locked, setLocked] = useState(isPinSet)
  // Stable identity: the lock screen keys an effect on this callback.
  const unlock = useCallback(() => setLocked(false), [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <LoadingState label="Loading…" />
      </div>
    )
  }

  if (!session) return <LoginScreen />
  if (locked) return <PinLockScreen onUnlock={unlock} />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="production/add" element={<AddProductionPage />} />
          <Route path="sales/add" element={<AddSalePage />} />
          <Route path="purchases/add" element={<RecordPurchasePage />} />
          <Route path="records" element={<RecordsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
