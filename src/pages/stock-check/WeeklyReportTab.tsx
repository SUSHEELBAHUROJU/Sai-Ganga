import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Share2 } from 'lucide-react'
import { DateRangeField } from '../../components/DateRangeField'
import { CostPerKgBreakdown } from '../../components/CostPerKgBreakdown'
import { ManualPricesSection } from './ManualPricesSection'
import { LoadingState, EmptyNote } from '../../components/States'
import {
  useStockCheckReport,
  useManualRates,
  costPerKgProduced,
  yieldPercent,
  type StockCheckPeriod,
} from '../../hooks/useStockChecks'
import { generateStockCheckReportBlob, stockCheckPeriodLabel } from '../../lib/pdfGenerator'
import { useToast } from '../../lib/toast'
import { formatShortDate, isoDateFromDate, todayISODate } from '../../lib/date'
import { formatPipeProductLabel, formatQty } from '../../lib/format'

function threeMonthsAgo(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 3)
  return isoDateFromDate(d)
}

const pct = (n: number | null) => (n === null ? '—' : `${formatQty(n)}%`)
const wastePercent = (p: StockCheckPeriod) => (p.consumed_kg > 0 ? (p.waste_kg / p.consumed_kg) * 100 : null)

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {children}
    </h4>
  )
}

function PeriodDetail({ period }: { period: StockCheckPeriod }) {
  const { showToast } = useToast()
  const [sharing, setSharing] = useState(false)
  const { data: manualRates } = useManualRates(period.count_id)
  const costPerKg = costPerKgProduced(period)

  async function handleShare() {
    setSharing(true)
    try {
      const { file, url, filename } = generateStockCheckReportBlob(period, manualRates)
      if (typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator) {
        try {
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ title: `Stock Check — ${stockCheckPeriodLabel(period)}`, files: [file] })
            return
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') return
        }
      }
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      showToast(`Downloaded ${filename}`)
    } catch {
      showToast('Could not generate the report', 'error')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="space-y-4 border-t border-slate-200 pt-3 dark:border-slate-800">
      <div>
        <SectionTitle>Materials Consumed</SectionTitle>
        <div className="space-y-1.5">
          {period.materials.map((m) => {
            const share = period.consumed_kg > 0 ? (m.consumed_kg / period.consumed_kg) * 100 : null
            const rate = m.consumed_kg ? m.consumed_cost / m.consumed_kg : null
            return (
              <div key={m.raw_material_type_id} className="rounded-lg border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{m.material_name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {formatQty(m.opening_kg)} opening + {formatQty(m.purchased_kg)} bought
                      {m.returned_kg ? ` − ${formatQty(m.returned_kg)} returned` : ''}
                      {m.recycled_kg ? ` + ${formatQty(m.recycled_kg)} recycled` : ''} − {formatQty(m.closing_kg)} left
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{formatQty(m.consumed_kg)} kg</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{pct(share)}</p>
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    {rate === null ? 'No rate' : `@ ₹${formatQty(rate)}/kg`}
                  </span>
                  <span className="font-mono font-bold text-purple-700 dark:text-purple-300">
                    ₹{formatQty(m.consumed_cost)}
                  </span>
                </div>
                {m.opening_count_date !== period.prev_count_date && (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Left out of the {formatShortDate(period.prev_count_date)} count — opening taken from{' '}
                    {formatShortDate(m.opening_count_date)}, so this covers a longer stretch than the week.
                  </p>
                )}
                {m.unpriced_kg > 0.01 && (
                  <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    {formatQty(m.unpriced_kg)} kg has no purchase price (opening stock or an old purchase without a
                    rate), so it isn't in the cost.
                  </p>
                )}
                {m.consumed_kg < 0 && (
                  <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    Counted more than was available — check purchases and recycling entries.
                  </p>
                )}
              </div>
            )
          })}
          <div className="flex items-center justify-between rounded-lg bg-purple-50 px-3 py-2 text-sm font-bold text-purple-800 dark:bg-purple-950/40 dark:text-purple-200">
            <span>Total · {formatQty(period.consumed_kg)} kg</span>
            <span className="font-mono">₹{formatQty(period.consumed_cost)}</span>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>Pipes Produced</SectionTitle>
        {period.production.length === 0 ? (
          <EmptyNote>No production recorded in this period.</EmptyNote>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200/70 dark:border-slate-800">
            {period.production.map((p) => (
              <div
                key={p.pipe_product_id}
                className="flex items-center justify-between border-b border-slate-200/70 px-3 py-2 text-sm last:border-b-0 dark:border-slate-800"
              >
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {formatPipeProductLabel(p.diameter_inches, p.weight_kg)}
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {formatQty(p.pcs)} pcs · <span className="font-semibold">{formatQty(p.kg)} kg</span>
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
              <span>Total</span>
              <span>
                {formatQty(period.produced_pcs)} pcs · {formatQty(period.produced_kg)} kg
              </span>
            </div>
          </div>
        )}
      </div>

      <div>
        <SectionTitle>Cost to Produce</SectionTitle>
        <CostPerKgBreakdown
          materialCost={period.consumed_cost}
          materialProducedKg={period.produced_kg}
          overheads={period.overheads.map((o) => ({ name: o.category_name, amount: Number(o.amount) || 0 }))}
          producedKg={period.produced_kg}
          units={period.units}
        />
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          Monthly bills, rent and salaries are shared by days — this stretch gets the days it covers.
        </p>
      </div>

      <div>
        <SectionTitle>Result</SectionTitle>
        <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">
          Consumed <span className="font-bold">{formatQty(period.consumed_kg)} kg</span> (₹
          {formatQty(period.consumed_cost)}) → Produced{' '}
          <span className="font-bold">{formatQty(period.produced_kg)} kg</span> of pipe
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Cost / kg pipe" value={costPerKg === null ? '—' : `₹${formatQty(costPerKg)}`} sub="material + running" />
          <Stat label="Yield" value={pct(yieldPercent(period))} />
          <Stat label="Waste" value={`${formatQty(period.waste_kg)} kg`} sub={pct(wastePercent(period))} />
          <Stat label="Factory waste recorded" value={`${formatQty(period.factory_waste_kg)} kg`} />
        </div>
      </div>

      <ManualPricesSection period={period} />

      <button
        type="button"
        onClick={handleShare}
        disabled={sharing}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        <Share2 className="h-4 w-4" />
        {sharing ? 'Preparing…' : 'Download / Share PDF'}
      </button>
    </div>
  )
}

function PeriodCard({
  period,
  expanded,
  onToggle,
}: {
  period: StockCheckPeriod
  expanded: boolean
  onToggle: () => void
}) {
  const costPerKg = costPerKgProduced(period)
  const producedMoreThanUsed = period.produced_kg > 0 && period.waste_kg < -0.01
  const hasWarning =
    period.materials.some((m) => m.consumed_kg < 0) || period.unpriced_kg > 0.01 || producedMoreThanUsed

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100">
            {formatShortDate(period.prev_count_date)} → {formatShortDate(period.count_date)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{stockCheckPeriodLabel(period)}</p>
        </div>
        <span className="flex items-center gap-1 text-slate-400">
          {hasWarning && <AlertTriangle className="h-4 w-4 text-amber-500" />}
          {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </span>
      </button>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Consumed" value={`${formatQty(period.consumed_kg)} kg`} sub={`₹${formatQty(period.consumed_cost)}`} />
        <Stat label="Produced" value={`${formatQty(period.produced_kg)} kg`} sub={`${formatQty(period.produced_pcs)} pcs`} />
        <Stat
          label="Cost / kg pipe"
          value={costPerKg === null ? '—' : `₹${formatQty(costPerKg)}`}
          sub={period.overhead_cost > 0 ? 'material + running' : 'material only'}
        />
        <Stat label="Waste" value={`${formatQty(period.waste_kg)} kg`} sub={pct(wastePercent(period))} />
      </div>

      {period.unpriced_kg > 0.01 && (
        <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
          {formatQty(period.unpriced_kg)} kg used has no purchase price, so the cost is understated — a purchase may be
          missing.
        </p>
      )}
      {producedMoreThanUsed && (
        <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
          More pipe produced than material consumed — check the counts, purchases and production entries.
        </p>
      )}

      {expanded && <PeriodDetail period={period} />}
    </div>
  )
}

export function WeeklyReportTab() {
  const [fromDate, setFromDate] = useState(threeMonthsAgo)
  const [toDate, setToDate] = useState(todayISODate)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { data: periods, isLoading } = useStockCheckReport(fromDate, toDate)

  return (
    <div className="space-y-4">
      <DateRangeField
        fromDate={fromDate}
        toDate={toDate}
        onChange={(range) => {
          setFromDate(range.fromDate)
          setToDate(range.toDate)
        }}
      />

      {isLoading && <LoadingState />}

      {!isLoading && (periods ?? []).length === 0 && (
        <EmptyNote>
          No weekly results in this range yet. Save a stock count in "Enter Count" — the report starts from the
          second count.
        </EmptyNote>
      )}

      {(periods ?? []).length > 1 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <SectionTitle>Week by Week</SectionTitle>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-xs">
              <thead className="text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-1 py-1 font-semibold">Week ending</th>
                  <th className="px-1 py-1 text-right font-semibold">Used</th>
                  <th className="px-1 py-1 text-right font-semibold">Made</th>
                  <th className="px-1 py-1 text-right font-semibold">₹/kg</th>
                  <th className="px-1 py-1 text-right font-semibold">Waste</th>
                </tr>
              </thead>
              <tbody className="text-slate-800 dark:text-slate-200">
                {(periods ?? []).map((p) => {
                  const cpk = costPerKgProduced(p)
                  return (
                    <tr key={p.count_id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-1 py-1.5">{formatShortDate(p.count_date)}</td>
                      <td className="px-1 py-1.5 text-right">{formatQty(p.consumed_kg)}</td>
                      <td className="px-1 py-1.5 text-right">{formatQty(p.produced_kg)}</td>
                      <td className="px-1 py-1.5 text-right">{cpk === null ? '—' : formatQty(cpk)}</td>
                      <td className="px-1 py-1.5 text-right">{pct(wastePercent(p))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {(periods ?? []).map((period) => (
          <PeriodCard
            key={period.count_id}
            period={period}
            expanded={expandedId === period.count_id}
            onToggle={() => setExpandedId((id) => (id === period.count_id ? null : period.count_id))}
          />
        ))}
      </div>
    </div>
  )
}
