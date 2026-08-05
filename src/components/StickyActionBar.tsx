import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Tracks every mounted action bar's height so `main` can reserve room for the
 * tallest visible one. A screen can have more than one mounted at a time —
 * Add Production keeps both tab panels mounted and only hides one with CSS —
 * and a hidden panel's bar measures 0, so taking the max picks the real one.
 */
const barHeights = new Map<symbol, number>()

function publishBarHeight() {
  const tallest = Math.max(0, ...barHeights.values())
  document.documentElement.style.setProperty('--app-action-bar-h', `${tallest}px`)
}

/**
 * Pins the Save button to the bottom of the screen, full-width, so it's
 * always in thumb reach without scrolling.
 *
 * It parks one bottom-nav height up (--app-bottom-nav-h, which folds in the
 * phone's home-indicator inset) so it sits *above* the mobile nav instead of
 * behind it; on desktop that variable is 0 and it pins to the window bottom,
 * clear of the 16rem sidebar.
 *
 * Fixed rather than sticky: `position: sticky` only pins while the bar's
 * containing block is on screen, and on most entry screens the bar is the
 * last thing in that block — so it never pinned at all and the Save button
 * sat hundreds of pixels below the fold.
 *
 * Because it's fixed, the room it needs is reserved on `main` via
 * --app-action-bar-h rather than with a spacer next to the bar: content can
 * follow the bar in the tree (Add Purchase renders Factory Waste after the
 * form), and a spacer here would leave that trailing content underneath it.
 */
export function StickyActionBar({ children }: { children: ReactNode }) {
  const barRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const id = Symbol('action-bar')

    const measure = () => {
      barHeights.set(id, bar.offsetHeight)
      publishBarHeight()
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => {
      observer.disconnect()
      barHeights.delete(id)
      publishBarHeight()
    }
  }, [])

  return (
    <div
      ref={barRef}
      data-sticky-bar
      className="fixed inset-x-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm md:left-64 dark:border-slate-800 dark:bg-slate-900/95"
      style={{ bottom: 'var(--app-bottom-nav-h)' }}
    >
      {children}
    </div>
  )
}
