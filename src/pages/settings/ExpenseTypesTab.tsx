import { useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import {
  useExpenseCategories,
  useAddExpenseCategory,
  useSetExpenseCategoryActive,
  type ExpenseCategory,
} from '../../hooks/useExpenseCategories'
import { Modal } from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Field } from '../../components/Field'
import { useToast } from '../../lib/toast'
import { LoadingState } from '../../components/States'

export function ExpenseTypesTab() {
  const { data: categories, isLoading } = useExpenseCategories()
  const addCategory = useAddExpenseCategory()
  const setActive = useSetExpenseCategoryActive()
  const { showToast } = useToast()

  const [showInactive, setShowInactive] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<ExpenseCategory | null>(null)
  const [name, setName] = useState('')

  function handleAdd() {
    if (!name.trim()) {
      showToast('Enter an expense type name', 'error')
      return
    }
    addCategory.mutate(
      { name: name.trim() },
      {
        onSuccess: () => {
          showToast(`Added ${name.trim()}`)
          setAddOpen(false)
          setName('')
        },
        onError: (error: any) => {
          if (error?.code === '23505') {
            showToast('That expense type already exists', 'error')
            return
          }
          showToast('Could not add expense type', 'error')
        },
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

  function handleRestore(category: ExpenseCategory) {
    setActive.mutate(
      { id: category.id, is_active: true },
      {
        onSuccess: () => showToast('Restored'),
        onError: () => showToast('Could not restore', 'error'),
      },
    )
  }

  const visible = (categories ?? []).filter((c) => showInactive || c.is_active)

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
          No expense types yet. Tap "Add Type" to create one.
        </p>
      )}

      <ul className="space-y-2">
        {visible.map((c) => (
          <li
            key={c.id}
            className={`flex items-center justify-between gap-2 rounded-lg border px-4 py-3 ${
              c.is_active
                ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                : 'border-dashed border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50'
            }`}
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900 dark:text-slate-100">{c.name}</p>
              {c.is_salary && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Reported as Salaries in the expense report
                </p>
              )}
            </div>
            {c.is_active ? (
              <button
                type="button"
                aria-label={`Remove ${c.name}`}
                onClick={() => setRemoveTarget(c)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                aria-label={`Restore ${c.name}`}
                onClick={() => handleRestore(c)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-teal-50 hover:text-teal-600 dark:hover:bg-teal-950/50"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <Modal
        title="Add Expense Type"
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
            placeholder="e.g. Vehicle Maintenance"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={addCategory.isPending}
            className="min-h-[44px] w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {addCategory.isPending ? 'Adding…' : 'Add Type'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove expense type?"
        message={
          removeTarget
            ? `Remove "${removeTarget.name}" from the active list? Past expenses recorded under it are kept, and you can restore it later.`
            : ''
        }
        confirmLabel="Remove"
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  )
}
