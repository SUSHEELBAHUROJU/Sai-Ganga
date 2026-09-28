import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { LoadingState, EmptyNote } from '../../components/States'
import { useRawMaterialTypes } from '../../hooks/useRawMaterialTypes'
import { useStockCounts, useDeleteStockCount, type StockCount, type StockCountItem } from '../../hooks/useStockChecks'
import { useToast } from '../../lib/toast'
import { formatDateLabel } from '../../lib/date'
import { formatQty } from '../../lib/format'

function countTotalKg(count: StockCount): number {
  return count.items.reduce((sum, i) => sum + (Number(i.quantity_kg) || 0), 0)
}

function itemBreakdown(item: StockCountItem): string {
  return item.entry_mode === 'bag'
    ? `${formatQty(item.num_bags ?? 0)} bags × ${formatQty(item.pack_kg ?? 0)} kg`
    : 'Weighed in kg'
}

/**
 * Every saved count, newest first. Tap one to see what was entered for each
 * material; the pencil opens it in the Enter Count form for changes.
 */
export function SavedCountsTab({
  highlightDate,
  onEdit,
}: {
  /** Date just saved — opened and outlined so the user sees where it went. */
  highlightDate: string | null
  onEdit: (count: StockCount) => void
}) {
  const { data: counts, isLoading } = useStockCounts()
  const { data: materialTypes } = useRawMaterialTypes()
  const deleteCount = useDeleteStockCount()
  const { showToast } = useToast()

  const [expandedDate, setExpandedDate] = useState<string | null>(highlightDate)
  const [deleting, setDeleting] = useState<StockCount | null>(null)

  const materialName = useMemo(() => {
    const names = new Map((materialTypes ?? []).map((t) => [t.id, t.name]))
    return (id: string) => names.get(id) ?? 'Unknown material'
  }, [materialTypes])

  function handleDelete() {
    if (!deleting) return
    deleteCount.mutate(deleting.id, {
      onSuccess: () => {
        showToast('Stock count removed')
        setDeleting(null)
      },
      onError: () => showToast('Could not remove stock count', 'error'),
    })
  }

  if (isLoading) return <LoadingState />

  if ((counts ?? []).length === 0) {
    return <EmptyNote>No counts yet. The first count is the starting point — the report begins from the second.</EmptyNote>
  }

  return (
    <div className="space-y-2">
      {(counts ?? []).map((count) => {
        const expanded = expandedDate === count.count_date
        return (
          <div
            key={count.id}
            className={`rounded-xl border bg-white dark:bg-slate-900 ${
              count.count_date === highlightDate
                ? 'border-purple-400 dark:border-purple-700'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center gap-1 px-3 py-1">
              <button
                type="button"
                onClick={() => setExpandedDate(expanded ? null : count.count_date)}
                className="flex min-h-[44px] min-w-0 flex-1 items-center justify-between gap-2 text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formatDateLabel(count.count_date)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {count.items.length} materials · {formatQty(countTotalKg(count))} kg in stock
                  </p>
                </div>
                {expanded ? (
                  <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
                )}
              </button>
              <button
                type="button"
                aria-label="Edit count"
                onClick={() => onEdit(count)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-purple-50 hover:text-purple-600 dark:hover:bg-purple-950/50"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Delete count"
                onClick={() => setDeleting(count)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {expanded && (
              <div className="space-y-1.5 border-t border-slate-200 px-3 py-3 dark:border-slate-800">
                {count.items.map((item) => (
                  <div key={item.raw_material_type_id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        {materialName(item.raw_material_type_id)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{itemBreakdown(item)}</p>
                    </div>
                    <span className="shrink-0 font-bold text-purple-700 dark:text-purple-300">
                      {formatQty(item.quantity_kg)} kg
                    </span>
                  </div>
                ))}
                {count.notes && <p className="pt-1 text-xs italic text-slate-500 dark:text-slate-400">{count.notes}</p>}
              </div>
            )}
          </div>
        )
      })}

      <ConfirmDialog
        open={deleting !== null}
        title="Remove this stock count?"
        message={
          deleting
            ? `Remove the count of ${formatDateLabel(deleting.count_date)}? The weekly report and live stock will be recalculated without it.`
            : ''
        }
        confirmLabel="Remove"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
