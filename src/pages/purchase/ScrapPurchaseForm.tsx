import { useState } from 'react'
import { useAddScrapPurchase } from '../../hooks/useScrapPurchases'
import { useScrapTypes } from '../../hooks/useScrapTypes'
import { ScrapDealerPicker } from '../../components/ScrapDealerPicker'
import { Chip } from '../../components/Chip'
import { Field } from '../../components/Field'
import { NumberStepper } from '../../components/NumberStepper'
import { StickyActionBar } from '../../components/StickyActionBar'
import { SaveButton } from '../../components/SaveButton'
import { ACTION_STYLES } from '../../lib/actionColors'
import { useToast } from '../../lib/toast'
import { firstError, validateQuantity, validateOptionalCost } from '../../lib/validate'

const purchaseStyle = ACTION_STYLES.purchase
const purchaseAccentClass = `${purchaseStyle.text} ${purchaseStyle.textDark} bg-current/10 hover:bg-current/20`

export function ScrapPurchaseForm({ entryDate }: { entryDate: string }) {
  const addPurchase = useAddScrapPurchase()
  const { data: scrapTypes } = useScrapTypes()
  const { showToast } = useToast()

  const [dealerId, setDealerId] = useState('')
  const [scrapTypeId, setScrapTypeId] = useState('')
  const [quantityKg, setQuantityKg] = useState('')
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')

  const activeScrapTypes = (scrapTypes ?? []).filter((t) => t.is_active)

  function handleSave() {
    const problem = firstError(
      scrapTypeId ? null : 'Select a scrap type',
      validateQuantity(quantityKg, 'quantity'),
      validateOptionalCost(cost),
    )
    if (problem) {
      showToast(problem, 'error')
      return
    }
    const qty = Number(quantityKg)

    addPurchase.mutate(
      {
        entry_date: entryDate,
        scrap_dealer_id: dealerId || null,
        scrap_type_id: scrapTypeId,
        quantity_kg: qty,
        cost: cost ? Number(cost) : null,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          showToast('Purchase Added!')
          setQuantityKg('')
          setCost('')
          setNotes('')
        },
        onError: () => showToast('Could not save scrap purchase', 'error'),
      },
    )
  }

  return (
    <div className="space-y-6 pb-2">
      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Scrap Dealer (optional)
          </span>
          <ScrapDealerPicker value={dealerId || null} onChange={setDealerId} />
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Scrap Type
          </span>
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
        </div>

        <NumberStepper
          label="How Many Kilograms?"
          value={quantityKg}
          onChange={setQuantityKg}
          allowDecimal
          step={5}
          accentClass={purchaseAccentClass}
        />

        <Field
          label="Cost (optional)"
          type="number"
          min="0"
          inputMode="decimal"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="0"
        />

        <Field
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes"
        />
      </div>

      <StickyActionBar>
        <SaveButton
          accent="purchase"
          onClick={handleSave}
          pending={addPurchase.isPending}
          label="Save Scrap Purchase"
        />
      </StickyActionBar>
    </div>
  )
}
