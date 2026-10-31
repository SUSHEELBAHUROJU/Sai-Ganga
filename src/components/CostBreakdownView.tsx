import type { CostBreakdown, CostPartKey } from '../hooks/useStockChecks'
import { formatQty } from '../lib/format'

/** One colour per part, the same on the bar, the legend and the table. */
const PART_COLOR: Record<CostPartKey, string> = {
  material: 'bg-purple-600',
  electricity: 'bg-amber-500',
  wages: 'bg-sky-500',
  other: 'bg-slate-400',
  expenses: 'bg-rose-400',
}

const rupees = (n: number) => `₹${formatQty(Math.round(n * 100) / 100)}`
/** Kg of a material in 1 kg of pipe — three decimals, since it is usually below 1. */
const kg3 = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 })
const pct = (n: number) => `${n >= 10 ? Math.round(n) : formatQty(Math.round(n * 10) / 10)}%`

/** The split of 1 kg's cost as one coloured bar, with each part's share under it. */
export function CostBreakdownBar({ breakdown }: { breakdown: CostBreakdown }) {
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
        {breakdown.parts.map((p) => (
          <span key={p.key} className={PART_COLOR[p.key]} style={{ width: `${Math.max(p.share, 0.8)}%` }} />
        ))}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
        {breakdown.parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${PART_COLOR[p.key]}`} aria-hidden />
            {p.label} <span className="font-semibold">{pct(p.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * What 1 kg of pipe's price is made of: each part's ₹ per kg and share, with
 * its pieces under it — each material with the kg of it in 1 kg of pipe.
 */
export function CostBreakdownTable({ breakdown }: { breakdown: CostBreakdown }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      <div className="flex items-baseline justify-between bg-purple-600 px-3 py-2 text-white">
        <span className="text-sm font-semibold">Cost of 1 kg pipe</span>
        <span className="text-lg font-bold">{rupees(breakdown.costPerKg)}</span>
      </div>
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          <tr>
            <th className="px-3 py-1.5 font-semibold">Part</th>
            <th className="px-2 py-1.5 text-right font-semibold">₹ in 1 kg</th>
            <th className="px-3 py-1.5 text-right font-semibold">Share</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.parts.map((part) => (
            <PartRows key={part.key} part={part} />
          ))}
        </tbody>
      </table>
      <p className="border-t border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Total cost {rupees(breakdown.totalCost)} for {formatQty(breakdown.producedKg)} kg pipe made
      </p>
    </div>
  )
}

function PartRows({ part }: { part: CostBreakdown['parts'][number] }) {
  // A lone piece is shown only when its name adds something (e.g. "Tea & snacks" under Other costs).
  const showItems =
    part.items.length > 1 ||
    (part.items.length === 1 && (part.key === 'material' || part.items[0].label.toLowerCase() !== part.label.toLowerCase()))
  return (
    <>
      <tr className="border-t border-slate-100 text-slate-900 dark:border-slate-800 dark:text-slate-100">
        <td className="px-3 py-2 font-semibold">
          <span className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PART_COLOR[part.key]}`} aria-hidden />
            {part.label}
            {part.kgPerKg !== undefined && (
              <span className="font-normal text-slate-500 dark:text-slate-400">· {kg3(part.kgPerKg)} kg</span>
            )}
          </span>
        </td>
        <td className="px-2 py-2 text-right font-semibold">{rupees(part.perKg)}</td>
        <td className="px-3 py-2 text-right font-bold">{pct(part.share)}</td>
      </tr>
      {showItems &&
        part.items.map((item) => (
          <tr key={item.label} className="text-slate-600 dark:text-slate-300">
            <td className="py-1 pl-7 pr-3">
              {item.label}
              {item.kgPerKg !== undefined && (
                <span className="text-slate-400 dark:text-slate-500"> · {kg3(item.kgPerKg)} kg</span>
              )}
            </td>
            <td className="px-2 py-1 text-right">{rupees(item.perKg)}</td>
            <td className="px-3 py-1 text-right">{pct(item.share)}</td>
          </tr>
        ))}
    </>
  )
}
