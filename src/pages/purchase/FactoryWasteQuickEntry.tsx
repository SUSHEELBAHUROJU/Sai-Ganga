import { useState } from 'react'
import { useAddFactoryWasteEntry } from '../../hooks/useFactoryWasteEntries'
import { useScrapTypes } from '../../hooks/useScrapTypes'
import { DateField } from '../../components/DateField'
import { Chip } from '../../components/Chip'
import { ACTION_STYLES } from '../../lib/actionColors'
import { useToast } from '../../lib/toast'
import { firstError, validateQuantity } from '../../lib/validate'
import { todayISODate } from '../../lib/date'

const purchaseStyle = ACTION_STYLES.purchase

export function FactoryWasteQuickEntry() {
  const addEntry = useAddFactoryWasteEntry()
  const { data: scrapTypes } = useScrapTypes()
  const { showToast } = useToast()

  const [entryDate, setEntryDate] = useState(todayISODate())
  const [scrapTypeId, setScrapTypeId] = useState('')
  const [quantityKg, setQuantityKg] = useState('')

  const activeScrapTypes = (scrapTypes ?? []).filter((t) => t.is_active)

  function handleSave() {
    const problem = firstError(
      scrapTypeId ? null : 'Select a scrap type',
      validateQuantity(quantityKg, 'a quantity'),
    )
    if (problem) {
      showToast(problem, 'error')
      return
    }
    const qty = Number(quantityKg)
    addEntry.mutate(
      { entry_date: entryDate, scrap_type_id: scrapTypeId, quantity_kg: qty, notes: null },
      {
        onSuccess: () => {
          showToast('Waste Logged!')
          setQuantityKg('')
        },
        onError: () => showToast('Could not save factory waste', 'error'),
      },
    )
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-3 text-sm font-bold text-slate-600 dark:text-slate-300">
        Factory Waste — Quick Add
      </h3>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {activeScrapTypes.map((t) => (
            <Chip
              key={t.id}
              label={t.name}
              selected={scrapTypeId === t.id}
              selectedClass={purchaseStyle.chipSelected}
              onClick={() => setScrapTypeId(t.id)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          <DateField value={entryDate} onChange={setEntryDate} />
          <input
            type="number"
            min="0"
            inputMode="decimal"
            value={quantityKg}
            onChange={(e) => setQuantityKg(e.target.value)}
            placeholder="Kg"
            className="h-12 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-base text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={addEntry.isPending}
            className={`h-12 shrink-0 rounded-lg px-5 text-sm font-bold text-white disabled:opacity-40 ${purchaseStyle.solid}`}
          >
            {addEntry.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
