import { useState } from 'react'
import { useAddScrapPurchase } from '../../hooks/useScrapPurchases'
import { useScrapTypes } from '../../hooks/useScrapTypes'
import { ScrapDealerPicker } from '../../components/ScrapDealerPicker'
import { PurchaseCostSummary } from '../../components/PurchaseCostSummary'
import { Chip } from '../../components/Chip'
import { Field } from '../../components/Field'
import { NumberStepper } from '../../components/NumberStepper'
import { StickyActionBar } from '../../components/StickyActionBar'
import { SaveButton } from '../../components/SaveButton'
import { ACTION_STYLES } from '../../lib/actionColors'
import { useToast } from '../../lib/toast'
import {
  firstError,
  validateQuantity,
  validateCost,
  validateOptionalTransport,
} from '../../lib/validate'
import { purchaseCost } from '../../lib/format'

const purchaseStyle = ACTION_STYLES.purchase
const purchaseAccentClass = `${purchaseStyle.text} ${purchaseStyle.textDark} bg-current/10 hover:bg-current/20`

export function ScrapPurchaseForm({ entryDate }: { entryDate: string }) {
  const addPurchase = useAddScrapPurchase()
  const { data: scrapTypes } = useScrapTypes()
  const { showToast } = useToast()

  const [dealerId, setDealerId] = useState('')
  const [scrapTypeId, setScrapTypeId] = useState('')
  const [quantityKg, setQuantityKg] = useState('')
  const [pricePerKg, setPricePerKg] = useState('')
  const [transport, setTransport] = useState('')
  const [notes, setNotes] = useState('')

  const activeScrapTypes = (scrapTypes ?? []).filter((t) => t.is_active)
  // Rate × weight, recomputed as either one is typed.
  const qtyValue = Number(quantityKg) || 0
  const materialCost = purchaseCost(Number(pricePerKg) || 0, qtyValue)
  const transportCost = Number(transport) || 0

  function handleSave() {
    const problem = firstError(
      scrapTypeId ? null : 'Select a scrap type',
      validateQuantity(quantityKg, 'quantity'),
      validateCost(pricePerKg),
      validateOptionalTransport(transport),
    )
    if (problem) {
      showToast(problem, 'error')
      return
    }

    addPurchase.mutate(
      {
        entry_date: entryDate,
        scrap_dealer_id: dealerId || null,
        scrap_type_id: scrapTypeId,
        quantity_kg: qtyValue,
        price_per_kg: Number(pricePerKg),
        cost: materialCost,
        transport_charges: transportCost,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          showToast('Purchase Added!')
          setQuantityKg('')
          setPricePerKg('')
          setTransport('')
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
          label="Price per kg (₹)"
          type="number"
          min="0"
          inputMode="decimal"
          value={pricePerKg}
          onChange={(e) => setPricePerKg(e.target.value)}
          placeholder="Rate agreed with the dealer"
        />

        <Field
          label="Transport Charges (₹, optional)"
          type="number"
          min="0"
          inputMode="decimal"
          value={transport}
          onChange={(e) => setTransport(e.target.value)}
          placeholder="0"
        />

        <PurchaseCostSummary
          pricePerKg={Number(pricePerKg) || 0}
          quantityKg={qtyValue}
          materialCost={materialCost}
          transport={transportCost}
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
