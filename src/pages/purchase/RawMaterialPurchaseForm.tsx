import { useMemo, useState } from 'react'
import { useRawMaterialTypes } from '../../hooks/useRawMaterialTypes'
import { useAddRawMaterialPurchase, type EntryMode } from '../../hooks/useRawMaterialPurchases'
import { Chip } from '../../components/Chip'
import { Field } from '../../components/Field'
import { NumberStepper } from '../../components/NumberStepper'
import { PackSizeField } from '../../components/PackSizeField'
import { StickyActionBar } from '../../components/StickyActionBar'
import { SaveButton } from '../../components/SaveButton'
import { SupplierPicker } from '../../components/SupplierPicker'
import { PurchaseCostSummary } from '../../components/PurchaseCostSummary'
import { ACTION_STYLES } from '../../lib/actionColors'
import { useToast } from '../../lib/toast'
import {
  firstError,
  validateQuantity,
  validateCost,
  validateOptionalTransport,
} from '../../lib/validate'
import { formatQty, purchaseCost } from '../../lib/format'

const purchaseStyle = ACTION_STYLES.purchase
const purchaseAccentClass = `${purchaseStyle.text} ${purchaseStyle.textDark} bg-current/10 hover:bg-current/20`

export function RawMaterialPurchaseForm({ entryDate }: { entryDate: string }) {
  const { data: materialTypes } = useRawMaterialTypes()
  const addPurchase = useAddRawMaterialPurchase()
  const { showToast } = useToast()

  const activeTypes = useMemo(() => (materialTypes ?? []).filter((t) => t.is_active), [materialTypes])

  const [materialTypeId, setMaterialTypeId] = useState<string | null>(null)
  const [supplierId, setSupplierId] = useState('')
  const [entryMode, setEntryMode] = useState<EntryMode>('bag')
  const [packKg, setPackKg] = useState<number | null>(25)
  const [numBags, setNumBags] = useState('')
  const [directKg, setDirectKg] = useState('')
  const [pricePerKg, setPricePerKg] = useState('')
  const [transport, setTransport] = useState('')
  const [notes, setNotes] = useState('')

  const totalQtyKg =
    entryMode === 'bag' ? (packKg && numBags ? packKg * Number(numBags) : 0) : Number(directKg) || 0
  // Rate × weight, recomputed on every keystroke — change the pack size, the
  // bag count or the rate and the cost below follows immediately.
  const materialCost = purchaseCost(Number(pricePerKg) || 0, totalQtyKg)
  const transportCost = Number(transport) || 0

  function resetAmounts() {
    setNumBags('')
    setDirectKg('')
    setPricePerKg('')
    setTransport('')
    setNotes('')
  }

  function handleSave() {
    const problem = firstError(
      materialTypeId ? null : 'Select a material type',
      entryMode === 'bag'
        ? firstError(
            packKg && packKg > 0 ? null : 'Choose a valid pack size',
            validateQuantity(numBags, 'number of bags'),
          )
        : validateQuantity(directKg, 'total quantity'),
      validateCost(pricePerKg),
      validateOptionalTransport(transport),
    )
    if (problem) {
      showToast(problem, 'error')
      return
    }
    if (!materialTypeId) return

    addPurchase.mutate(
      {
        entry_date: entryDate,
        raw_material_type_id: materialTypeId,
        supplier_id: supplierId || null,
        entry_mode: entryMode,
        pack_kg: entryMode === 'bag' ? packKg : null,
        num_bags: entryMode === 'bag' ? Number(numBags) : null,
        total_qty_kg: totalQtyKg,
        price_per_kg: Number(pricePerKg),
        cost: materialCost,
        transport_charges: transportCost,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          showToast('Purchase Added!')
          resetAmounts()
        },
        onError: () => showToast('Could not save purchase', 'error'),
      },
    )
  }

  return (
    <div className="space-y-6 pb-2">
      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Material Type
          </span>
          {activeTypes.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No active raw material types. Add some in Settings → Raw Materials first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {activeTypes.map((t) => (
                <Chip
                  key={t.id}
                  label={t.name}
                  selected={materialTypeId === t.id}
                  selectedClass={purchaseStyle.chipSelected}
                  onClick={() => setMaterialTypeId(t.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Supplier (optional)
          </span>
          <SupplierPicker value={supplierId || null} onChange={setSupplierId} />
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            How Was It Packed?
          </span>
          <div className="flex flex-wrap gap-2">
            <Chip
              label="By Bags"
              selected={entryMode === 'bag'}
              selectedClass={purchaseStyle.chipSelected}
              onClick={() => setEntryMode('bag')}
            />
            <Chip
              label="Direct Total"
              selected={entryMode === 'direct_kg'}
              selectedClass={purchaseStyle.chipSelected}
              onClick={() => setEntryMode('direct_kg')}
            />
          </div>
        </div>

        {entryMode === 'bag' ? (
          <>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Pack Size
              </span>
              <PackSizeField
                value={packKg}
                onChange={setPackKg}
                chipSelectedClass={purchaseStyle.chipSelected}
              />
            </div>
            <NumberStepper
              label="How Many Bags?"
              value={numBags}
              onChange={setNumBags}
              accentClass={purchaseAccentClass}
            />
          </>
        ) : (
          <NumberStepper
            label="Total Weight (kg)"
            value={directKg}
            onChange={setDirectKg}
            allowDecimal
            step={5}
            accentClass={purchaseAccentClass}
          />
        )}

        <div className="rounded-xl bg-orange-50 px-4 py-3 text-center dark:bg-orange-950/30">
          <p className="text-xs font-medium text-orange-700 dark:text-orange-400">Total Weight</p>
          <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">
            {formatQty(totalQtyKg)} kg
          </p>
        </div>

        <Field
          label="Price per kg (₹)"
          type="number"
          min="0"
          inputMode="decimal"
          value={pricePerKg}
          onChange={(e) => setPricePerKg(e.target.value)}
          placeholder="Rate agreed with the supplier"
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
          quantityKg={totalQtyKg}
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
          label="Save Purchase"
        />
      </StickyActionBar>
    </div>
  )
}
