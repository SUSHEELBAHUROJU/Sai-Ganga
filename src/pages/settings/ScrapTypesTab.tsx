import { useState } from 'react'
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import {
  useScrapTypes,
  useAddScrapType,
  useSetScrapTypeActive,
  useSetScrapTypeLoss,
  type ScrapType,
} from '../../hooks/useScrapTypes'
import { Modal } from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Field } from '../../components/Field'
import { useToast } from '../../lib/toast'
import { LoadingState } from '../../components/States'

export function ScrapTypesTab() {
  const { data: types, isLoading } = useScrapTypes()
  const addType = useAddScrapType()
  const setActive = useSetScrapTypeActive()
  const setLoss = useSetScrapTypeLoss()
  const { showToast } = useToast()

  const [showInactive, setShowInactive] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<ScrapType | null>(null)
  const [name, setName] = useState('')
  const [lossTarget, setLossTarget] = useState<ScrapType | null>(null)
  const [lossInput, setLossInput] = useState('')

  function handleAdd() {
    if (!name.trim()) {
      showToast('Enter a scrap type name', 'error')
      return
    }
    addType.mutate(
      { name: name.trim() },
      {
        onSuccess: () => {
          showToast(`Added ${name.trim()}`)
          setAddOpen(false)
          setName('')
        },
        onError: () => showToast('Could not add scrap type', 'error'),
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

  function handleRestore(type: ScrapType) {
    setActive.mutate(
      { id: type.id, is_active: true },
      {
        onSuccess: () => showToast('Restored'),
        onError: () => showToast('Could not restore', 'error'),
      },
    )
  }

  function openLoss(type: ScrapType) {
    setLossTarget(type)
    setLossInput(String(Number(type.loss_pct)))
  }

  function handleSaveLoss() {
    if (!lossTarget) return
    const loss = Number(lossInput)
    if (lossInput.trim() === '' || !Number.isFinite(loss) || loss < 0 || loss >= 100) {
      showToast('Enter a loss between 0 and 99%', 'error')
      return
    }
    setLoss.mutate(
      { id: lossTarget.id, loss_pct: loss },
      {
        onSuccess: () => {
          showToast(`${lossTarget.name}: ${loss}% loss saved`)
          setLossTarget(null)
        },
        onError: () => showToast('Could not save loss', 'error'),
      },
    )
  }

  const visible = (types ?? []).filter((t) => showInactive || t.is_active)

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
          No scrap types yet. Tap "Add Type" to create one.
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
            <div className="min-w-0">
              <p className="font-medium text-slate-900 dark:text-slate-100">{t.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {Number(t.loss_pct)}% lost in recycling
              </p>
            </div>
            {t.is_active ? (
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  aria-label={`Edit recycling loss for ${t.name}`}
                  onClick={() => openLoss(t)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-teal-50 hover:text-teal-600 dark:hover:bg-teal-950/50"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${t.name}`}
                  onClick={() => setRemoveTarget(t)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-label={`Restore ${t.name}`}
                onClick={() => handleRestore(t)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-teal-50 hover:text-teal-600 dark:hover:bg-teal-950/50"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <Modal
        title="Add Scrap Type"
        open={addOpen}
        onClose={() => {
          setAddOpen(false)
          setName('')
        }}
      >
        <div className="space-y-4">
          <Field
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Old LDPE Pipe"
          />
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

      <Modal title={lossTarget ? `Recycling loss — ${lossTarget.name}` : ''} open={lossTarget !== null} onClose={() => setLossTarget(null)}>
        <div className="space-y-4">
          <Field
            label="Loss %"
            type="number"
            inputMode="decimal"
            min={0}
            max={99}
            step="0.5"
            value={lossInput}
            onChange={(e) => setLossInput(e.target.value)}
          />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {(() => {
              const loss = Number(lossInput)
              return lossInput.trim() !== '' && loss >= 0 && loss < 100
                ? `100 kg of scrap gives ${Math.round((100 - loss) * 100) / 100} kg of granules. Granules are priced at the scrap rate ÷ ${Math.round((100 - loss) * 100) / 100}%, so the stock check cost includes the loss.`
                : 'Share of the scrap weight lost when it is recycled into granules.'
            })()}
          </p>
          <button
            type="button"
            onClick={handleSaveLoss}
            disabled={setLoss.isPending}
            className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {setLoss.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove scrap type?"
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
