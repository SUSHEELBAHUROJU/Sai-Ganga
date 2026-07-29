import { useEffect, useRef, useState } from 'react'

/**
 * Measured width of an element. Charts render at real pixel dimensions rather
 * than a scaled viewBox, so axis and label text keeps its intended size on
 * small screens instead of shrinking with the container.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    setWidth(element.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}
