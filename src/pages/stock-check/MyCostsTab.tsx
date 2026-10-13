import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Share2, X } from 'lucide-react'
import { DateRangeField } from '../../components/DateRangeField'
import { SaveButton } from '../../components/SaveButton'
import { LoadingState, EmptyNote } from '../../components/States'
import {
  useStockCheckReport,
  useAllMyCosts,
  useSaveMyCosts,
  newWeekMyCosts,
  myCostSummary,
  costPerKgProduced,
  type ManualRates,
  type MyCosts,
  type StockCheckPeriod,
} from '../../hooks/useStockChecks'
import { generateMyCostsReportBlob, stockCheckPeriodLabel } from '../../lib/pdfGenerator'
import { useToast } from '../../lib/toast'
import { formatShortDate, todayISODate } from '../../lib/date'
import { formatQty } from '../../lib/format'
import { SectionTitle, Stat } from './weekParts'
import { threeMonthsAgo, useSharePdf } from './weekUtils'

const rupeesPerKg = (n: number | null) => (n === null ? '—' : `₹${formatQty(n)}`)

/** A typed number, or null when blank or not a valid amount. */
function parseAmount(value: string): number | null {
  const n = Number(value)
  return value.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null
}

/** Stable text form of a week's costs, to tell whether the form has changed. */
function costsKey(costs: MyCosts): string {
  return JSON.stringify([
    [...costs.rates].sort(([a], [b]) => a.localeCompare(b)),
    costs.operatorPipeRate,
    costs.operatorRecycledRate,
    costs.electricityPipeRate,
    costs.electricityRecycledRate,
    costs.extras.map((e) => [e.name, e.amount]),
    costs.includeAppExpenses,
  ])
}

function RupeeInput({
  value,
  onChange,
  label,
  placeholder,
  wide = false,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  wide?: boolean
}) {
  return (
    <label
      className={`flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-2 focus-within:border-purple-500 dark:border-slate-700 dark:bg-slate-800 ${wide ? 'w-32' : 'w-24'}`}
    >
      <span className="text-sm text-slate-400">₹</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        aria-label={label}
        placeholder={placeholder ?? '0'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
      />
    </label>
  )
}

/** "Pipe made · 10012 kg × ₹2.5" with its amount, and the ₹/kg input. */
function PerKgRow({
  label,
  kg,
  value,
  onChange,
  amount,
  detail,
}: {
  label: string
  kg: number
  value: string
  onChange: (value: string) => void
  amount: number
  /** What the kg is made of, e.g. "Recycled LD Pipe 1000 kg + Recycled Drip Pipe 25 kg". */
  detail?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {kg > 0 ? `${formatQty(kg)} kg × ₹/kg` : 'None this week'}
        </p>
        {kg > 0 && detail && <p className="text-[11px] text-slate-500 dark:text-slate-400">{detail}</p>}
        <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">₹{formatQty(amount)}</p>
      </div>
      <RupeeInput value={value} onChange={onChange} label={`${label} rupees per kg`} />
    </div>
  )
}

function Box({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5 rounded-lg border border-slate-200/70 px-3 py-3 dark:border-slate-800">
      <div>
        <SectionTitle>{title}</SectionTitle>
        {hint && <p className="-mt-1 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

/** "Recycled LD Pipe 1000 kg + Recycled Drip Pipe 25 kg" — the recycled material used this week. */
function recycledUsedDetail(period: StockCheckPeriod): string {
  return period.materials
    .filter((m) => m.is_recycled_output && m.consumed_kg > 0)
    .map((m) => `${m.material_name} ${formatQty(m.consumed_kg)} kg`)
    .join(' + ')
}

type ExtraInput = { key: number; name: string; amount: string }

const STARTER_EXTRAS = ['Day wages', 'Machinery']

function MyCostsForm({
  period,
  seed,
  saved,
}: {
  period: StockCheckPeriod
  /** What the form starts with — the saved costs, or a new week's defaults. */
  seed: MyCosts
  /** As saved now (live), to tell whether there's anything to save. */
  saved: MyCosts | undefined
}) {
  const saveCosts = useSaveMyCosts()
  const { showToast } = useToast()
  const { share, sharing } = useSharePdf()

  const [rateInputs, setRateInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries([...seed.rates].map(([id, rate]) => [id, String(rate)])),
  )
  const asInput = (n: number) => (n > 0 ? String(n) : '')
  const [operatorPipe, setOperatorPipe] = useState(() => asInput(seed.operatorPipeRate))
  const [operatorRecycled, setOperatorRecycled] = useState(() => asInput(seed.operatorRecycledRate))
  const [electricityPipe, setElectricityPipe] = useState(() => asInput(seed.electricityPipeRate))
  const [electricityRecycled, setElectricityRecycled] = useState(() => asInput(seed.electricityRecycledRate))
  const [extras, setExtras] = useState<ExtraInput[]>(() =>
    seed.extras.length > 0
      ? seed.extras.map((e, i) => ({ key: i, name: e.name, amount: String(e.amount) }))
      : STARTER_EXTRAS.map((name, i) => ({ key: i, name, amount: '' })),
  )
  const [includeAppExpenses, setIncludeAppExpenses] = useState(seed.includeAppExpenses)

  const typedRates = useMemo(() => {
    const map: ManualRates = new Map()
    for (const [id, value] of Object.entries(rateInputs)) {
      const n = parseAmount(value)
      if (n !== null) map.set(id, n)
    }
    return map
  }, [rateInputs])

  const draft: MyCosts = {
    rates: typedRates,
    operatorPipeRate: parseAmount(operatorPipe) ?? 0,
    operatorRecycledRate: parseAmount(operatorRecycled) ?? 0,
    electricityPipeRate: parseAmount(electricityPipe) ?? 0,
    electricityRecycledRate: parseAmount(electricityRecycled) ?? 0,
    extras: extras
      .map((e) => ({ name: e.name.trim() || 'Other cost', amount: parseAmount(e.amount) ?? 0 }))
      .filter((e) => e.amount > 0),
    includeAppExpenses,
  }
  const summary = myCostSummary(period, draft)
  // Only prices for materials shown are kept — one typed for a material no
  // longer used this week would just sit there.
  const costs: MyCosts = {
    ...draft,
    rates: new Map(
      summary.lines
        .filter((l) => l.manualRate !== null)
        .map((l) => [l.material.raw_material_type_id, l.manualRate as number]),
    ),
  }
  const dirty = !saved || costsKey(costs) !== costsKey(saved)
  const appCostPerKg = costPerKgProduced(period)
  const showAppExpenses = period.overhead_cost > 0 || seed.includeAppExpenses
  const recycledDetail = recycledUsedDetail(period)

  function handleSave() {
    saveCosts.mutate(
      { countId: period.count_id, costs },
      {
        onSuccess: () => showToast('Your costs saved'),
        onError: () => showToast('Could not save your costs', 'error'),
      },
    )
  }

  function updateExtra(key: number, patch: Partial<ExtraInput>) {
    setExtras((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)))
  }

  return (
    <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <Box title="1. Material prices" hint="Your price per kg. Left blank, the app's rate is used.">
        {summary.lines.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">No material was used in this period.</p>
        ) : (
          summary.lines.map((line) => {
            const id = line.material.raw_material_type_id
            return (
              <div key={id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                    {line.material.material_name}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formatQty(line.material.consumed_kg)} kg · app ₹{formatQty(line.appRate)}/kg
                  </p>
                  <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                    ₹{formatQty(line.cost)}
                    {line.manualRate === null && (
                      <span className="font-normal text-slate-400 dark:text-slate-500"> (app rate)</span>
                    )}
                  </p>
                </div>
                <RupeeInput
                  value={rateInputs[id] ?? ''}
                  onChange={(value) => setRateInputs((prev) => ({ ...prev, [id]: value }))}
                  label={`${line.material.material_name} price per kg`}
                  placeholder={formatQty(line.appRate)}
                />
              </div>
            )
          })
        )}
      </Box>

      <Box title="2. Operator pay (per kg)">
        <PerKgRow
          label="Pipe made"
          kg={period.produced_kg}
          value={operatorPipe}
          onChange={setOperatorPipe}
          amount={summary.operatorPipe}
        />
        <PerKgRow
          label="Recycled used"
          kg={period.recycled_used_kg}
          value={operatorRecycled}
          onChange={setOperatorRecycled}
          amount={summary.operatorRecycled}
          detail={recycledDetail}
        />
      </Box>

      <Box title="3. Electricity (per kg)">
        <PerKgRow
          label="Pipe made"
          kg={period.produced_kg}
          value={electricityPipe}
          onChange={setElectricityPipe}
          amount={summary.electricityPipe}
        />
        <PerKgRow
          label="Recycled used"
          kg={period.recycled_used_kg}
          value={electricityRecycled}
          onChange={setElectricityRecycled}
          amount={summary.electricityRecycled}
          detail={recycledDetail}
        />
      </Box>

      <Box title="4. Other costs this week" hint="Day wages, machinery, repairs — total ₹ for the week.">
        {extras.map((extra) => (
          <div key={extra.key} className="flex items-center gap-2">
            <input
              type="text"
              aria-label="Cost name"
              placeholder="Cost name"
              value={extra.name}
              onChange={(e) => updateExtra(extra.key, { name: e.target.value })}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <RupeeInput
              wide
              value={extra.amount}
              onChange={(value) => updateExtra(extra.key, { amount: value })}
              label={`${extra.name || 'Cost'} amount`}
            />
            <button
              type="button"
              onClick={() => setExtras((prev) => prev.filter((e) => e.key !== extra.key))}
              aria-label={`Remove ${extra.name || 'cost'}`}
              className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setExtras((prev) => [...prev, { key: Math.max(-1, ...prev.map((e) => e.key)) + 1, name: '', amount: '' }])
          }
          className="flex min-h-[40px] items-center gap-1 text-sm font-semibold text-purple-700 dark:text-purple-300"
        >
          <Plus className="h-4 w-4" /> Add cost
        </button>
        {showAppExpenses && (
          <label className="flex items-start gap-2 border-t border-slate-200/70 pt-2.5 dark:border-slate-800">
            <input
              type="checkbox"
              checked={includeAppExpenses}
              onChange={(e) => setIncludeAppExpenses(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-purple-600"
            />
            <span className="text-xs text-slate-600 dark:text-slate-300">
              Also add expenses recorded in the app (₹{formatQty(period.overhead_cost)}) — leave off if you've entered
              salaries or electricity above.
            </span>
          </label>
        )}
      </Box>

      <div className="space-y-1 rounded-lg bg-purple-50 px-3 py-3 text-sm text-purple-900 dark:bg-purple-950/40 dark:text-purple-100">
        {[
          ['Material', summary.materialCost],
          ['Operator', summary.operatorPipe + summary.operatorRecycled],
          ['Electricity', summary.electricityPipe + summary.electricityRecycled],
          ['Other costs', summary.extrasCost],
          ...(includeAppExpenses ? [['Expenses in app', summary.appExpenses] as const] : []),
        ].map(([label, amount]) => (
          <div key={label} className="flex justify-between">
            <span>{label}</span>
            <span className="font-mono">₹{formatQty(Math.round(Number(amount) * 100) / 100)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-purple-200 pt-1 font-bold dark:border-purple-900">
          <span>Total</span>
          <span className="font-mono">₹{formatQty(Math.round(summary.totalCost * 100) / 100)}</span>
        </div>
        <p className="text-xs text-purple-700/80 dark:text-purple-300/80">
          ÷ {formatQty(period.produced_kg)} kg pipe made
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            App calculation
          </p>
          <p className="text-base font-bold text-slate-900 dark:text-slate-100">{rupeesPerKg(appCostPerKg)}/kg</p>
        </div>
        <div className="rounded-lg bg-purple-600 px-3 py-2 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-100">Your cost</p>
          <p className="text-base font-bold">{rupeesPerKg(summary.costPerKg)}/kg</p>
        </div>
      </div>

      <SaveButton
        accent="stock"
        onClick={handleSave}
        disabled={!dirty}
        pending={saveCosts.isPending}
        label={saved ? 'Update My Costs' : 'Save My Costs'}
      />

      <button
        type="button"
        onClick={() => saved && share(generateMyCostsReportBlob(period, saved), `My Costs — ${stockCheckPeriodLabel(period)}`)}
        disabled={sharing || dirty}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        <Share2 className="h-4 w-4" />
        {sharing ? 'Preparing…' : dirty ? 'Save to share PDF' : 'Download / Share PDF'}
      </button>
    </div>
  )
}

function MyCostsCard({
  period,
  saved,
  seed,
  expanded,
  onToggle,
}: {
  period: StockCheckPeriod
  saved: MyCosts | undefined
  seed: MyCosts
  expanded: boolean
  onToggle: () => void
}) {
  const yourCostPerKg = saved ? myCostSummary(period, saved).costPerKg : null

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100">
            {formatShortDate(period.prev_count_date)} → {formatShortDate(period.count_date)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{stockCheckPeriodLabel(period)}</p>
        </div>
        <span className="text-slate-400">
          {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </span>
      </button>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Pipe made" value={`${formatQty(period.produced_kg)} kg`} sub={`${formatQty(period.produced_pcs)} pcs`} />
        <Stat label="Recycled used" value={`${formatQty(period.recycled_used_kg)} kg`} />
        <Stat label="App cost / kg" value={rupeesPerKg(costPerKgProduced(period))} />
        <Stat
          label="Your cost / kg"
          value={saved ? rupeesPerKg(yourCostPerKg) : 'Not entered'}
          sub={saved ? undefined : 'Tap to enter'}
        />
      </div>

      {/* Seeded once on opening; a background refetch won't wipe typing. */}
      {expanded && <MyCostsForm period={period} seed={saved ?? seed} saved={saved} />}
    </div>
  )
}

/**
 * Cost per kg the owner's way: their own material prices, operator pay and
 * electricity per kg, and any other costs of the week — beside the app's
 * figure. Same weeks as the Weekly Report.
 */
export function MyCostsTab() {
  const [fromDate, setFromDate] = useState(threeMonthsAgo)
  const [toDate, setToDate] = useState(todayISODate)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { data: periods, isLoading } = useStockCheckReport(fromDate, toDate)
  const { data: allMyCosts, isLoading: costsLoading } = useAllMyCosts()
  const newWeekSeed = useMemo(() => newWeekMyCosts(allMyCosts ?? new Map()), [allMyCosts])

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

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Work out the cost of 1 kg of pipe your way — your material prices, operator pay, electricity and other costs.
        Tap a week to enter them.
      </p>

      {(isLoading || costsLoading) && <LoadingState />}

      {!isLoading && (periods ?? []).length === 0 && (
        <EmptyNote>
          No weeks in this range yet. Save a stock count in "Enter Count" — weeks start from the second count.
        </EmptyNote>
      )}

      {allMyCosts && (periods ?? []).length > 1 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <SectionTitle>Week by Week</SectionTitle>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-xs">
              <thead className="text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-1 py-1 font-semibold">Week ending</th>
                  <th className="px-1 py-1 text-right font-semibold">Made</th>
                  <th className="px-1 py-1 text-right font-semibold">Recycled used</th>
                  <th className="px-1 py-1 text-right font-semibold">App ₹/kg</th>
                  <th className="px-1 py-1 text-right font-semibold">Your ₹/kg</th>
                </tr>
              </thead>
              <tbody className="text-slate-800 dark:text-slate-200">
                {(periods ?? []).map((p) => {
                  const appCpk = costPerKgProduced(p)
                  const saved = allMyCosts.get(p.count_id)
                  const yourCpk = saved ? myCostSummary(p, saved).costPerKg : null
                  return (
                    <tr key={p.count_id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-1 py-1.5">{formatShortDate(p.count_date)}</td>
                      <td className="px-1 py-1.5 text-right">{formatQty(p.produced_kg)}</td>
                      <td className="px-1 py-1.5 text-right">{formatQty(p.recycled_used_kg)}</td>
                      <td className="px-1 py-1.5 text-right">{appCpk === null ? '—' : formatQty(appCpk)}</td>
                      <td className="px-1 py-1.5 text-right font-semibold text-purple-700 dark:text-purple-300">
                        {yourCpk === null ? '—' : formatQty(yourCpk)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {allMyCosts && (
        <div className="space-y-3">
          {(periods ?? []).map((period) => (
            <MyCostsCard
              key={period.count_id}
              period={period}
              saved={allMyCosts.get(period.count_id)}
              seed={newWeekSeed}
              expanded={expandedId === period.count_id}
              onToggle={() => setExpandedId((id) => (id === period.count_id ? null : period.count_id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
