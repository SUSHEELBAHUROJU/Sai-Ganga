import { useState } from 'react'
import { Download } from 'lucide-react'
import {
  MonthRangeField,
  currentMonthPeriod,
  formatMonthLabel,
  type ReportPeriod,
} from '../../components/MonthRangeField'
import { LoadingState } from '../../components/States'
import { useSalesReport } from '../../hooks/useSalesReport'
import { generateSalesReportBlob } from '../../lib/pdfGenerator'
import { useToast } from '../../lib/toast'
import { todayISODate, formatRangeLabel, formatShortDate } from '../../lib/date'
import { formatQty } from '../../lib/format'

export function SalesReportTab() {
  const [period, setPeriod] = useState<ReportPeriod>(() => currentMonthPeriod(todayISODate()))
  const { data: report, isLoading } = useSalesReport(period.fromDate, period.toDate)
  const { showToast } = useToast()

  const periodLabel = period.month
    ? formatMonthLabel(period.month)
    : formatRangeLabel(period.fromDate, period.toDate)

  function handleDownload() {
    if (!report) return
    try {
      const { url, filename } = generateSalesReportBlob(report, periodLabel)
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

  return (
    <div className="space-y-4">
      <MonthRangeField value={period} onChange={setPeriod} />

      {isLoading && <LoadingState />}

      {report && (
        <>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
            <p className="text-xs font-semibold uppercase tracking-wider text-green-700 dark:text-green-300">
              Total Sales — {periodLabel}
            </p>
            <p className="mt-1 text-3xl font-bold text-green-700 dark:text-green-400">
              ₹{formatQty(report.totals.salesAmount)}
            </p>
            <p className="mt-0.5 text-xs text-green-700/80 dark:text-green-400/80">
              {report.totals.billCount} bill{report.totals.billCount === 1 ? '' : 's'} ·{' '}
              {formatQty(report.totals.quantityPcs)} pcs · {formatQty(report.totals.weightKg)} kg
            </p>
          </div>

          {/* Sale amounts come from bills — sales entries record stock movement
              only and have never carried a price. */}
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Based on billed sales. Voided bills are excluded.
          </p>

          <button
            type="button"
            onClick={handleDownload}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700"
          >
            <Download className="h-4 w-4" />
            Download Sales Report (PDF)
          </button>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Sales ({report.lines.length} bill{report.lines.length === 1 ? '' : 's'})
            </h3>
            {report.lines.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                No sales billed in this period.
              </p>
            ) : (
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Bill</th>
                      <th className="pb-2 font-medium">Customer</th>
                      <th className="pb-2 text-right font-medium">Weight</th>
                      <th className="pb-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.lines.map((l, i) => (
                      <tr
                        key={l.bill_number}
                        className="border-t border-slate-100 dark:border-slate-800"
                      >
                        <td className="py-2 tabular-nums text-slate-400 dark:text-slate-500">
                          {i + 1}
                        </td>
                        <td className="whitespace-nowrap py-2 text-slate-600 dark:text-slate-400">
                          {formatShortDate(l.bill_date)}
                        </td>
                        <td className="whitespace-nowrap py-2 text-slate-600 dark:text-slate-400">
                          {l.bill_number}
                        </td>
                        <td className="py-2 text-slate-700 dark:text-slate-300">{l.customer}</td>
                        <td className="whitespace-nowrap py-2 text-right tabular-nums">
                          {formatQty(l.weightKg)} kg
                        </td>
                        <td className="whitespace-nowrap py-2 text-right font-medium tabular-nums">
                          ₹{formatQty(l.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
