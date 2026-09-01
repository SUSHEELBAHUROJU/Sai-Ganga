import { useState } from 'react'
import { Download } from 'lucide-react'
import {
  MonthRangeField,
  currentMonthPeriod,
  formatMonthLabel,
  type ReportPeriod,
} from '../../components/MonthRangeField'
import { LoadingState } from '../../components/States'
import { useExpenseReport } from '../../hooks/useExpenseReport'
import { generateExpenseReportBlob } from '../../lib/pdfGenerator'
import { useToast } from '../../lib/toast'
import { todayISODate, formatRangeLabel, formatShortDate } from '../../lib/date'
import { formatQty } from '../../lib/format'

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
  const { data: report, isLoading } = useExpenseReport(period.fromDate, period.toDate)
  const { showToast } = useToast()

  const periodLabel = period.month
    ? formatMonthLabel(period.month)
    : formatRangeLabel(period.fromDate, period.toDate)

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

      {isLoading && <LoadingState />}

      {report && (
        <>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">
              Total Money Out — {periodLabel}
            </p>
            <p className="mt-1 text-3xl font-bold text-rose-600 dark:text-rose-400">
              ₹{formatQty(report.totals.grandTotal)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Summary
            </h3>
            <SummaryRow
              label="Purchase cost"
              value={`₹${formatQty(report.totals.purchaseCost)}`}
            />
            <SummaryRow
              label="Transport charges"
              value={`₹${formatQty(report.totals.transport)}`}
            />
            <SummaryRow label="Salaries" value={`₹${formatQty(report.totals.salaries)}`} />
            <SummaryRow
              label="Other expenses"
              value={`₹${formatQty(report.totals.otherExpenses)}`}
            />
            <SummaryRow
              label="Total expenses"
              value={`₹${formatQty(report.totals.grandTotal)}`}
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
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Supplier</th>
                      <th className="pb-2 font-medium">Item</th>
                      <th className="pb-2 text-right font-medium">Qty</th>
                      <th className="pb-2 text-right font-medium">₹/kg</th>
                      <th className="pb-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.purchases.map((p, i) => (
                      <tr
                        key={`${p.entry_date}-${i}`}
                        className="border-t border-slate-100 dark:border-slate-800"
                      >
                        <td className="whitespace-nowrap py-2 text-slate-600 dark:text-slate-400">
                          {formatShortDate(p.entry_date)}
                        </td>
                        <td className="py-2 text-slate-700 dark:text-slate-300">{p.supplier}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-300">{p.item}</td>
                        <td className="whitespace-nowrap py-2 text-right tabular-nums">
                          {formatQty(p.quantityKg)} kg
                        </td>
                        <td className="whitespace-nowrap py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {p.ratePerKg === null ? '—' : `₹${formatQty(p.ratePerKg)}`}
                        </td>
                        <td className="whitespace-nowrap py-2 text-right font-medium tabular-nums">
                          {p.total === null ? '—' : `₹${formatQty(p.total)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                        ₹{formatQty(e.amount)}
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
