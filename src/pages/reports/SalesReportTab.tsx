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
            Only bills are counted. Cancelled bills are left out.
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
              // A list, not a table: a phone has no room for six columns side by side.
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {report.lines.map((l, i) => (
                  <li key={l.bill_number} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        <span className="mr-1.5 tabular-nums text-slate-400 dark:text-slate-500">{i + 1}.</span>
                        {l.customer}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatShortDate(l.bill_date)} · {l.bill_number}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        ₹{l.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{formatQty(l.weightKg)} kg</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
