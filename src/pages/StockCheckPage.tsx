import { useState } from 'react'
import { CalendarCheck, CircleAlert, ClipboardList, History, PencilLine, Wallet, type LucideIcon } from 'lucide-react'
import { EnterCountTab } from './stock-check/EnterCountTab'
import { SavedCountsTab } from './stock-check/SavedCountsTab'
import { WeeklyReportTab } from './stock-check/WeeklyReportTab'
import { MyCostsTab } from './stock-check/MyCostsTab'
import { useStockCounts, type StockCount } from '../hooks/useStockChecks'
import { daysBetween, formatShortDate, todayISODate } from '../lib/date'

type TabKey = 'count' | 'saved' | 'report' | 'mine'

const TABS: { key: TabKey; label: string; hint: string; icon: LucideIcon }[] = [
  { key: 'count', label: 'New Count', hint: 'Weigh stock today', icon: PencilLine },
  { key: 'saved', label: 'Old Counts', hint: 'Counts done before', icon: History },
  { key: 'report', label: 'Week Report', hint: 'Material used, cost', icon: ClipboardList },
  { key: 'mine', label: 'My Costs', hint: 'With your own rates', icon: Wallet },
]

/** A count is due once a week; this many days after the last one it's flagged. */
const COUNT_DUE_AFTER_DAYS = 7

/**
 * Weekly physical count of raw material. Two consecutive counts give what was
 * consumed in between, priced at each material's latest purchase price,
 * next to what was produced over the same days.
 */
export function StockCheckPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('count')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savedDate, setSavedDate] = useState<string | null>(null)
  const { data: counts } = useStockCounts()
  // Looked up live so a count deleted mid-edit drops the form back to a new count.
  const editing = (counts ?? []).find((c) => c.id === editingId) ?? null

  function startEdit(count: StockCount) {
    setEditingId(count.id)
    setActiveTab('count')
  }

  function switchTab(key: TabKey) {
    setActiveTab(key)
    setSavedDate(null)
  }

  return (
    <div className="pb-4">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Stock Check</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Weigh your material once a week. The app shows how much was used and its cost.
        </p>
      </div>

      <CountStatusCard
        counts={counts}
        // Already on the count form — the button would do nothing.
        onStartCount={activeTab === 'count' ? null : () => switchTab('count')}
      />

      {/* Four large buttons instead of a scrolling tab strip: all visible at once on a phone. */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Stock check sections">
        {TABS.map((tab) => {
          const selected = activeTab === tab.key
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => switchTab(tab.key)}
              className={`flex min-h-[56px] items-center gap-2.5 rounded-xl border-2 px-3 py-2 text-left transition-colors ${
                selected
                  ? 'border-purple-600 bg-purple-50 dark:border-purple-500 dark:bg-purple-950/40'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
              }`}
            >
              <Icon
                className={`h-5 w-5 shrink-0 ${selected ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`}
                aria-hidden
              />
              <span className="min-w-0">
                <span
                  className={`block truncate text-sm font-semibold ${selected ? 'text-purple-700 dark:text-purple-300' : 'text-slate-800 dark:text-slate-200'}`}
                >
                  {tab.key === 'count' && editing ? 'Edit Count' : tab.label}
                </span>
                <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{tab.hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      {activeTab === 'count' && (
        <EnterCountTab
          // Remount on switching between new and edit so the form starts from the right values.
          key={editing?.id ?? 'new'}
          editing={editing}
          onEdit={startEdit}
          onCancelEdit={() => setEditingId(null)}
          onSaved={(date) => {
            setEditingId(null)
            setSavedDate(date)
            setActiveTab('saved')
          }}
        />
      )}
      {activeTab === 'saved' && <SavedCountsTab highlightDate={savedDate} onEdit={startEdit} />}
      {activeTab === 'report' && <WeeklyReportTab />}
      {activeTab === 'mine' && <MyCostsTab />}
    </div>
  )
}

/**
 * Where the weekly routine stands: when stock was last counted, and whether
 * this week's count is due — the first thing to know on opening the page.
 */
function CountStatusCard({
  counts,
  onStartCount,
}: {
  counts: StockCount[] | undefined
  onStartCount: (() => void) | null
}) {
  if (!counts) return null
  const today = todayISODate()
  const last = counts.reduce<StockCount | null>(
    (latest, c) => (!latest || c.count_date > latest.count_date ? c : latest),
    null,
  )
  const daysSince = last ? daysBetween(last.count_date, today) : null
  const due = daysSince === null || daysSince >= COUNT_DUE_AFTER_DAYS

  const title = !last
    ? 'No count done yet'
    : daysSince === 0
      ? 'Counted today'
      : `Last count: ${formatShortDate(last.count_date)} (${daysSince} ${daysSince === 1 ? 'day' : 'days'} ago)`
  const detail = !last
    ? 'Do your first count today. The report comes after your second count.'
    : due
      ? 'Time for this week’s count.'
      : `Next count in ${COUNT_DUE_AFTER_DAYS - (daysSince ?? 0)} ${COUNT_DUE_AFTER_DAYS - (daysSince ?? 0) === 1 ? 'day' : 'days'}.`

  return (
    <div
      className={`mb-4 flex items-center gap-3 rounded-2xl border p-4 ${
        due
          ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
          : 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          due
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
            : 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
        }`}
      >
        {due ? <CircleAlert className="h-5 w-5" /> : <CalendarCheck className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        <p className="text-xs text-slate-600 dark:text-slate-400">{detail}</p>
      </div>
      {due && onStartCount && (
        <button
          type="button"
          onClick={onStartCount}
          className="shrink-0 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700"
        >
          Count Now
        </button>
      )}
    </div>
  )
}
