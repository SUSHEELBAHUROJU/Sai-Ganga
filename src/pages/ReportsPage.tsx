import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DailySummaryTab } from './reports/DailySummaryTab'
import { MonthlyTab } from './reports/MonthlyTab'
import { CurrentStockView } from './reports/CurrentStockView'
import { ReceivablesTab } from './reports/ReceivablesTab'
import { DateRangeField } from '../components/DateRangeField'
import { todayISODate } from '../lib/date'

const TABS = [
  { key: 'daily', label: 'Summary' },
  { key: 'monthly', label: 'Trend' },
  { key: 'stock', label: 'Stock' },
  { key: 'dues', label: 'Dues' },
] as const

type TabKey = (typeof TABS)[number]['key']

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value)
}

export function ReportsPage() {
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  // Honours ?tab=stock so the Dashboard's "View all" / low-stock links land
  // straight on the right tab instead of always opening on Summary.
  const [activeTab, setActiveTab] = useState<TabKey>(isTabKey(tabParam) ? tabParam : 'daily')

  // Shared across Summary and Trend so picking a range once applies to both —
  // Stock is always live/current and doesn't take a range.
  const today = todayISODate()
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)

  return (
    <div className="pb-4">
      <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Reports</h2>

      {/* Same bleed-and-scroll wrapper as Settings' tab strip: four tabs are
          wider than a 320px screen, so they scroll inside their own row
          instead of widening the page. */}
      <div className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-[44px] shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab !== 'stock' && (
        <div className="mb-5">
          <DateRangeField
            fromDate={fromDate}
            toDate={toDate}
            onChange={(range) => {
              setFromDate(range.fromDate)
              setToDate(range.toDate)
            }}
          />
        </div>
      )}

      {activeTab === 'daily' && <DailySummaryTab fromDate={fromDate} toDate={toDate} />}
      {activeTab === 'monthly' && <MonthlyTab fromDate={fromDate} toDate={toDate} />}
      {activeTab === 'stock' && <CurrentStockView />}
      {activeTab === 'dues' && <ReceivablesTab fromDate={fromDate} toDate={toDate} />}
    </div>
  )
}
