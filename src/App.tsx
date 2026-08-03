import { useCallback, useState, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { PinLockScreen } from './components/PinLockScreen'
import { LoginScreen } from './components/LoginScreen'
import { LoadingState } from './components/States'
import { useAuthSession } from './hooks/useAuthSession'
import { isPinSet } from './lib/pin'

// Dashboard is the landing screen — keep it in the main bundle. Everything
// else lazy-loads on navigation so a factory-floor phone on a slow
// connection only downloads the screen it's actually opening.
import { DashboardPage } from './pages/DashboardPage'
const AddProductionPage = lazy(() =>
  import('./pages/AddProductionPage').then((m) => ({ default: m.AddProductionPage })),
)
const AddSalePage = lazy(() => import('./pages/AddSalePage').then((m) => ({ default: m.AddSalePage })))
const RecordPurchasePage = lazy(() =>
  import('./pages/RecordPurchasePage').then((m) => ({ default: m.RecordPurchasePage })),
)
const RecordsPage = lazy(() => import('./pages/RecordsPage').then((m) => ({ default: m.RecordsPage })))
const LedgerPage = lazy(() => import('./pages/LedgerPage').then((m) => ({ default: m.LedgerPage })))
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

function RouteFallback() {
  return (
    <div className="flex justify-center py-10">
      <LoadingState />
    </div>
  )
}

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
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="production/add" element={<AddProductionPage />} />
            <Route path="sales/add" element={<AddSalePage />} />
            <Route path="purchases/add" element={<RecordPurchasePage />} />
            <Route path="records" element={<RecordsPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
