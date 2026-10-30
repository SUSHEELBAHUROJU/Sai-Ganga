import type { ReactNode } from 'react'
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react'

/**
 * Building blocks for a "hub" screen — the pattern Khatabook / Vyapar use for
 * Settings and Reports: sections as tiles in labelled groups, each opening
 * full-screen with a back arrow. See useHubSection for the navigation.
 */
export function HubGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {children}
      </div>
    </section>
  )
}

export function HubTile({
  icon: Icon,
  iconClass,
  title,
  description,
  meta,
  badge,
  onClick,
}: {
  icon: LucideIcon
  /** Background + text colour of the icon square, e.g. "bg-blue-100 text-blue-700". */
  iconClass: string
  title: string
  description: string
  /** Small trailing figure, e.g. "14 sizes". */
  meta?: string | null
  /** A short tag after the title, e.g. "PDF". */
  badge?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-800/60 dark:active:bg-slate-800"
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">{title}</span>
          {badge && (
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-slate-500 dark:text-slate-400">{description}</span>
      </span>
      {meta && (
        <span className="shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">{meta}</span>
      )}
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden />
    </button>
  )
}

/** Top of an opened section: back arrow to the hub, the section's name and what it's for. */
export function HubSectionHeader({
  hubLabel,
  title,
  description,
  onBack,
}: {
  hubLabel: string
  title: string
  description?: string
  onBack: () => void
}) {
  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 mb-1 flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40"
      >
        <ArrowLeft className="h-4 w-4" />
        {hubLabel}
      </button>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
    </div>
  )
}
