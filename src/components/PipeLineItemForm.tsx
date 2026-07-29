import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { PipeProduct } from '../hooks/usePipeProducts'
import { PipeProductPicker } from './PipeProductPicker'
import { NumberStepper } from './NumberStepper'
import { ACTION_STYLES, type ActionKey } from '../lib/actionColors'
import { useToast } from '../lib/toast'
import { validateQuantity } from '../lib/validate'
import { formatQty, piecesToKg } from '../lib/format'

export type PendingLine = {
  pipeProductId: string
  label: string
  quantity: number
  weightKg: number
}

type PipeLineItemFormProps = {
  pipeProducts: PipeProduct[]
  onAdd: (line: PendingLine) => void
  /** Pcs still available for a product (accounting for lines already staged) — sales only. Omit to skip the oversell warning. */
  getAvailableStock?: (pipeProductId: string) => number | null
  /** Screen this form is used on — colors the chips, stepper and Add button to match. */
  accent?: ActionKey
}

export function PipeLineItemForm({
  pipeProducts,
  onAdd,
  getAvailableStock,
  accent = 'production',
}: PipeLineItemFormProps) {
  const style = ACTION_STYLES[accent]
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState('')
  const { showToast } = useToast()

  const selectedProduct = pipeProducts.find((p) => p.id === selectedProductId) ?? null
  const availablePcs = selectedProduct ? (getAvailableStock?.(selectedProduct.id) ?? null) : null
  const qtyNum = Number(quantity) || 0
  const willOversell = selectedProduct !== null && availablePcs !== null && qtyNum > availablePcs

  function handleAdd() {
    if (!selectedProduct) {
      showToast('Choose a pipe size first', 'error')
      return
    }
    const problem = validateQuantity(quantity, 'a quantity', { allowDecimal: false })
    if (problem) {
      showToast(problem, 'error')
      return
    }
    const qty = Number(quantity)
    onAdd({
      pipeProductId: selectedProduct.id,
      label: `${formatQty(selectedProduct.diameter_inches)}" × ${formatQty(selectedProduct.weight_kg)}kg`,
      quantity: qty,
      weightKg: selectedProduct.weight_kg,
    })
    setSelectedProductId(null)
    setQuantity('')
  }

  return (
    <div className="space-y-4">
      <PipeProductPicker
        pipeProducts={pipeProducts}
        value={selectedProductId}
        onChange={setSelectedProductId}
        chipSelectedClass={style.chipSelected}
      />

      {selectedProduct && (
        <>
          <NumberStepper
            label="How Many? (pcs)"
            value={quantity}
            onChange={setQuantity}
            accentClass={`${style.text} ${style.textDark} bg-current/10 hover:bg-current/20`}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!quantity || Number(quantity) <= 0}
            className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-base font-bold text-white transition-opacity disabled:opacity-40 ${style.solid}`}
          >
            <Plus className="h-5 w-5" strokeWidth={3} />
            Add to List
          </button>
        </>
      )}

      {willOversell && selectedProduct && (
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
          Only {formatQty(piecesToKg(Math.max(availablePcs ?? 0, 0), selectedProduct.weight_kg))} kg in
          stock — this sale will take stock negative.
        </p>
      )}
    </div>
  )
}
