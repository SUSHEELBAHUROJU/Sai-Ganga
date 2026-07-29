import type { ReactNode } from 'react'

/**
 * Pins the Save button to the bottom of the screen, full-width, so it's
 * always in thumb reach without scrolling — sits inside `main`'s own
 * scroll area (not fixed) so it never overlaps the bottom nav.
 */
export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
      {children}
    </div>
  )
}
