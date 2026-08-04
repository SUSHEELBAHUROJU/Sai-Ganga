import { Link } from 'react-router-dom'
import { Factory, Recycle, Package } from 'lucide-react'
import { useFinishedGoodsStock, useRawMaterialStock, useScrapStock } from '../../hooks/useStock'
import { LoadingState } from '../../components/States'
import { StockFlag, StockValue, StockValueKgPcs, stockHealthBorderClass } from '../../components/StockBadges'
import { formatPipeProductLabel, piecesToKg, formatQty } from '../../lib/format'

const TOP_PIPE_COUNT = 5

function GroupCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Factory
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400">{title}</h4>
      </div>
      {children}
    </div>
  )
}

function StockRow({
  label,
  isNegative,
  isLow,
  threshold,
  children,
}: {
  label: React.ReactNode
  isNegative: boolean
  isLow: boolean
  threshold: number | null
  children: React.ReactNode
}) {
  return (
    // Wraps rather than forcing one line: at the 768px breakpoint these cards
    // sit three-across next to the sidebar, leaving ~128px of content width —
    // not enough for a label plus "18.5 kg (12 pcs)" and a Low badge.
    <div
      className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 border-l-4 py-1.5 pl-2.5 ${stockHealthBorderClass(isNegative, isLow)}`}
    >
      <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
        {label}
      </span>
      <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-2">
        <StockFlag isNegative={isNegative} isLow={isLow} threshold={threshold} />
        {children}
      </div>
    </div>
  )
}

/**
 * Live stock at a glance on the Dashboard — reuses the exact Phase 5 stock
 * views/hooks the Reports > Stock screen reads, so the numbers can never
 * drift between the two places they're shown. The three groups are kept
 * visually and computationally separate: finished goods (pcs→kg), scrap
 * (kg), and raw materials (kg) are never summed into one blended total.
 */
export function DashboardCurrentStock() {
  const { data: finishedGoods, isLoading: loadingFinished } = useFinishedGoodsStock()
  const { data: rawMaterials, isLoading: loadingMaterials } = useRawMaterialStock()
  const { data: scrap, isLoading: loadingScrap } = useScrapStock()

  const isLoading = loadingFinished || loadingMaterials || loadingScrap

  if (isLoading) {
    return (
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Current Stock</h3>
        <LoadingState label="Calculating stock…" />
      </div>
    )
  }

  const activePipes = (finishedGoods ?? []).filter((p) => p.is_active)
  const pipesTotalKg = activePipes.reduce(
    (sum, p) => sum + piecesToKg(p.current_stock ?? 0, p.weight_kg ?? 0),
    0,
  )
  // Low-stock and negative-stock items surface first so a compact "top 5"
  // can never hide the one thing that actually needs attention.
  const sortedPipes = [...activePipes].sort((a, b) => {
    const aFlagged = !!a.is_low_stock || (a.current_stock ?? 0) < 0
    const bFlagged = !!b.is_low_stock || (b.current_stock ?? 0) < 0
    if (aFlagged !== bFlagged) return aFlagged ? -1 : 1
    return (b.current_stock ?? 0) - (a.current_stock ?? 0)
  })
  const visiblePipes = sortedPipes.slice(0, TOP_PIPE_COUNT)
  const hiddenPipeCount = activePipes.length - visiblePipes.length

  const activeMaterials = (rawMaterials ?? []).filter((m) => m.is_active)
  const activeScrapTypes = (scrap ?? []).filter((s) => s.is_active)

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Current Stock</h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <GroupCard icon={Factory} title="Finished Pipes">
          {activePipes.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No pipe sizes yet.</p>
          ) : (
            <>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {visiblePipes.map((p) => (
                  <StockRow
                    key={p.pipe_product_id}
                    label={formatPipeProductLabel(p.diameter_inches ?? 0, p.weight_kg ?? 0)}
                    isNegative={(p.current_stock ?? 0) < 0}
                    isLow={p.is_low_stock ?? false}
                    threshold={p.low_stock_threshold}
                  >
                    <StockValueKgPcs
                      kg={piecesToKg(p.current_stock ?? 0, p.weight_kg ?? 0)}
                      pcs={p.current_stock ?? 0}
                    />
                  </StockRow>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-800">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {hiddenPipeCount > 0 ? `+${hiddenPipeCount} more` : 'Total'}
                </span>
                {hiddenPipeCount > 0 ? (
                  <Link
                    to="/reports?tab=stock"
                    className="-my-2 -mr-2 inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-teal-600 hover:underline dark:text-teal-400"
                  >
                    View all
                  </Link>
                ) : (
                  <span
                    className={`text-sm font-semibold ${
                      pipesTotalKg < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {formatQty(pipesTotalKg)} kg
                  </span>
                )}
              </div>
              {hiddenPipeCount > 0 && (
                <p
                  className={`mt-1 text-right text-xs ${
                    pipesTotalKg < 0
                      ? 'font-semibold text-red-600 dark:text-red-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  Total {formatQty(pipesTotalKg)} kg
                </p>
              )}
            </>
          )}
        </GroupCard>

        <GroupCard icon={Recycle} title="Scrap">
          {activeScrapTypes.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No scrap types yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {activeScrapTypes.map((s) => (
                <StockRow
                  key={s.scrap_type_id}
                  label={s.name}
                  isNegative={(s.current_stock ?? 0) < 0}
                  isLow={s.is_low_stock ?? false}
                  threshold={s.low_stock_threshold}
                >
                  <StockValue value={s.current_stock ?? 0} unit="kg" />
                </StockRow>
              ))}
            </div>
          )}
        </GroupCard>

        <GroupCard icon={Package} title="Raw Materials">
          {activeMaterials.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No raw material types yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {activeMaterials.map((m) => (
                <StockRow
                  key={m.raw_material_type_id}
                  label={m.name}
                  isNegative={(m.current_stock ?? 0) < 0}
                  isLow={m.is_low_stock ?? false}
                  threshold={m.low_stock_threshold}
                >
                  <StockValue value={m.current_stock ?? 0} unit="kg" />
                </StockRow>
              ))}
            </div>
          )}
        </GroupCard>
      </div>
    </div>
  )
}
