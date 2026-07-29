import { useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import {
  useRawMaterialTypes,
  useAddRawMaterialType,
  useSetRawMaterialTypeActive,
  type RawMaterialType,
} from '../../hooks/useRawMaterialTypes'
import { Modal } from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Chip } from '../../components/Chip'
import { Field } from '../../components/Field'
import { useToast } from '../../lib/toast'
import { LoadingState } from '../../components/States'

type PackMode = '25' | '50' | 'custom' | 'direct'

function packLabel(defaultPackKg: number | null): string {
  if (defaultPackKg === null) return 'Direct total'
  if (defaultPackKg === 25) return '25kg bags'
  if (defaultPackKg === 50) return '50kg bags'
  return `${defaultPackKg}kg bags`
}

export function RawMaterialsTab() {
  const { data: types, isLoading } = useRawMaterialTypes()
  const addType = useAddRawMaterialType()
  const setActive = useSetRawMaterialTypeActive()
  const { showToast } = useToast()

  const [showInactive, setShowInactive] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<RawMaterialType | null>(null)

  const [name, setName] = useState('')
  const [packMode, setPackMode] = useState<PackMode>('25')
  const [customPack, setCustomPack] = useState('')

  function resetForm() {
    setName('')
    setPackMode('25')
    setCustomPack('')
  }

  function handleAdd() {
    if (!name.trim()) {
      showToast('Enter a material name', 'error')
      return
    }
    let defaultPackKg: number | null
    if (packMode === '25') defaultPackKg = 25
    else if (packMode === '50') defaultPackKg = 50
    else if (packMode === 'direct') defaultPackKg = null
    else {
      const n = Number(customPack)
      if (!n || n <= 0) {
        showToast('Enter a valid custom pack size', 'error')
        return
      }
      defaultPackKg = n
    }

    addType.mutate(
      { name: name.trim(), default_pack_kg: defaultPackKg },
      {
        onSuccess: () => {
          showToast(`Added ${name.trim()}`)
          setAddOpen(false)
          resetForm()
        },
        onError: () => showToast('Could not add material type', 'error'),
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

  function handleRestore(type: RawMaterialType) {
    setActive.mutate(
      { id: type.id, is_active: true },
      {
        onSuccess: () => showToast('Restored'),
        onError: () => showToast('Could not restore', 'error'),
      },
    )
  }

  const visible = (types ?? []).filter((t) => showInactive || t.is_active)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Show removed types
        </label>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          Add Type
        </button>
      </div>

      {isLoading && <LoadingState />}

      {!isLoading && visible.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No raw material types yet. Tap "Add Type" to create one.
        </p>
      )}

      <ul className="space-y-2">
        {visible.map((t) => (
          <li
            key={t.id}
            className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
              t.is_active
                ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                : 'border-dashed border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50'
            }`}
          >
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">{t.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {packLabel(t.default_pack_kg)}
              </p>
            </div>
            {t.is_active ? (
              <button
                type="button"
                aria-label={`Remove ${t.name}`}
                onClick={() => setRemoveTarget(t)}
                className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                aria-label={`Restore ${t.name}`}
                onClick={() => handleRestore(t)}
                className="rounded-full p-2 text-slate-400 hover:bg-teal-50 hover:text-teal-600 dark:hover:bg-teal-950/50"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <Modal
        title="Add Raw Material Type"
        open={addOpen}
        onClose={() => {
          setAddOpen(false)
          resetForm()
        }}
      >
        <div className="space-y-4">
          <Field
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Virgin"
          />

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Default purchase unit
            </span>
            <div className="flex flex-wrap gap-2">
              <Chip label="25kg bags" selected={packMode === '25'} onClick={() => setPackMode('25')} />
              <Chip label="50kg bags" selected={packMode === '50'} onClick={() => setPackMode('50')} />
              <Chip
                label="Custom bag size"
                selected={packMode === 'custom'}
                onClick={() => setPackMode('custom')}
              />
              <Chip
                label="Direct total (kg)"
                selected={packMode === 'direct'}
                onClick={() => setPackMode('direct')}
              />
            </div>
            {packMode === 'custom' && (
              <input
                type="number"
                min="0"
                inputMode="decimal"
                placeholder="Bag size in kg"
                value={customPack}
                onChange={(e) => setCustomPack(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800"
              />
            )}
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={addType.isPending}
            className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {addType.isPending ? 'Adding…' : 'Add Type'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove material type?"
        message={
          removeTarget
            ? `Remove "${removeTarget.name}" from the active list? Past records referencing it are kept, and you can restore it later.`
            : ''
        }
        confirmLabel="Remove"
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  )
}
