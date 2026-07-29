import { useMonthlyReport } from '../../hooks/useMonthlyReport'
import { TrendChart } from '../../components/TrendChart'
import { AmountKgPcs } from '../../components/AmountKgPcs'
import { formatRangeLabel } from '../../lib/date'
import { formatQty } from '../../lib/format'
import { LoadingState } from '../../components/States'

function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg leading-tight">{children}</p>
    </div>
  )
}

export function MonthlyTab({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const { data: report, isLoading } = useMonthlyReport(fromDate, toDate)
  const rangeLabel = formatRangeLabel(fromDate, toDate)

  return (
    <div className="space-y-4">
      {isLoading && <LoadingState />}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Produced">
              <AmountKgPcs kg={report.producedTotalKg} pcs={report.producedTotalPcs} />
            </StatTile>
            <StatTile label="Sold">
              <AmountKgPcs kg={report.soldTotalKg} pcs={report.soldTotalPcs} />
            </StatTile>
            <StatTile label="Recycled → Granules">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatQty(report.recyclingOutputKg)} kg
              </span>
            </StatTile>
            <StatTile label="Recycled → Pipe">
              <AmountKgPcs
                kg={report.recyclingDirectToPipeTotalKg}
                pcs={report.recyclingDirectToPipeTotalPcs}
              />
            </StatTile>
            <StatTile label="Factory waste">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatQty(report.factoryWasteKg)} kg
              </span>
            </StatTile>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Production &amp; sales trend
            </h3>
            <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
              Kilograms per day · {rangeLabel}
            </p>
            <TrendChart series={report.series} rangeLabel={rangeLabel} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Per product
            </h3>
            {report.byProduct.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">No activity in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                      <th className="pb-2 font-medium">Product</th>
                      <th className="pb-2 text-right font-medium">Produced</th>
                      <th className="pb-2 text-right font-medium">Sold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byProduct.map((p) => (
                      <tr key={p.label} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-2 whitespace-nowrap text-slate-700 dark:text-slate-300">
                          {p.label}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          <AmountKgPcs kg={p.producedKg} pcs={p.producedPcs} />
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          <AmountKgPcs kg={p.soldKg} pcs={p.soldPcs} />
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
              Purchased
            </h3>
            <div className="space-y-1">
              {report.rawPurchasedByType.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-3 py-1">
                  <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                    {r.label}
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
                    {formatQty(r.quantity)} kg
                  </span>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 border-t border-slate-100 py-1 pt-2 dark:border-slate-800">
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  Raw material total
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatQty(report.rawPurchasedKg)} kg
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-1">
                <span className="text-sm text-slate-700 dark:text-slate-300">Scrap purchased</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatQty(report.scrapPurchasedKg)} kg
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
