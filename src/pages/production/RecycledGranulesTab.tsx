import { useState } from 'react'
import { Chip } from '../../components/Chip'
import { Field } from '../../components/Field'
import { NumberStepper } from '../../components/NumberStepper'
import { StickyActionBar } from '../../components/StickyActionBar'
import { SaveButton } from '../../components/SaveButton'
import { RecyclingBalance } from '../../components/RecyclingBalance'
import {
  GranuleOutputField,
  granuleTotalKg,
  EMPTY_GRANULE_OUTPUT,
  type GranuleOutput,
} from '../../components/GranuleOutputField'
import { PipeProductPicker } from '../../components/PipeProductPicker'
import { useScrapTypes } from '../../hooks/useScrapTypes'
import { usePipeProducts } from '../../hooks/usePipeProducts'
import {
  useAddGranulesRecyclingEntry,
  useAddDirectToPipeRecyclingEntry,
  type RecyclingOutputMode,
} from '../../hooks/useRecyclingEntries'
import { ACTION_STYLES } from '../../lib/actionColors'
import { useToast } from '../../lib/toast'
import { firstError, validateQuantity } from '../../lib/validate'

const recyclingStyle = ACTION_STYLES.recycling
const recyclingAccentClass = `${recyclingStyle.text} ${recyclingStyle.textDark} bg-current/10 hover:bg-current/20`

const OUTPUT_MODE_OPTIONS: { value: RecyclingOutputMode; label: string }[] = [
  { value: 'granules', label: 'Granules' },
  { value: 'direct_to_pipe', label: 'Direct to Pipe' },
]

export function RecycledGranulesTab({ entryDate }: { entryDate: string }) {
  const { data: scrapTypes } = useScrapTypes()
  const { data: pipeProducts, isLoading: loadingPipeProducts } = usePipeProducts()
  const addGranulesEntry = useAddGranulesRecyclingEntry()
  const addDirectToPipeEntry = useAddDirectToPipeRecyclingEntry()
  const { showToast } = useToast()

  const [sourceScrapTypeId, setSourceScrapTypeId] = useState('')
  const [scrapConsumed, setScrapConsumed] = useState('')
  const [outputMode, setOutputMode] = useState<RecyclingOutputMode>('granules')
  const [output, setOutput] = useState<GranuleOutput>(EMPTY_GRANULE_OUTPUT)
  const [pipeProductId, setPipeProductId] = useState<string | null>(null)
  const [pipeQuantity, setPipeQuantity] = useState('')
  const [notes, setNotes] = useState('')

  const activeScrapTypes = (scrapTypes ?? []).filter((t) => t.is_active)
  const consumedKg = scrapConsumed.trim() === '' ? null : Number(scrapConsumed)
  const producedKg = granuleTotalKg(output)
  const isPending = addGranulesEntry.isPending || addDirectToPipeEntry.isPending

  function resetForm() {
    setScrapConsumed('')
    setOutput(EMPTY_GRANULE_OUTPUT)
    setPipeProductId(null)
    setPipeQuantity('')
    setNotes('')
  }

  function handleSave() {
    if (!sourceScrapTypeId) {
      showToast('Choose a source material', 'error')
      return
    }
    const consumedProblem =
      scrapConsumed.trim() === '' ? null : validateQuantity(scrapConsumed, 'scrap consumed')
    if (consumedProblem) {
      showToast(consumedProblem, 'error')
      return
    }

    if (outputMode === 'granules') {
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

      // Deliberately no check that produced <= consumed: a mismatch is the
      // user's to notice and correct, not ours to block.
      addGranulesEntry.mutate(
        {
          entry_date: entryDate,
          source_scrap_type_id: sourceScrapTypeId,
          scrap_consumed_kg: consumedKg,
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
      return
    }

    // direct_to_pipe
    const problem = firstError(
      pipeProductId ? null : 'Choose a pipe size',
      validateQuantity(pipeQuantity, 'a quantity', { allowDecimal: false }),
    )
    if (problem) {
      showToast(problem, 'error')
      return
    }
    const qty = Number(pipeQuantity)
    addDirectToPipeEntry.mutate(
      {
        entry_date: entryDate,
        source_scrap_type_id: sourceScrapTypeId,
        scrap_consumed_kg: consumedKg,
        pipe_product_id: pipeProductId as string,
        pipe_quantity: qty,
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

        <NumberStepper
          label="Scrap Used (kg) — optional, if you know it"
          value={scrapConsumed}
          onChange={setScrapConsumed}
          allowDecimal
          step={5}
          accentClass={recyclingAccentClass}
        />

        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            What Came Out?
          </span>
          <div className="flex flex-wrap gap-2">
            {OUTPUT_MODE_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={outputMode === opt.value}
                selectedClass={recyclingStyle.chipSelected}
                onClick={() => setOutputMode(opt.value)}
              />
            ))}
          </div>

          {outputMode === 'granules' ? (
            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                  Enter what actually came out — it won't match the scrap that went in.
                </p>
                <GranuleOutputField
                  value={output}
                  onChange={setOutput}
                  chipSelectedClass={recyclingStyle.chipSelected}
                  stepperAccentClass={recyclingAccentClass}
                />
              </div>
              {consumedKg !== null && <RecyclingBalance consumedKg={consumedKg} producedKg={producedKg} />}
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Skips the granule stage — adds straight to finished pipe stock.
              </p>
              {loadingPipeProducts ? (
                <p className="text-sm text-slate-500">Loading pipe sizes…</p>
              ) : (
                <PipeProductPicker
                  pipeProducts={pipeProducts ?? []}
                  value={pipeProductId}
                  onChange={setPipeProductId}
                  chipSelectedClass={recyclingStyle.chipSelected}
                />
              )}
              <NumberStepper
                label="How Many? (pcs)"
                value={pipeQuantity}
                onChange={setPipeQuantity}
                accentClass={recyclingAccentClass}
              />
            </div>
          )}
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
