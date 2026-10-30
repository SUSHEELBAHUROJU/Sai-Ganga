import { useState } from 'react'
import { Chip } from '../../components/Chip'
import { Field } from '../../components/Field'
import { StickyActionBar } from '../../components/StickyActionBar'
import { SaveButton } from '../../components/SaveButton'
import {
  GranuleOutputField,
  granuleTotalKg,
  EMPTY_GRANULE_OUTPUT,
  type GranuleOutput,
} from '../../components/GranuleOutputField'
import { useScrapTypes } from '../../hooks/useScrapTypes'
import { useScrapStock } from '../../hooks/useStock'
import { formatQty, scrapUsedForGranules } from '../../lib/format'
import { useAddGranulesRecyclingEntry } from '../../hooks/useRecyclingEntries'
import { ACTION_STYLES } from '../../lib/actionColors'
import { useToast } from '../../lib/toast'
import { firstError, validateQuantity } from '../../lib/validate'

const recyclingStyle = ACTION_STYLES.recycling
const recyclingAccentClass = `${recyclingStyle.text} ${recyclingStyle.textDark} bg-current/10 hover:bg-current/20`

export function RecycledGranulesTab({ entryDate }: { entryDate: string }) {
  const { data: scrapTypes } = useScrapTypes()
  const { data: scrapStock } = useScrapStock()
  const addGranulesEntry = useAddGranulesRecyclingEntry()
  const { showToast } = useToast()

  const [sourceScrapTypeId, setSourceScrapTypeId] = useState('')
  const [output, setOutput] = useState<GranuleOutput>(EMPTY_GRANULE_OUTPUT)
  const [notes, setNotes] = useState('')

  const activeScrapTypes = (scrapTypes ?? []).filter((t) => t.is_active)
  const producedKg = granuleTotalKg(output)
  const isPending = addGranulesEntry.isPending

  // What this batch takes off scrap stock: granules ÷ (1 − loss %), the same
  // rule the scrap_stock view deducts by.
  const sourceType = activeScrapTypes.find((t) => t.id === sourceScrapTypeId) ?? null
  const lossPct = sourceType ? Number(sourceType.loss_pct) : 0
  const scrapUsedKg = sourceType && producedKg > 0 ? scrapUsedForGranules(producedKg, lossPct) : 0
  const scrapInStock = scrapStock?.find((s) => s.scrap_type_id === sourceScrapTypeId)?.current_stock ?? null
  const scrapAfter = scrapInStock !== null ? Math.round((Number(scrapInStock) - scrapUsedKg) * 100) / 100 : null

  function resetForm() {
    setOutput(EMPTY_GRANULE_OUTPUT)
    setNotes('')
  }

  function handleSave() {
    if (!sourceScrapTypeId) {
      showToast('Choose a source material', 'error')
      return
    }

    const problem = firstError(
      output.mode === 'bag'
        ? firstError(
            output.packKg && output.packKg > 0 ? null : 'Choose a valid pack size',
            validateQuantity(output.numBags, 'number of bags'),
          )
        : validateQuantity(output.directKg, 'granules produced'),
    )
    if (problem) {
      showToast(problem, 'error')
      return
    }

    addGranulesEntry.mutate(
      {
        entry_date: entryDate,
        source_scrap_type_id: sourceScrapTypeId,
        output_entry_mode: output.mode,
        output_pack_kg: output.mode === 'bag' ? output.packKg : null,
        num_bags: output.mode === 'bag' ? Number(output.numBags) : null,
        total_output_kg: producedKg,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          showToast('Recycling Added!')
          resetForm()
        },
        onError: () => showToast('Could not save recycling entry', 'error'),
      },
    )
  }

  return (
    <div className="space-y-6 pb-2">
      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Source Material
          </span>
          <div className="flex flex-wrap gap-2">
            {activeScrapTypes.map((t) => (
              <Chip
                key={t.id}
                label={t.name}
                selected={sourceScrapTypeId === t.id}
                selectedClass={recyclingStyle.chipSelected}
                onClick={() => setSourceScrapTypeId(t.id)}
              />
            ))}
          </div>
          {sourceType && scrapInStock !== null && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {formatQty(Number(scrapInStock))} kg {sourceType.name} in stock · {formatQty(lossPct)}% recycling loss
            </p>
          )}
          {activeScrapTypes.length === 0 && (
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              No scrap types yet. Add some in Settings → Scrap Types first.
            </p>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Enter the granules produced from recycling.
          </p>
          <GranuleOutputField
            value={output}
            onChange={setOutput}
            chipSelectedClass={recyclingStyle.chipSelected}
            stepperAccentClass={recyclingAccentClass}
          />
        </div>

        {scrapUsedKg > 0 && sourceType && (
          <div
            className={`rounded-lg border px-3 py-2.5 text-sm ${
              scrapAfter !== null && scrapAfter < 0
                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200'
            }`}
          >
            <p>
              Uses <span className="font-semibold">{formatQty(scrapUsedKg)} kg</span> of {sourceType.name}
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {' '}
                ({formatQty(producedKg)} kg granules + {formatQty(Math.round((scrapUsedKg - producedKg) * 100) / 100)} kg
                lost at {formatQty(lossPct)}%)
              </span>
            </p>
            {scrapAfter !== null && (
              <p className="mt-0.5 text-xs">
                Scrap stock: {formatQty(Number(scrapInStock))} kg → <span className="font-semibold">{formatQty(scrapAfter)} kg</span>
                {scrapAfter < 0 && ' — more than is in stock. Check the granules figure, or record the missing scrap purchase.'}
              </p>
            )}
          </div>
        )}

        <Field
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes"
        />
      </div>

      <StickyActionBar>
        <SaveButton
          accent="recycling"
          onClick={handleSave}
          pending={isPending}
          label="Save Recycling Entry"
        />
      </StickyActionBar>
    </div>
  )
}
