import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

type ToastKind = 'success' | 'error'
type ToastItem = { id: number; message: string; kind: ToastKind }

type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, message, kind }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2200)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Big, hard-to-miss confirmation banner — top of screen so it never
          collides with the sticky Save button pinned to the bottom of entry
          screens, and large enough to answer "did that work?" at a glance. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 p-3 md:p-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-banner-in pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-2xl px-3.5 py-3 text-white shadow-xl ${
              t.kind === 'success'
                ? 'bg-gradient-to-r from-emerald-500 to-green-600'
                : 'bg-gradient-to-r from-brand-red to-brand-red-dark'
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/25">
              {t.kind === 'success' ? (
                <CheckCircle2 className="h-[18px] w-[18px]" strokeWidth={2.5} />
              ) : (
                <XCircle className="h-[18px] w-[18px]" strokeWidth={2.5} />
              )}
            </span>
            <span className="text-sm font-bold leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
