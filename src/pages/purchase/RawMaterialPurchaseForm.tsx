import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useRawMaterialTypes } from '../../hooks/useRawMaterialTypes'
import {
  useAddRawMaterialPurchase,
  splitTransportByWeight,
  type EntryMode,
  type NewRawMaterialPurchase,
} from '../../hooks/useRawMaterialPurchases'
import { useSuppliers } from '../../hooks/useSuppliers'
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

/** One material in a delivery, already validated and added to the list. */
type PurchaseItem = {
  localId: string
  materialTypeId: string
  materialName: string
  entryMode: EntryMode
  packKg: number | null
  numBags: number | null
  totalQtyKg: number
  pricePerKg: number
  cost: number
}

export function RawMaterialPurchaseForm({ entryDate }: { entryDate: string }) {
  const { data: materialTypes } = useRawMaterialTypes()
  const addPurchase = useAddRawMaterialPurchase()
  const { data: suppliers } = useSuppliers()
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
  // Items already added to this delivery; the fields above edit the next one.
  const [items, setItems] = useState<PurchaseItem[]>([])

  const totalQtyKg =
    entryMode === 'bag' ? (packKg && numBags ? packKg * Number(numBags) : 0) : Number(directKg) || 0
  // Rate × weight, recomputed on every keystroke — change the pack size, the
  // bag count or the rate and the cost below follows immediately.
  const materialCost = purchaseCost(Number(pricePerKg) || 0, totalQtyKg)
  const transportCost = Number(transport) || 0

  // Has the item editor been started? An untouched editor is ignored on save
  // once at least one item is in the list.
  const editorTouched = Boolean(numBags.trim() || directKg.trim() || pricePerKg.trim())
  const listedKg = items.reduce((sum, i) => sum + i.totalQtyKg, 0)
  const listedCost = items.reduce((sum, i) => sum + i.cost, 0)
  const deliveryKg = listedKg + (editorTouched ? totalQtyKg : 0)
  const deliveryMaterialCost = Math.round((listedCost + (editorTouched ? materialCost : 0)) * 100) / 100

  function clearItemEditor() {
    setNumBags('')
    setDirectKg('')
    setPricePerKg('')
  }

  function resetAmounts() {
    clearItemEditor()
    setItems([])
    setTransport('')
    setNotes('')
  }

  /** Checks the item editor; returns the item, or null after showing why not. */
  function readEditorItem(): PurchaseItem | null {
    const problem = firstError(
      materialTypeId ? null : 'Select a material type',
      entryMode === 'bag'
        ? firstError(
            packKg && packKg > 0 ? null : 'Choose a valid pack size',
            validateQuantity(numBags, 'number of bags'),
          )
        : validateQuantity(directKg, 'total quantity'),
      validateCost(pricePerKg),
    )
    if (problem || !materialTypeId) {
      showToast(problem ?? 'Select a material type', 'error')
      return null
    }
    return {
      localId: crypto.randomUUID(),
      materialTypeId,
      materialName: activeTypes.find((t) => t.id === materialTypeId)?.name ?? 'Material',
      entryMode,
      packKg: entryMode === 'bag' ? packKg : null,
      numBags: entryMode === 'bag' ? Number(numBags) : null,
      totalQtyKg,
      pricePerKg: Number(pricePerKg),
      cost: materialCost,
    }
  }

  function handleAddItem() {
    const item = readEditorItem()
    if (!item) return
    setItems((prev) => [...prev, item])
    clearItemEditor()
    // The next item is usually a different material.
    setMaterialTypeId(null)
  }

  function removeItem(localId: string) {
    setItems((prev) => prev.filter((i) => i.localId !== localId))
  }

  function handleSave() {
    const supplierProblem = firstError(
      supplierId ? null : 'Select a supplier',
      validateOptionalTransport(transport),
    )
    if (supplierProblem) {
      showToast(supplierProblem, 'error')
      return
    }

    // Everything in the list, plus the item being edited if it was started
    // (or if the list is empty — the plain one-material purchase).
    let toSave = items
    if (editorTouched || items.length === 0) {
      const item = readEditorItem()
      if (!item) return
      toSave = [...items, item]
    }

    const transportShares = splitTransportByWeight(
      transportCost,
      toSave.map((i) => i.totalQtyKg),
    )
    const trimmedNotes = notes.trim() || null
    const rows: NewRawMaterialPurchase[] = toSave.map((item, idx) => ({
      entry_date: entryDate,
      raw_material_type_id: item.materialTypeId,
      supplier_id: supplierId,
      entry_mode: item.entryMode,
      pack_kg: item.packKg,
      num_bags: item.numBags,
      total_qty_kg: item.totalQtyKg,
      price_per_kg: item.pricePerKg,
      cost: item.cost,
      transport_charges: transportShares[idx],
      notes: trimmedNotes,
    }))
    const totalMaterial = Math.round(rows.reduce((sum, r) => sum + r.cost, 0) * 100) / 100

    addPurchase.mutate(rows, {
      onSuccess: () => {
        // Material cost (not transport) goes onto the supplier's ledger.
        const supplier = (suppliers ?? []).find((sp) => sp.id === supplierId)
        const what = rows.length > 1 ? `${rows.length} items` : 'Purchase'
        showToast(
          supplier
            ? `${what} saved — ₹${formatQty(totalMaterial)} added to ${supplier.name}'s ledger`
            : `${what} saved!`,
        )
        resetAmounts()
      },
      onError: () => showToast('Could not save purchase — nothing was saved. Try again.', 'error'),
    })
  }

  const itemNumber = items.length + 1

  return (
    <div className="space-y-6 pb-2">
      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Supplier
          </span>
          <SupplierPicker value={supplierId || null} onChange={setSupplierId} />
        </div>

        {items.length > 0 && (
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Items in this purchase ({items.length})
            </span>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li
                  key={item.localId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-orange-200 bg-orange-50/60 py-1.5 pl-3 pr-1 dark:border-orange-900/60 dark:bg-orange-950/20"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.materialName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {item.entryMode === 'bag' && item.numBags !== null
                        ? `${formatQty(item.numBags)} × ${formatQty(item.packKg ?? 0)} kg = `
                        : ''}
                      {formatQty(item.totalQtyKg)} kg @ ₹{formatQty(item.pricePerKg)}/kg
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <span className="font-semibold tabular-nums text-orange-700 dark:text-orange-400">
                      ₹{formatQty(item.cost)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${item.materialName}`}
                      onClick={() => removeItem(item.localId)}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div
          className={
            items.length > 0
              ? 'space-y-5 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700'
              : 'space-y-5'
          }
        >
          {items.length > 0 && (
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Item {itemNumber} <span className="font-normal text-slate-400">(leave empty if done)</span>
            </p>
          )}

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
            <p className="text-xs font-medium text-orange-700 dark:text-orange-400">
              {items.length > 0 ? `Item ${itemNumber} Weight` : 'Total Weight'}
            </p>
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

          <button
            type="button"
            onClick={handleAddItem}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-orange-300 text-sm font-semibold text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-950/30"
          >
            <Plus className="h-4 w-4" />
            {items.length === 0 ? 'Add another item to this purchase' : 'Add this item'}
          </button>
        </div>

        <Field
          label={items.length > 0 ? 'Transport Charges for the whole load (₹, optional)' : 'Transport Charges (₹, optional)'}
          type="number"
          min="0"
          inputMode="decimal"
          value={transport}
          onChange={(e) => setTransport(e.target.value)}
          placeholder="0"
        />

        {items.length === 0 ? (
          <PurchaseCostSummary
            pricePerKg={Number(pricePerKg) || 0}
            quantityKg={totalQtyKg}
            materialCost={materialCost}
            transport={transportCost}
          />
        ) : (
          <div className="space-y-2 rounded-xl bg-orange-50 px-4 py-3 dark:bg-orange-950/30">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-orange-700/80 dark:text-orange-400/80">
                {items.length + (editorTouched ? 1 : 0)} items · {formatQty(deliveryKg)} kg
              </span>
              <span className="font-semibold tabular-nums text-orange-700 dark:text-orange-400">
                ₹{formatQty(deliveryMaterialCost)}
              </span>
            </div>
            {transportCost > 0 && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-orange-700/80 dark:text-orange-400/80">
                  Transport (shared by weight)
                </span>
                <span className="font-semibold tabular-nums text-orange-700 dark:text-orange-400">
                  ₹{formatQty(transportCost)}
                </span>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3 border-t border-orange-200 pt-2 dark:border-orange-900/60">
              <span className="text-xs font-medium text-orange-700 dark:text-orange-400">Total Purchase Cost</span>
              <span className="text-lg font-bold tabular-nums text-orange-700 dark:text-orange-400">
                ₹{formatQty(deliveryMaterialCost + transportCost)}
              </span>
            </div>
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
          accent="purchase"
          onClick={handleSave}
          pending={addPurchase.isPending}
          label={
            items.length + (editorTouched ? 1 : 0) > 1
              ? `Save Purchase (${items.length + (editorTouched ? 1 : 0)} items)`
              : 'Save Purchase'
          }
        />
      </StickyActionBar>
    </div>
  )
}
