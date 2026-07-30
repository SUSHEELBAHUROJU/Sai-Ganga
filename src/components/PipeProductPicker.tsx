import { useMemo, useState } from 'react'
import type { PipeProduct } from '../hooks/usePipeProducts'
import { Chip } from './Chip'
import { formatQty } from '../lib/format'

type PipeProductPickerProps = {
  pipeProducts: PipeProduct[]
  value: string | null
  onChange: (pipeProductId: string) => void
  /** Selected-chip color — tint to the screen's action color. */
  chipSelectedClass?: string
  /** Array of pipe product IDs that are already added in the staged list */
  disabledProductIds?: string[]
}

/**
 * Two-step diameter → weight chip picker for a single pipe product.
 * Inactive products are hidden, except one that's already selected — editing a
 * past entry must not silently drop a size that has since been removed.
 */
export function PipeProductPicker({
  pipeProducts,
  value,
  onChange,
  chipSelectedClass,
  disabledProductIds = [],
}: PipeProductPickerProps) {
  const selectableProducts = useMemo(
    () => pipeProducts.filter((p) => p.is_active || p.id === value),
    [pipeProducts, value],
  )

  const diameters = useMemo(
    () => Array.from(new Set(selectableProducts.map((p) => p.diameter_inches))).sort((a, b) => a - b),
    [selectableProducts],
  )

  const selectedProduct = selectableProducts.find((p) => p.id === value) ?? null

  const [diameterOverride, setDiameterOverride] = useState<number | null>(null)
  const diameter = diameterOverride ?? selectedProduct?.diameter_inches ?? null
  const setDiameter = setDiameterOverride

  const weightsForDiameter = useMemo(() => {
    if (diameter === null) return []
    return selectableProducts
      .filter((p) => p.diameter_inches === diameter)
      .sort((a, b) => a.weight_kg - b.weight_kg)
  }, [selectableProducts, diameter])

  if (diameters.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No active pipe sizes. Add some in Settings → Pipe Sizes first.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-400">
          How Wide? (inches)
        </span>
        <div className="flex flex-wrap gap-2">
          {diameters.map((d) => (
            <Chip
              key={d}
              label={`${formatQty(d)}"`}
              selected={diameter === d}
              selectedClass={chipSelectedClass}
              onClick={() => setDiameter(d)}
            />
          ))}
        </div>
      </div>

      {diameter !== null && (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-400">
            How Heavy? (kg)
          </span>
          <div className="flex flex-wrap gap-2">
            {weightsForDiameter.map((p) => {
              const isAdded = disabledProductIds.includes(p.id)
              return (
                <Chip
                  key={p.id}
                  label={`${formatQty(p.weight_kg)}kg${isAdded ? ' (Added)' : ''}`}
                  selected={value === p.id}
                  disabled={isAdded}
                  selectedClass={chipSelectedClass}
                  onClick={() => onChange(p.id)}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
