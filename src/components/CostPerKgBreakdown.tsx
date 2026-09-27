import { formatQty } from '../lib/format'

type CostPerKgBreakdownProps = {
  materialCost: number
  /** kg of pipe the material cost is spread over (can differ from producedKg
   *  when material is only known for part of the range). */
  materialProducedKg: number
  overheads: { name: string; amount: number }[]
  producedKg: number
  /** Electricity meter units in the range, when recorded. */
  units: number | null
}

const perKg = (amount: number, kg: number) => (kg > 0 ? `₹${formatQty(amount / kg)}/kg` : '—')

/**
 * What it cost to make 1 kg of pipe: material, then each running cost, then
 * the total — rupees and rupees-per-kg side by side, one line each.
 */
export function CostPerKgBreakdown({
  materialCost,
  materialProducedKg,
  overheads,
  producedKg,
  units,
}: CostPerKgBreakdownProps) {
  const runningCost = overheads.reduce((sum, o) => sum + o.amount, 0)
  const materialPerKg = materialProducedKg > 0 ? materialCost / materialProducedKg : null
  const runningPerKg = producedKg > 0 ? runningCost / producedKg : null
  const total = materialPerKg !== null && runningPerKg !== null ? materialPerKg + runningPerKg : null

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200/70 text-sm dark:border-slate-800">
      <Row label="Material" amount={materialCost} perKgText={perKg(materialCost, materialProducedKg)} strong />
      {overheads.length === 0 ? (
        <p className="border-t border-slate-200/70 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          No salaries, rent or bills recorded for these days.
        </p>
      ) : (
        overheads.map((o) => <Row key={o.name} label={o.name} amount={o.amount} perKgText={perKg(o.amount, producedKg)} />)
      )}
      {overheads.length > 0 && (
        <Row label="Running costs" amount={runningCost} perKgText={perKg(runningCost, producedKg)} strong />
      )}
      <div className="flex items-center justify-between bg-purple-50 px-3 py-2.5 font-bold text-purple-800 dark:bg-purple-950/40 dark:text-purple-200">
        <span>Cost to make 1 kg</span>
        <span className="font-mono">{total === null ? '—' : `₹${formatQty(total)}`}</span>
      </div>
      {units !== null && producedKg > 0 && (
        <p className="border-t border-slate-200/70 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
          Electricity: {formatQty(units)} units · <span className="font-semibold">{formatQty(units / producedKg)} units/kg</span>
        </p>
      )}
    </div>
  )
}

function Row({
  label,
  amount,
  perKgText,
  strong,
}: {
  label: string
  amount: number
  perKgText: string
  strong?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border-t border-slate-200/70 px-3 py-2 first:border-t-0 dark:border-slate-800 ${
        strong ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'
      }`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 text-right">
        <span className="font-mono">₹{formatQty(Math.round(amount * 100) / 100)}</span>
        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{perKgText}</span>
      </span>
    </div>
  )
}
