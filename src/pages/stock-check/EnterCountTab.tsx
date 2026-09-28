import { useEffect, useMemo, useState } from 'react'
import { Chip } from '../../components/Chip'
import { Field } from '../../components/Field'
import { DateField } from '../../components/DateField'
import { NumberStepper } from '../../components/NumberStepper'
import { PackSizeField } from '../../components/PackSizeField'
import { StickyActionBar } from '../../components/StickyActionBar'
import { SaveButton } from '../../components/SaveButton'
import { LoadingState, EmptyNote } from '../../components/States'
import { useRawMaterialTypes, type RawMaterialType } from '../../hooks/useRawMaterialTypes'
import {
  useStockCounts,
  useSaveStockCount,
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

/**
 * A new count by default, or the saved count in `editing` (opened from Saved
 * Counts). After saving, `onSaved` takes the user to the saved list — the form
 * never turns into an edit of what was just saved.
 */
export function EnterCountTab({
  editing,
  onEdit,
  onCancelEdit,
  onSaved,
}: {
  editing: StockCount | null
  onEdit: (count: StockCount) => void
  onCancelEdit: () => void
  onSaved: (countDate: string) => void
}) {
  const { data: materialTypes, isLoading: typesLoading } = useRawMaterialTypes()
  const { data: counts } = useStockCounts()
  const saveCount = useSaveStockCount()
  const { showToast } = useToast()

  const [countDate, setCountDate] = useState(editing?.count_date ?? todayISODate())
  const [lines, setLines] = useState<Record<string, LineInput>>({})
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const { data: expected } = useExpectedRawMaterialStock(countDate)

  const activeTypes = useMemo(() => (materialTypes ?? []).filter((t) => t.is_active), [materialTypes])
  // save_stock_count replaces whatever is saved for the date, so a new count
  // on a date that already has one would silently overwrite it.
  const clash = editing ? null : ((counts ?? []).find((c) => c.count_date === countDate) ?? null)

  // Fill in lines only for materials that don't have one yet, so a background
  // refetch never wipes numbers the user is typing.
  useEffect(() => {
    setLines((prev) => {
      const next = { ...prev }
      for (const type of activeTypes) {
        if (next[type.id]) continue
        const item = editing?.items.find((i) => i.raw_material_type_id === type.id)
        next[type.id] = item ? lineFromItem(item) : emptyLine(type)
      }
      return next
    })
  }, [activeTypes, editing])

  function updateLine(id: string, patch: Partial<LineInput>) {
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function handleSave() {
    if (clash) {
      showToast(`A count for ${formatDateLabel(countDate)} is already saved — edit that one instead`, 'error')
      return
    }
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
        onSuccess: () => {
          showToast(editing ? 'Stock count updated' : 'Stock count saved')
          // Back to a blank form for the next count.
          setCountDate(todayISODate())
          setLines(Object.fromEntries(activeTypes.map((t) => [t.id, emptyLine(t)])))
          setNotes('')
          onSaved(countDate)
        },
        onError: () => showToast('Could not save stock count', 'error'),
      },
    )
  }

  if (typesLoading) return <LoadingState />

  return (
    <div className="space-y-6 pb-2">
      {editing ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-purple-300 bg-purple-50 px-4 py-3 dark:border-purple-800 dark:bg-purple-950/30">
          <p className="text-sm text-purple-900 dark:text-purple-200">
            Editing the count of <span className="font-semibold">{formatDateLabel(editing.count_date)}</span>. Change
            the numbers and tap Update Count.
          </p>
          <button
            type="button"
            onClick={onCancelEdit}
            className="min-h-[44px] shrink-0 rounded-lg border border-purple-300 bg-white px-3 text-sm font-semibold text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-slate-900 dark:text-purple-300"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Count what is left of each material at the end of the day — purchases and production dated that day
              are treated as before the count.
            </p>
            <DateField value={countDate} onChange={setCountDate} />
          </div>
          {clash && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                A count for <span className="font-semibold">{formatDateLabel(countDate)}</span> is already saved.
                Pick another date, or edit that count.
              </p>
              <button
                type="button"
                onClick={() => onEdit(clash)}
                className="min-h-[44px] shrink-0 rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300"
              >
                Edit it
              </button>
            </div>
          )}
        </div>
      )}

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

      {activeTypes.length > 0 && (
        <StickyActionBar>
          <SaveButton
            accent="stock"
            onClick={handleSave}
            disabled={clash !== null}
            pending={saveCount.isPending}
            label={editing ? 'Update Count' : 'Save Count'}
          />
        </StickyActionBar>
      )}
    </div>
  )
}
