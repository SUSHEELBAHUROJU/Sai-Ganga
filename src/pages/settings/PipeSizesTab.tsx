import { useMemo, useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import {
  usePipeProducts,
  useAddPipeProduct,
  useSetPipeProductActive,
  type PipeProduct,
} from '../../hooks/usePipeProducts'
import { Modal } from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Chip } from '../../components/Chip'
import { useToast } from '../../lib/toast'
import { formatQty } from '../../lib/format'
import { LoadingState } from '../../components/States'

const PRESET_DIAMETERS = [2, 3, 4, 5, 6]
const PRESET_WEIGHTS = [3, 5, 8, 10, 15, 20, 25, 30]

export function PipeSizesTab() {
  const { data: products, isLoading } = usePipeProducts()
  const addProduct = useAddPipeProduct()
  const setActive = useSetPipeProductActive()
  const { showToast } = useToast()

  const [showInactive, setShowInactive] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<PipeProduct | null>(null)

  const [diameter, setDiameter] = useState<number | null>(null)
  const [customDiameter, setCustomDiameter] = useState('')
  const [weight, setWeight] = useState<number | null>(null)
  const [customWeight, setCustomWeight] = useState('')

  const diameterOptions = useMemo(() => {
    const fromDb = (products ?? []).map((p) => p.diameter_inches)
    return Array.from(new Set([...PRESET_DIAMETERS, ...fromDb])).sort((a, b) => a - b)
  }, [products])

  const grouped = useMemo(() => {
    const list = (products ?? []).filter((p) => showInactive || p.is_active)
    const map = new Map<number, PipeProduct[]>()
    for (const p of list) {
      const arr = map.get(p.diameter_inches) ?? []
      arr.push(p)
      map.set(p.diameter_inches, arr)
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  }, [products, showInactive])

  function resetForm() {
    setDiameter(null)
    setCustomDiameter('')
    setWeight(null)
    setCustomWeight('')
  }

  function handleAdd() {
    const finalDiameter = customDiameter ? Number(customDiameter) : diameter
    const finalWeight = customWeight ? Number(customWeight) : weight
    if (!finalDiameter || finalDiameter <= 0 || !finalWeight || finalWeight <= 0) {
      showToast('Enter a valid diameter and weight', 'error')
      return
    }
    addProduct.mutate(
      { diameter_inches: finalDiameter, weight_kg: finalWeight },
      {
        onSuccess: () => {
          showToast(`Added ${formatQty(finalDiameter)}" × ${formatQty(finalWeight)}kg`)
          setAddOpen(false)
          resetForm()
        },
        onError: () => showToast('Could not add product', 'error'),
      },
    )
  }

  function handleRemove() {
    if (!removeTarget) return
    setActive.mutate(
      { id: removeTarget.id, is_active: false },
      {
        onSuccess: () => {
          showToast('Removed from active list')
          setRemoveTarget(null)
        },
        onError: () => showToast('Could not remove', 'error'),
      },
    )
  }

  function handleRestore(product: PipeProduct) {
    setActive.mutate(
      { id: product.id, is_active: true },
      {
        onSuccess: () => showToast('Restored'),
        onError: () => showToast('Could not restore', 'error'),
      },
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300"
          />
          Show removed sizes
        </label>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          Add Size
        </button>
      </div>

      {isLoading && <LoadingState />}

      {!isLoading && grouped.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No pipe sizes yet. Tap "Add Size" to create one.
        </p>
      )}

      <div className="space-y-5">
        {grouped.map(([diameterInches, items]) => (
          <div key={diameterInches}>
            <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
              {formatQty(diameterInches)}" diameter
            </h3>
            <div className="flex flex-wrap gap-2">
              {items
                .sort((a, b) => a.weight_kg - b.weight_kg)
                .map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-sm ${
                      p.is_active
                        ? 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                        : 'border-dashed border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800'
                    }`}
                  >
                    {formatQty(p.weight_kg)}kg
                    {/* Padded to a ~36px hit area — these are destructive and
                        were previously a 14px icon, far too small to tap. */}
                    {p.is_active ? (
                      <button
                        type="button"
                        aria-label={`Remove ${formatQty(diameterInches)}" × ${formatQty(p.weight_kg)}kg`}
                        onClick={() => setRemoveTarget(p)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Restore ${formatQty(diameterInches)}" × ${formatQty(p.weight_kg)}kg`}
                        onClick={() => handleRestore(p)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-teal-50 hover:text-teal-600 dark:hover:bg-teal-950/50"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      <Modal
        title="Add Pipe Size"
        open={addOpen}
        onClose={() => {
          setAddOpen(false)
          resetForm()
        }}
      >
        <div className="space-y-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Diameter (inches)
            </span>
            <div className="flex flex-wrap gap-2">
              {diameterOptions.map((d) => (
                <Chip
                  key={d}
                  label={`${formatQty(d)}"`}
                  selected={diameter === d && !customDiameter}
                  onClick={() => {
                    setDiameter(d)
                    setCustomDiameter('')
                  }}
                />
              ))}
            </div>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              placeholder="Custom diameter"
              value={customDiameter}
              onChange={(e) => {
                setCustomDiameter(e.target.value)
                setDiameter(null)
              }}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Weight (kg)
            </span>
            <div className="flex flex-wrap gap-2">
              {PRESET_WEIGHTS.map((w) => (
                <Chip
                  key={w}
                  label={`${w}kg`}
                  selected={weight === w && !customWeight}
                  onClick={() => {
                    setWeight(w)
                    setCustomWeight('')
                  }}
                />
              ))}
            </div>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              placeholder="Custom weight"
              value={customWeight}
              onChange={(e) => {
                setCustomWeight(e.target.value)
                setWeight(null)
              }}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={addProduct.isPending}
            className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {addProduct.isPending ? 'Adding…' : 'Add Product'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove pipe size?"
        message={
          removeTarget
            ? `Remove ${formatQty(removeTarget.diameter_inches)}" × ${formatQty(removeTarget.weight_kg)}kg from the active list? Past records referencing it are kept, and you can restore it later.`
            : ''
        }
        confirmLabel="Remove"
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  )
}
