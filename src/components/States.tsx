import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
      <span
        aria-hidden
        className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-teal-600 dark:border-slate-700 dark:border-t-teal-400"
      />
      {label}
    </div>
  )
}

type EmptyStateProps = {
  icon?: LucideIcon
  title: string
  hint?: string
  actionLabel?: string
  actionTo?: string
  onAction?: () => void
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  actionLabel,
  actionTo,
  onAction,
}: EmptyStateProps) {
  const actionClasses =
    'mt-3 inline-flex items-center rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700'

  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      {Icon && (
        <span className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
      {actionLabel && actionTo && (
        <Link to={actionTo} className={actionClasses}>
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionTo && (
        <button type="button" onClick={onAction} className={actionClasses}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

/** Inline empty note for a section that's part of a larger populated view. */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400 dark:text-slate-500">{children}</p>
}
