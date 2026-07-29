import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarPlus, ChevronRight } from 'lucide-react'
import { useTodaySummary, useMissedDays } from '../hooks/useDashboard'
import { useDismissedNudges } from '../hooks/useDismissedNudges'
import { useFinishedGoodsStock, useRawMaterialStock, useScrapStock } from '../hooks/useStock'
import { DashboardCurrentStock } from './dashboard/DashboardCurrentStock'
import { ACTION_STYLES, type ActionKey } from '../lib/actionColors'
import { todayISODate, formatFullDate, formatShortDate } from '../lib/date'
import { formatQty } from '../lib/format'

type ActionCard = { to: string; label: string; action: ActionKey; subtitle: string | null }

export function DashboardPage() {
  const today = todayISODate()
  const { data: summary } = useTodaySummary(today)
  const { data: missedDays } = useMissedDays(today)
  const { dismissed, dismiss } = useDismissedNudges()

  const { data: finishedGoods } = useFinishedGoodsStock()
  const { data: rawMaterials } = useRawMaterialStock()
  const { data: scrap } = useScrapStock()

  // One nudge at a time keeps the landing screen uncluttered. Most recent
  // first — that's the day the user can still recall the numbers for; clearing
  // it surfaces the next one back.
  const nextMissedDay = (missedDays ?? []).filter((d) => !dismissed.includes(d))[0]

  // Reported per category, never as one blended number: finished goods, scrap
  // and raw materials are separate stocks in different units and must not be
  // added together anywhere.
  const lowStockByCategory = [
    { label: 'pipe products', count: (finishedGoods ?? []).filter((p) => p.is_active && p.is_low_stock).length },
    { label: 'raw materials', count: (rawMaterials ?? []).filter((m) => m.is_active && m.is_low_stock).length },
    { label: 'scrap', count: (scrap ?? []).filter((s) => s.is_active && s.is_low_stock).length },
  ].filter((c) => c.count > 0)

  // Today's numbers live inside their matching action card (not a separate
  // "Today so far" block) so each figure appears exactly once on the page.
  const actionCards: ActionCard[] = [
    {
      to: '/production/add',
      label: "Add Today's Production",
      action: 'production',
      subtitle: summary
        ? `Today: ${formatQty(summary.producedKg)} kg` +
          (summary.recyclingOutputKg > 0 ? ` · ${formatQty(summary.recyclingOutputKg)} kg recycled` : '')
        : null,
    },
    {
      to: '/sales/add',
      label: "Add Today's Sale",
      action: 'sale',
      subtitle: summary ? `Today: ${formatQty(summary.soldKg)} kg` : null,
    },
    {
      to: '/purchases/add',
      label: 'Add a Purchase',
      action: 'purchase',
      subtitle: summary
        ? `Today: ${summary.purchaseCount} purchase${summary.purchaseCount === 1 ? '' : 's'}`
        : null,
    },
  ]

  return (
    <div className="space-y-6 pb-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Today
        </p>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {formatFullDate(today)}
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {actionCards.map((action) => {
          const style = ACTION_STYLES[action.action]
          return (
            <Link
              key={action.to}
              to={action.to}
              className={`flex min-h-[76px] items-center gap-3 rounded-2xl p-4 text-white shadow-md transition-transform active:scale-[0.98] sm:min-h-[140px] sm:flex-col sm:items-start sm:justify-between sm:gap-4 sm:p-5 ${style.gradient}`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 sm:h-14 sm:w-14 sm:rounded-2xl">
                <style.icon className="h-[22px] w-[22px] sm:h-8 sm:w-8" strokeWidth={2.25} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-bold leading-tight sm:text-lg">{action.label}</span>
                {action.subtitle && (
                  <span className="text-xs font-medium text-white/90 sm:text-sm">{action.subtitle}</span>
                )}
              </span>
            </Link>
          )
        })}
      </div>

      <DashboardCurrentStock />

      {nextMissedDay && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex sm:items-center sm:gap-3 dark:border-amber-900 dark:bg-amber-950/40">
          <div className="flex items-center gap-3 sm:min-w-0 sm:flex-1">
            <CalendarPlus className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" />
            <p className="min-w-0 text-sm text-amber-900 dark:text-amber-200">
              {formatShortDate(nextMissedDay)} has no production entry — add it?
            </p>
          </div>
          <div className="mt-3 flex shrink-0 items-center justify-end gap-2 sm:mt-0">
            <button
              type="button"
              onClick={() => dismiss(nextMissedDay)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/60"
            >
              Not now
            </button>
            <Link
              to={`/production/add?date=${nextMissedDay}`}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Add entry
            </Link>
          </div>
        </div>
      )}

      {lowStockByCategory.length > 0 && (
        <Link
          to="/reports?tab=stock"
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:hover:bg-red-950/70"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-500" />
          <p className="min-w-0 flex-1 text-sm font-medium text-red-900 dark:text-red-200">
            Below low-stock threshold:{' '}
            {lowStockByCategory.map((c) => `${c.count} ${c.label}`).join(' · ')}
          </p>
          <ChevronRight className="h-5 w-5 shrink-0 text-red-400" />
        </Link>
      )}
    </div>
  )
}
