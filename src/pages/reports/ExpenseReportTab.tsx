import { useState } from 'react'
import { Download } from 'lucide-react'
import {
  MonthRangeField,
  currentMonthPeriod,
  formatMonthLabel,
  type ReportPeriod,
} from '../../components/MonthRangeField'
import { LoadingState } from '../../components/States'
import { useExpenseReport, type ExpenseBasis } from '../../hooks/useExpenseReport'
import { Chip } from '../../components/Chip'
import { generateExpenseReportBlob } from '../../lib/pdfGenerator'
import { useToast } from '../../lib/toast'
import { todayISODate, formatRangeLabel, formatShortDate } from '../../lib/date'
import { formatQty, formatRupees } from '../../lib/format'

function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1.5 ${
        strong ? 'border-t border-slate-200 pt-2.5 dark:border-slate-700' : ''
      }`}
    >
      <span
        className={
          strong
            ? 'text-sm font-bold text-slate-900 dark:text-slate-100'
            : 'text-sm text-slate-600 dark:text-slate-400'
        }
      >
        {label}
      </span>
      <span
        className={`shrink-0 font-mono tabular-nums ${
          strong
            ? 'text-base font-bold text-rose-600 dark:text-rose-400'
            : 'text-sm font-medium text-slate-900 dark:text-slate-100'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

export function ExpenseReportTab() {
  const [period, setPeriod] = useState<ReportPeriod>(() => currentMonthPeriod(todayISODate()))
  const [basis, setBasis] = useState<ExpenseBasis>('cost')
  const { data: report, isLoading } = useExpenseReport(period.fromDate, period.toDate, basis)
  const { showToast } = useToast()

  const rangeLabel = period.month
    ? formatMonthLabel(period.month)
    : formatRangeLabel(period.fromDate, period.toDate)
  // Printed on the PDF too, so a shared copy says which view it is.
  const periodLabel = basis === 'cost' ? `${rangeLabel} (cost for the period)` : `${rangeLabel} (paid in the period)`

  function handleDownload() {
    if (!report) return
    try {
      const { url, filename } = generateExpenseReportBlob(report, periodLabel)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast(`Downloaded ${filename}`)
    } catch {
      showToast('Could not generate the report', 'error')
    }
  }

  const hasRows =
    (report?.purchases.length ?? 0) +
      (report?.salaries.length ?? 0) +
      (report?.otherExpenses.length ?? 0) >
    0

  return (
    <div className="space-y-4">
      <MonthRangeField value={period} onChange={setPeriod} />

      <div>
        <div className="flex flex-wrap gap-2">
          <Chip label="Cost for this period" selected={basis === 'cost'} onClick={() => setBasis('cost')} />
          <Chip label="Paid in this period" selected={basis === 'paid'} onClick={() => setBasis('paid')} />
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          {basis === 'cost'
            ? 'Bills, rent and salaries count in the month they are for, whenever they were paid.'
            : 'Every expense counts on the day the money was paid.'}
        </p>
      </div>

      {isLoading && <LoadingState />}

      {report && (
        <>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">
              {basis === 'cost' ? 'Total Cost' : 'Total Money Out'} — {rangeLabel}
            </p>
            <p className="mt-1 text-3xl font-bold text-rose-600 dark:text-rose-400">
              {formatRupees(report.totals.grandTotal)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Summary
            </h3>
            <SummaryRow
              label="Purchase cost"
              value={`${formatRupees(report.totals.purchaseCost)}`}
            />
            <SummaryRow
              label="Transport charges"
              value={`${formatRupees(report.totals.transport)}`}
            />
            <SummaryRow label="Salaries" value={`${formatRupees(report.totals.salaries)}`} />
            <SummaryRow
              label="Other expenses"
              value={`${formatRupees(report.totals.otherExpenses)}`}
            />
            <SummaryRow
              label="Total expenses"
              value={`${formatRupees(report.totals.grandTotal)}`}
              strong
            />
          </div>

          <button
            type="button"
            onClick={handleDownload}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-rose-600 py-3 text-sm font-semibold text-white hover:bg-rose-700"
          >
            <Download className="h-4 w-4" />
            Download Expense Report (PDF)
          </button>

          {!hasRows && (
            <p className="text-center text-sm text-slate-400 dark:text-slate-500">
              Nothing recorded in this period — the PDF will show empty sections.
            </p>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Purchases ({report.purchases.length})
            </h3>
            {report.purchases.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                No purchases in this period.
              </p>
            ) : (
              // A list, not a six-column table, so it fits a phone without hiding columns.
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {report.purchases.map((p, i) => (
                  <li key={`${p.entry_date}-${i}`} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{p.supplier}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatShortDate(p.entry_date)} · {p.item} · {formatQty(p.quantityKg)} kg
                        {p.ratePerKg === null ? '' : ` @ ${formatRupees(p.ratePerKg)}/kg`}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {/* A return is money back: "−₹4,000", not "₹-4,000". */}
                      {p.total === null
                        ? '—'
                        : `${p.total < 0 ? '−' : ''}₹${Math.abs(p.total).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Salaries &amp; Other Expenses
            </h3>
            {report.salaries.length + report.otherExpenses.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                No expenses recorded in this period.
              </p>
            ) : (
              <div className="space-y-1">
                {[...report.salaries, ...report.otherExpenses]
                  .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
                  .map((e, i) => (
                    <div
                      key={`${e.entry_date}-${i}`}
                      className="flex items-baseline justify-between gap-3 border-t border-slate-100 py-2 first:border-t-0 dark:border-slate-800"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                          {e.category}
                        </p>
                        <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                          {formatShortDate(e.entry_date)}
                          {e.notes ? ` · ${e.notes}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatRupees(e.amount)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
