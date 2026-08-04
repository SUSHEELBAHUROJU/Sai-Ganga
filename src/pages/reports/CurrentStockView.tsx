import { useState } from 'react'
import { useFinishedGoodsStock, useRawMaterialStock, useScrapStock } from '../../hooks/useStock'
import { LoadingState } from '../../components/States'
import { StockFlag, StockValue, StockValueKgPcs, stockHealthBorderClass } from '../../components/StockBadges'
import { formatPipeProductLabel, piecesToKg } from '../../lib/format'

export function CurrentStockView() {
  const { data: finishedGoods, isLoading: loadingFinished } = useFinishedGoodsStock()
  const { data: rawMaterials, isLoading: loadingMaterials } = useRawMaterialStock()
  const { data: scrap, isLoading: loadingScrap } = useScrapStock()

  const [showInactivePipes, setShowInactivePipes] = useState(false)
  const [showInactiveMaterials, setShowInactiveMaterials] = useState(false)

  const isLoading = loadingFinished || loadingMaterials || loadingScrap

  if (isLoading) return <LoadingState label="Calculating stock…" />

  const visibleFinishedGoods = (finishedGoods ?? []).filter((p) => showInactivePipes || p.is_active)
  const visibleMaterials = (rawMaterials ?? []).filter((m) => showInactiveMaterials || m.is_active)

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Finished Goods</h3>
          <label className="flex min-h-[44px] items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={showInactivePipes}
              onChange={(e) => setShowInactivePipes(e.target.checked)}
              className="h-5 w-5 rounded border-slate-300"
            />
            Show removed
          </label>
        </div>
        {visibleFinishedGoods.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No pipe sizes yet.</p>
        ) : (
          <div className="space-y-1.5">
            {visibleFinishedGoods.map((p) => (
              <div
                key={p.pipe_product_id}
                className={`flex items-center justify-between gap-2 rounded-lg border border-l-4 border-slate-200 px-4 py-2.5 dark:border-slate-800 ${stockHealthBorderClass((p.current_stock ?? 0) < 0, p.is_low_stock ?? false)}`}
              >
                <span className="min-w-0 truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                  {formatPipeProductLabel(p.diameter_inches ?? 0, p.weight_kg ?? 0)}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <StockFlag
                    isNegative={(p.current_stock ?? 0) < 0}
                    isLow={p.is_low_stock ?? false}
                    threshold={p.low_stock_threshold}
                  />
                  <StockValueKgPcs
                    kg={piecesToKg(p.current_stock ?? 0, p.weight_kg ?? 0)}
                    pcs={p.current_stock ?? 0}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Scrap</h3>
        {(scrap ?? []).filter((s) => s.is_active).length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No scrap types yet.</p>
        ) : (
          <div className="space-y-1.5">
            {(scrap ?? [])
              .filter((s) => s.is_active)
              .map((s) => (
                <div
                  key={s.scrap_type_id}
                  className={`flex items-center justify-between gap-2 rounded-lg border border-l-4 border-slate-200 px-4 py-2.5 dark:border-slate-800 ${stockHealthBorderClass((s.current_stock ?? 0) < 0, s.is_low_stock ?? false)}`}
                >
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{s.name}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <StockFlag
                      isNegative={(s.current_stock ?? 0) < 0}
                      isLow={s.is_low_stock ?? false}
                      threshold={s.low_stock_threshold}
                    />
                    <StockValue value={s.current_stock ?? 0} unit="kg" />
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Raw Materials</h3>
          <label className="flex min-h-[44px] items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={showInactiveMaterials}
              onChange={(e) => setShowInactiveMaterials(e.target.checked)}
              className="h-5 w-5 rounded border-slate-300"
            />
            Show removed
          </label>
        </div>
        {visibleMaterials.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No raw material types yet.</p>
        ) : (
          <div className="space-y-1.5">
            {visibleMaterials.map((m) => (
              <div
                key={m.raw_material_type_id}
                className={`flex items-center justify-between gap-2 rounded-lg border border-l-4 border-slate-200 px-4 py-2.5 dark:border-slate-800 ${stockHealthBorderClass((m.current_stock ?? 0) < 0, m.is_low_stock ?? false)}`}
              >
                <span className="min-w-0 truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                  {m.name}
                  {m.is_recycled_output && (
                    <span className="ml-1.5 text-xs font-normal text-slate-400">(from recycling)</span>
                  )}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <StockFlag
                    isNegative={(m.current_stock ?? 0) < 0}
                    isLow={m.is_low_stock ?? false}
                    threshold={m.low_stock_threshold}
                  />
                  <StockValue value={m.current_stock ?? 0} unit="kg" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
