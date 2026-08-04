import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

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
 * sat hundreds of pixels below the fold. The spacer below reserves the bar's
 * real measured height in the flow so it can never cover the last field.
 */
export function StickyActionBar({ children }: { children: ReactNode }) {
  const barRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(76)

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const measure = () => setHeight(bar.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div aria-hidden style={{ height }} />
      <div
        ref={barRef}
        data-sticky-bar
        className="fixed inset-x-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm md:left-64 dark:border-slate-800 dark:bg-slate-900/95"
        style={{ bottom: 'var(--app-bottom-nav-h)' }}
      >
        {children}
      </div>
    </>
  )
}
