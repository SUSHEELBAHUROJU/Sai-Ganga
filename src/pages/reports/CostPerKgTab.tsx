import { useState } from 'react'
import { AlertTriangle, Download } from 'lucide-react'
import {
  MonthRangeField,
  currentMonthPeriod,
  formatMonthLabel,
  type ReportPeriod,
} from '../../components/MonthRangeField'
import { CostPerKgBreakdown } from '../../components/CostPerKgBreakdown'
import { LoadingState, EmptyNote } from '../../components/States'
import { useProductionCost } from '../../hooks/useProductionCost'
import { generateProductionCostReportBlob } from '../../lib/pdfGenerator'
import { useToast } from '../../lib/toast'
import { todayISODate, formatRangeLabel } from '../../lib/date'
import { formatPipeProductLabel, formatQty } from '../../lib/format'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {children}
    </h3>
  )
}

/**
 * Cost to make 1 kg of pipe for a calendar month: material (from stock
 * counts, FIFO), running costs (expenses counted in the month they're for),
 * and the pipe produced.
 */
export function CostPerKgTab() {
  const [period, setPeriod] = useState<ReportPeriod>(() => currentMonthPeriod(todayISODate()))
  const { data: report, isLoading } = useProductionCost(period.fromDate, period.toDate)
  const { showToast } = useToast()

  const periodLabel = period.month
    ? formatMonthLabel(period.month)
    : formatRangeLabel(period.fromDate, period.toDate)

  const hasMaterial = Boolean(report?.coveredFrom)
  const partialCoverage =
    report && hasMaterial && (report.coveredFrom !== period.fromDate || report.coveredTo !== period.toDate)

  function handleDownload() {
    if (!report) return
    try {
      const { url, filename } = generateProductionCostReportBlob(report, periodLabel)
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
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 dark:border-purple-900 dark:bg-purple-950/30">
            <p className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300">
              Pipe Produced — {periodLabel}
            </p>
            <p className="mt-1 text-3xl font-bold text-purple-700 dark:text-purple-300">
              {formatQty(report.producedKg)} kg
            </p>
            <p className="text-xs text-purple-700/80 dark:text-purple-300/80">{formatQty(report.producedPcs)} pcs</p>
          </div>

          {(!hasMaterial || partialCoverage || report.isEstimated || report.unpricedKg > 0.01) && (
            <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" /> About the material figures
              </p>
              {!hasMaterial && (
                <p>
                  No stock counts cover this period yet, so material used isn't known — only running costs are shown.
                  Save counts in Stock Check.
                </p>
              )}
              {partialCoverage && report.coveredFrom && report.coveredTo && (
                <p>
                  Material is counted for {formatRangeLabel(report.coveredFrom, report.coveredTo)} only. Material ₹/kg
                  uses the {formatQty(report.coveredProducedKg)} kg of pipe made on those days.
                </p>
              )}
              {report.isEstimated && (
                <p>
                  A stock-check week crosses into the next or previous month, so its material is shared by days — an
                  estimate. Counting on the last day of the month makes this exact.
                </p>
              )}
              {report.unpricedKg > 0.01 && (
                <p>{formatQty(report.unpricedKg)} kg used has no purchase price, so material cost is understated.</p>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <SectionTitle>Cost to Produce</SectionTitle>
            <CostPerKgBreakdown
              materialCost={report.materialCost}
              materialProducedKg={report.coveredProducedKg}
              overheads={report.overheads}
              producedKg={report.producedKg}
              units={report.units}
            />
          </div>

          <button
            type="button"
            onClick={handleDownload}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-purple-600 py-3 text-sm font-semibold text-white hover:bg-purple-700"
          >
            <Download className="h-4 w-4" />
            Download Cost Report (PDF)
          </button>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <SectionTitle>Materials Consumed</SectionTitle>
            {report.materials.length === 0 ? (
              <EmptyNote>No stock-check counts cover this period.</EmptyNote>
            ) : (
              <div className="space-y-1">
                {report.materials.map((m) => (
                  <div
                    key={m.raw_material_type_id}
                    className="flex items-baseline justify-between gap-3 border-t border-slate-100 py-2 text-sm first:border-t-0 dark:border-slate-800"
                  >
                    <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-200">
                      {m.material_name}
                      <span className="ml-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">
                        {formatQty(Math.round(m.consumed_kg * 100) / 100)} kg
                        {m.consumed_kg ? ` @ ₹${formatQty(m.consumed_cost / m.consumed_kg)}/kg` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono font-semibold">
                      ₹{formatQty(Math.round(m.consumed_cost * 100) / 100)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <SectionTitle>Pipes Produced</SectionTitle>
            {report.production.length === 0 ? (
              <EmptyNote>No production recorded in this period.</EmptyNote>
            ) : (
              <div className="space-y-1">
                {report.production.map((p) => (
                  <div
                    key={p.pipe_product_id}
                    className="flex items-baseline justify-between gap-3 border-t border-slate-100 py-2 text-sm first:border-t-0 dark:border-slate-800"
                  >
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {formatPipeProductLabel(p.diameter_inches, p.weight_kg)}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {formatQty(p.pcs)} pcs · <span className="font-semibold">{formatQty(p.kg)} kg</span>
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
