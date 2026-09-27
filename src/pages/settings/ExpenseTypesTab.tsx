import { useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import {
  useExpenseCategories,
  useAddExpenseCategory,
  useSetExpenseCategoryActive,
  useUpdateExpenseCategory,
  type ExpenseCategory,
  type ExpenseCategorySettings,
} from '../../hooks/useExpenseCategories'
import { Chip } from '../../components/Chip'
import { Modal } from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Field } from '../../components/Field'
import { useToast } from '../../lib/toast'
import { LoadingState } from '../../components/States'

const PERIOD_OPTIONS: { value: ExpenseCategorySettings['period_type']; label: string; hint: string }[] = [
  { value: 'one_time', label: 'One-time', hint: 'Counts on the day it was paid (misc, diesel, repairs)' },
  { value: 'date_range', label: 'Start–End Dates', hint: 'Asks the dates it covers (weekly salary)' },
  { value: 'month', label: 'Month', hint: 'Asks which month it is for (monthly salary, rent, electricity)' },
]

const DEFAULT_SETTINGS: ExpenseCategorySettings = {
  period_type: 'one_time',
  in_production_cost: true,
  tracks_units: false,
}

function settingsSummary(c: ExpenseCategory): string {
  const period = PERIOD_OPTIONS.find((o) => o.value === c.period_type)?.label ?? 'One-time'
  return [
    period,
    c.in_production_cost ? 'in cost/kg' : 'not in cost/kg',
    c.tracks_units ? 'records units' : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Period style, production-cost switch and units — shared by the Add and Edit dialogs. */
function SettingsFields({
  value,
  onChange,
}: {
  value: ExpenseCategorySettings
  onChange: (next: ExpenseCategorySettings) => void
}) {
  const hint = PERIOD_OPTIONS.find((o) => o.value === value.period_type)?.hint
  return (
    <div className="space-y-4">
      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">What is it for?</span>
        <div className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              selected={value.period_type === o.value}
              onClick={() => onChange({ ...value, period_type: o.value })}
            />
          ))}
        </div>
        {hint && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
      <label className="flex min-h-[44px] items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={value.in_production_cost}
          onChange={(e) => onChange({ ...value, in_production_cost: e.target.checked })}
          className="h-5 w-5 rounded border-slate-300"
        />
        Count in production cost (₹ per kg of pipe)
      </label>
      <label className="flex min-h-[44px] items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={value.tracks_units}
          onChange={(e) => onChange({ ...value, tracks_units: e.target.checked })}
          className="h-5 w-5 rounded border-slate-300"
        />
        Record units consumed (electricity meter)
      </label>
    </div>
  )
}

export function ExpenseTypesTab() {
  const { data: categories, isLoading } = useExpenseCategories()
  const addCategory = useAddExpenseCategory()
  const setActive = useSetExpenseCategoryActive()
  const updateCategory = useUpdateExpenseCategory()
  const { showToast } = useToast()
  const [newSettings, setNewSettings] = useState<ExpenseCategorySettings>(DEFAULT_SETTINGS)
  const [editing, setEditing] = useState<ExpenseCategory | null>(null)
  const [editSettings, setEditSettings] = useState<ExpenseCategorySettings>(DEFAULT_SETTINGS)

  function openEdit(c: ExpenseCategory) {
    setEditing(c)
    setEditSettings({
      period_type: c.period_type as ExpenseCategorySettings['period_type'],
      in_production_cost: c.in_production_cost,
      tracks_units: c.tracks_units,
    })
  }

  function handleSaveSettings() {
    if (!editing) return
    updateCategory.mutate(
      { id: editing.id, ...editSettings },
      {
        onSuccess: () => {
          showToast(`${editing.name} updated`)
          setEditing(null)
        },
        onError: () => showToast('Could not update expense type', 'error'),
      },
    )
  }

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
      { name: name.trim(), ...newSettings },
      {
        onSuccess: () => {
          showToast(`Added ${name.trim()}`)
          setAddOpen(false)
          setName('')
          setNewSettings(DEFAULT_SETTINGS)
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
            <button
              type="button"
              onClick={() => openEdit(c)}
              className="min-h-[44px] min-w-0 flex-1 text-left"
            >
              <p className="truncate font-medium text-slate-900 dark:text-slate-100">{c.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{settingsSummary(c)}</p>
              {c.is_salary && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Reported as Salaries in the expense report
                </p>
              )}
            </button>
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
          <SettingsFields value={newSettings} onChange={setNewSettings} />
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

      <Modal title={editing ? `Edit ${editing.name}` : ''} open={editing !== null} onClose={() => setEditing(null)}>
        <div className="space-y-4">
          <SettingsFields value={editSettings} onChange={setEditSettings} />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Changing "What is it for?" only affects new entries — saved expenses keep their period.
          </p>
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={updateCategory.isPending}
            className="min-h-[44px] w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {updateCategory.isPending ? 'Saving…' : 'Save'}
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
