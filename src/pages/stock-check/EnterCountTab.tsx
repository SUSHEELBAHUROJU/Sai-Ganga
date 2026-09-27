import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Chip } from '../../components/Chip'
import { Field } from '../../components/Field'
import { DateField } from '../../components/DateField'
import { NumberStepper } from '../../components/NumberStepper'
import { PackSizeField } from '../../components/PackSizeField'
import { StickyActionBar } from '../../components/StickyActionBar'
import { SaveButton } from '../../components/SaveButton'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { LoadingState, EmptyNote } from '../../components/States'
import { useRawMaterialTypes, type RawMaterialType } from '../../hooks/useRawMaterialTypes'
import {
  useStockCounts,
  useSaveStockCount,
  useDeleteStockCount,
  useExpectedRawMaterialStock,
  type StockCount,
  type StockCountItem,
} from '../../hooks/useStockChecks'
import type { EntryMode } from '../../hooks/useRawMaterialPurchases'
import { ACTION_STYLES } from '../../lib/actionColors'
import { useToast } from '../../lib/toast'
import { formatDateLabel, todayISODate } from '../../lib/date'
import { formatQty } from '../../lib/format'

const stockStyle = ACTION_STYLES.stock
const stockAccentClass = `${stockStyle.text} ${stockStyle.textDark} bg-current/10 hover:bg-current/20`

type LineInput = { mode: EntryMode; packKg: number | null; bags: string; kg: string }

function emptyLine(type: RawMaterialType): LineInput {
  return { mode: 'bag', packKg: type.default_pack_kg ?? 25, bags: '', kg: '' }
}

function lineFromItem(item: StockCountItem): LineInput {
  return item.entry_mode === 'bag'
    ? { mode: 'bag', packKg: item.pack_kg, bags: String(item.num_bags ?? ''), kg: '' }
    : { mode: 'direct_kg', packKg: null, bags: '', kg: String(item.quantity_kg) }
}

/** null while the line is still blank — a blank line is "not counted yet", not 0. */
function lineKg(line: LineInput): number | null {
  if (line.mode === 'bag') {
    if (line.bags.trim() === '' || !line.packKg) return null
    return line.packKg * Number(line.bags)
  }
  return line.kg.trim() === '' ? null : Number(line.kg)
}

function countTotalKg(count: StockCount): number {
  return count.items.reduce((sum, i) => sum + (Number(i.quantity_kg) || 0), 0)
}

export function EnterCountTab() {
  const { data: materialTypes, isLoading: typesLoading } = useRawMaterialTypes()
  const { data: counts } = useStockCounts()
  const saveCount = useSaveStockCount()
  const deleteCount = useDeleteStockCount()
  const { showToast } = useToast()

  const [countDate, setCountDate] = useState(todayISODate())
  const [lines, setLines] = useState<Record<string, LineInput>>({})
  const [notes, setNotes] = useState('')
  const [deleting, setDeleting] = useState<StockCount | null>(null)
  const { data: expected } = useExpectedRawMaterialStock(countDate)

  const activeTypes = useMemo(() => (materialTypes ?? []).filter((t) => t.is_active), [materialTypes])
  const existing = (counts ?? []).find((c) => c.count_date === countDate) ?? null

  // Picking a date that already has a count opens it for editing; any other
  // date starts blank. Re-runs when the saved counts arrive or change.
  useEffect(() => {
    const next: Record<string, LineInput> = {}
    for (const type of activeTypes) {
      const item = existing?.items.find((i) => i.raw_material_type_id === type.id)
      next[type.id] = item ? lineFromItem(item) : emptyLine(type)
    }
    setLines(next)
    setNotes(existing?.notes ?? '')
  }, [activeTypes, existing])

  function updateLine(id: string, patch: Partial<LineInput>) {
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function handleSave() {
    const items: StockCountItem[] = []
    for (const type of activeTypes) {
      const line = lines[type.id]
      const kg = line ? lineKg(line) : null
      if (kg === null || Number.isNaN(kg) || kg < 0) {
        showToast(`Enter the stock for ${type.name} (0 if none left)`, 'error')
        return
      }
      items.push({
        raw_material_type_id: type.id,
        entry_mode: line.mode,
        pack_kg: line.mode === 'bag' ? line.packKg : null,
        num_bags: line.mode === 'bag' ? Number(line.bags) : null,
        quantity_kg: Math.round(kg * 100) / 100,
      })
    }

    saveCount.mutate(
      { count_date: countDate, notes: notes.trim() || null, items },
      {
        onSuccess: () => showToast(existing ? 'Stock count updated' : 'Stock count saved'),
        onError: () => showToast('Could not save stock count', 'error'),
      },
    )
  }

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

  if (typesLoading) return <LoadingState />

  return (
    <div className="space-y-6 pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {existing ? 'Editing the count saved for this date.' : 'Count what is left of each material.'} Count at the
          end of the day — purchases and production dated that day are treated as before the count.
        </p>
        <DateField value={countDate} onChange={setCountDate} />
      </div>

      {activeTypes.length === 0 ? (
        <EmptyNote>No active raw material types. Add some in Settings → Raw Materials first.</EmptyNote>
      ) : (
        <div className="space-y-3">
          {activeTypes.map((type) => {
            const line = lines[type.id]
            if (!line) return null
            const kg = lineKg(line)
            const expectedKg = expected?.get(type.id)
            const diff = kg !== null && expectedKg !== undefined ? kg - expectedKg : null

            return (
              <div
                key={type.id}
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{type.name}</p>
                    {expectedKg !== undefined && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatQty(expectedKg)} kg available (last count + received)
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Chip
                      label="Bags"
                      selected={line.mode === 'bag'}
                      selectedClass={stockStyle.chipSelected}
                      onClick={() => updateLine(type.id, { mode: 'bag', packKg: line.packKg ?? type.default_pack_kg ?? 25 })}
                    />
                    <Chip
                      label="Kg"
                      selected={line.mode === 'direct_kg'}
                      selectedClass={stockStyle.chipSelected}
                      onClick={() => updateLine(type.id, { mode: 'direct_kg' })}
                    />
                  </div>
                </div>

                {line.mode === 'bag' ? (
                  <>
                    <PackSizeField
                      key={`${countDate}-${type.id}`}
                      value={line.packKg}
                      onChange={(packKg) => updateLine(type.id, { packKg })}
                      chipSelectedClass={stockStyle.chipSelected}
                    />
                    <NumberStepper
                      label="Bags left"
                      value={line.bags}
                      onChange={(bags) => updateLine(type.id, { bags })}
                      allowDecimal
                      accentClass={stockAccentClass}
                    />
                  </>
                ) : (
                  <NumberStepper
                    label="Kg left"
                    value={line.kg}
                    onChange={(value) => updateLine(type.id, { kg: value })}
                    allowDecimal
                    step={5}
                    accentClass={stockAccentClass}
                  />
                )}

                <div className="flex items-center justify-between rounded-lg bg-purple-50 px-3 py-2 text-sm dark:bg-purple-950/30">
                  <span className="font-bold text-purple-700 dark:text-purple-300">
                    {kg === null ? '—' : `${formatQty(kg)} kg`}
                  </span>
                  {diff !== null && Math.abs(diff) >= 0.01 && (
                    <span
                      className={`text-xs font-semibold ${diff < 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
                    >
                      {diff < 0 ? `${formatQty(-diff)} kg used` : `${formatQty(diff)} kg more than available — check entries`}
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          <Field label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Past Counts
        </h3>
        {(counts ?? []).length === 0 ? (
          <EmptyNote>No counts yet. The first count is the starting point — the report begins from the second.</EmptyNote>
        ) : (
          <div className="space-y-1.5">
            {(counts ?? []).map((count) => (
              <div
                key={count.id}
                className={`flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 dark:bg-slate-900 ${
                  count.count_date === countDate
                    ? 'border-purple-400 dark:border-purple-700'
                    : 'border-slate-200/70 dark:border-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setCountDate(count.count_date)}
                  className="min-h-[44px] min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formatDateLabel(count.count_date)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {count.items.length} materials · {formatQty(countTotalKg(count))} kg in stock
                  </p>
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
            ))}
          </div>
        )}
      </div>

      {activeTypes.length > 0 && (
        <StickyActionBar>
          <SaveButton
            accent="stock"
            onClick={handleSave}
            pending={saveCount.isPending}
            label={existing ? 'Update Count' : 'Save Count'}
          />
        </StickyActionBar>
      )}

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
