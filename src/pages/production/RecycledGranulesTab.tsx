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
import { useAddGranulesRecyclingEntry } from '../../hooks/useRecyclingEntries'
import { ACTION_STYLES } from '../../lib/actionColors'
import { useToast } from '../../lib/toast'
import { firstError, validateQuantity } from '../../lib/validate'

const recyclingStyle = ACTION_STYLES.recycling
const recyclingAccentClass = `${recyclingStyle.text} ${recyclingStyle.textDark} bg-current/10 hover:bg-current/20`

export function RecycledGranulesTab({ entryDate }: { entryDate: string }) {
  const { data: scrapTypes } = useScrapTypes()
  const addGranulesEntry = useAddGranulesRecyclingEntry()
  const { showToast } = useToast()

  const [sourceScrapTypeId, setSourceScrapTypeId] = useState('')
  const [output, setOutput] = useState<GranuleOutput>(EMPTY_GRANULE_OUTPUT)
  const [notes, setNotes] = useState('')

  const activeScrapTypes = (scrapTypes ?? []).filter((t) => t.is_active)
  const producedKg = granuleTotalKg(output)
  const isPending = addGranulesEntry.isPending

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
