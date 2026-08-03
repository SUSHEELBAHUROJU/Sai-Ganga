import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

type ModalProps = {
  title: string
  open: boolean
  onClose: () => void
  maxWidthClass?: string
  children: ReactNode
}

export function Modal({ title, open, onClose, maxWidthClass = 'md:max-w-md', children }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 md:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      {/*
        Header is a fixed (non-scrolling) flex row and only the body scrolls
        — a tall modal (e.g. the bill view's embedded PDF) must never be able
        to scroll the close button out of reach on a small phone screen.
        Flex layout instead of `position: sticky`, which has known quirks
        inside scroll containers on mobile Safari.
      */}
      <div className={`relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl ${maxWidthClass} md:rounded-2xl dark:bg-slate-900`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
