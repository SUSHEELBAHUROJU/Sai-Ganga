import { useState } from 'react'
import { EnterCountTab } from './stock-check/EnterCountTab'
import { SavedCountsTab } from './stock-check/SavedCountsTab'
import { WeeklyReportTab } from './stock-check/WeeklyReportTab'
import { useStockCounts, type StockCount } from '../hooks/useStockChecks'

const TABS = [
  { key: 'count', label: 'Enter Count' },
  { key: 'saved', label: 'Saved Counts' },
  { key: 'report', label: 'Weekly Report' },
] as const

type TabKey = (typeof TABS)[number]['key']

/**
 * Weekly physical count of raw material. Two consecutive counts give what was
 * consumed in between, priced first-in-first-out against the real purchase
 * lots, next to what was produced over the same days.
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

  return (
    <div className="pb-4">
      <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Stock Check</h2>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setActiveTab(tab.key)
              setSavedDate(null)
            }}
            className={`min-h-[44px] shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {tab.key === 'count' && editing ? 'Edit Count' : tab.label}
          </button>
        ))}
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
    </div>
  )
}
