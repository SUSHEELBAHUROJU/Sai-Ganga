import { useState, type ReactNode } from 'react'
import {
  Calculator,
  ChartLine,
  ClipboardList,
  HandCoins,
  ReceiptIndianRupee,
  TrendingUp,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { DailySummaryTab } from './reports/DailySummaryTab'
import { MonthlyTab } from './reports/MonthlyTab'
import { CurrentStockView } from './reports/CurrentStockView'
import { ReceivablesTab } from './reports/ReceivablesTab'
import { ExpenseReportTab } from './reports/ExpenseReportTab'
import { SalesReportTab } from './reports/SalesReportTab'
import { CostPerKgTab } from './reports/CostPerKgTab'
import { DateRangeField } from '../components/DateRangeField'
import { HubGroup, HubSectionHeader, HubTile } from '../components/Hub'
import { useHubSection } from '../hooks/useHubSection'
import { todayISODate } from '../lib/date'

type DateRange = { fromDate: string; toDate: string }

type Report = {
  title: string
  description: string
  icon: LucideIcon
  iconClass: string
  /** Uses the shared date range picker shown above it; the others pick their own month/range. */
  usesSharedRange?: boolean
  /** Has a PDF to download / share. */
  pdf?: boolean
  render: (range: DateRange) => ReactNode
}

// Keys match the old tab keys, so links like /reports?tab=stock still land here.
const REPORTS = {
  daily: {
    title: 'Business Summary',
    description: 'Production, sales, purchases and recycling for any dates',
    icon: ClipboardList,
    iconClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    usesSharedRange: true,
    render: (r) => <DailySummaryTab fromDate={r.fromDate} toDate={r.toDate} />,
  },
  monthly: {
    title: 'Trends',
    description: 'Day-by-day chart of what you made and sold',
    icon: ChartLine,
    iconClass: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
    usesSharedRange: true,
    render: (r) => <MonthlyTab fromDate={r.fromDate} toDate={r.toDate} />,
  },
  sales_report: {
    title: 'Sales Report',
    description: 'Every bill with weight and amount for a month or range',
    icon: TrendingUp,
    iconClass: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300',
    pdf: true,
    render: () => <SalesReportTab />,
  },
  dues: {
    title: 'Customer Dues & Collections',
    description: 'Who owes you money, and cash / online collected',
    icon: HandCoins,
    iconClass: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
    usesSharedRange: true,
    render: (r) => <ReceivablesTab fromDate={r.fromDate} toDate={r.toDate} />,
  },
  expense_report: {
    title: 'Expense Report',
    description: 'Purchases, transport, salaries and other spending',
    icon: ReceiptIndianRupee,
    iconClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    pdf: true,
    render: () => <ExpenseReportTab />,
  },
  stock: {
    title: 'Current Stock',
    description: 'Pipes, raw material and scrap in hand right now',
    icon: Warehouse,
    iconClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    render: () => <CurrentStockView />,
  },
  cost_per_kg: {
    title: 'Cost per kg of Pipe',
    description: 'What 1 kg of pipe cost you to make in a month',
    icon: Calculator,
    iconClass: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
    pdf: true,
    render: () => <CostPerKgTab />,
  },
} satisfies Record<string, Report>

type ReportKey = keyof typeof REPORTS
const REPORT_KEYS = Object.keys(REPORTS) as ReportKey[]

const GROUPS: { title: string; keys: ReportKey[] }[] = [
  { title: 'Business Overview', keys: ['daily', 'monthly'] },
  { title: 'Sales & Money', keys: ['sales_report', 'dues'] },
  { title: 'Expenses', keys: ['expense_report'] },
  { title: 'Stock & Costing', keys: ['stock', 'cost_per_kg'] },
]

export function ReportsPage() {
  const { active, open, close } = useHubSection<ReportKey>('tab', REPORT_KEYS)

  // Kept here, above the opened report, so a range picked once carries over
  // between Summary, Trends and Dues.
  const today = todayISODate()
  const [range, setRange] = useState<DateRange>({ fromDate: today, toDate: today })

  if (active) {
    const report: Report = REPORTS[active]
    return (
      <div className="pb-4">
        <HubSectionHeader hubLabel="Reports" title={report.title} description={report.description} onBack={close} />
        {report.usesSharedRange && (
          <div className="mb-5">
            <DateRangeField fromDate={range.fromDate} toDate={range.toDate} onChange={setRange} />
          </div>
        )}
        {report.render(range)}
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Reports</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Pick a report. Ones marked PDF can be downloaded or shared.
        </p>
      </div>

      {GROUPS.map((group) => (
        <HubGroup key={group.title} title={group.title}>
          {group.keys.map((key) => {
            const report: Report = REPORTS[key]
            return (
              <HubTile
                key={key}
                icon={report.icon}
                iconClass={report.iconClass}
                title={report.title}
                description={report.description}
                badge={report.pdf ? 'PDF' : undefined}
                onClick={() => open(key)}
              />
            )
          })}
        </HubGroup>
      ))}
    </div>
  )
}
