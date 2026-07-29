import { useCallback, useState } from 'react'

const STORAGE_KEY = 'sai-ganga:dismissed-nudges'

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/**
 * Missed-day nudges the user has waved off, kept in localStorage so they stay
 * dismissed across sessions. Keyed by date, so a dismissal never hides a
 * different day's prompt.
 */
export function useDismissedNudges() {
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)

  const dismiss = useCallback((date: string) => {
    setDismissed((prev) => {
      if (prev.includes(date)) return prev
      const next = [...prev, date]
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Storage unavailable (private mode / quota) — dismissal still applies
        // for this session, it just won't survive a reload.
      }
      return next
    })
  }, [])

  return { dismissed, dismiss }
}
