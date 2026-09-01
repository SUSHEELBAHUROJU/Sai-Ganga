import { useMemo, useState } from 'react'
import { Plus, Wallet } from 'lucide-react'
import { DateField } from '../components/DateField'
import { Chip } from '../components/Chip'
import { Field } from '../components/Field'
import { Modal } from '../components/Modal'
import { StickyActionBar } from '../components/StickyActionBar'
import { LoadingState, EmptyNote } from '../components/States'
import {
  useExpenseCategories,
  useAddExpenseCategory,
} from '../hooks/useExpenseCategories'
import { useAddExpense, useExpensesInRange } from '../hooks/useExpenses'
import { useToast } from '../lib/toast'
import { firstError, validateCost, validateRequiredText } from '../lib/validate'
import { todayISODate, startOfMonth, formatDateLabel } from '../lib/date'
import { formatQty } from '../lib/format'

const EXPENSE_CHIP_SELECTED = 'border-rose-600 bg-rose-600 text-white'

export function ExpensesPage() {
  const { data: categories, isLoading: loadingCategories } = useExpenseCategories()
  const addExpense = useAddExpense()
  const addCategory = useAddExpenseCategory()
  const { showToast } = useToast()

  const [entryDate, setEntryDate] = useState(todayISODate())
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')

  const [addTypeOpen, setAddTypeOpen] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')

  // "This month so far" — the same at-a-glance confirmation the production
  // and purchase screens give after saving.
  const monthStart = startOfMonth()
  const today = todayISODate()
  const { data: monthExpenses, isLoading: loadingMonth } = useExpensesInRange(monthStart, today)

  const activeCategories = useMemo(
    () => (categories ?? []).filter((c) => c.is_active),
    [categories],
  )

  const monthTotal = (monthExpenses ?? []).reduce((sum, e) => sum + e.amount, 0)

  function handleSave() {
    const problem = firstError(
      categoryId ? null : 'Choose an expense type',
      validateCost(amount, 'an amount'),
    )
    if (problem) {
      showToast(problem, 'error')
      return
    }

    addExpense.mutate(
      {
        entry_date: entryDate,
        category_id: categoryId,
        amount: Number(amount),
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          showToast('Expense Added!')
          setAmount('')
          setNotes('')
        },
        onError: () => showToast('Could not save expense', 'error'),
      },
    )
  }

  function handleAddCategory() {
    const problem = validateRequiredText(newTypeName, 'expense type name')
    if (problem) {
      showToast(problem, 'error')
      return
    }
    addCategory.mutate(
      { name: newTypeName.trim() },
      {
        onSuccess: (created) => {
          showToast(`${created.name} added`)
          setCategoryId(created.id)
          setNewTypeName('')
          setAddTypeOpen(false)
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

  return (
    <div className="space-y-6 pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Add an Expense</h2>
        <DateField value={entryDate} onChange={setEntryDate} />
      </div>

      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Expense Type
          </span>
          {loadingCategories ? (
            <LoadingState />
          ) : (
            <div className="flex flex-wrap gap-2">
              {activeCategories.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  selected={categoryId === c.id}
                  selectedClass={EXPENSE_CHIP_SELECTED}
                  onClick={() => setCategoryId(c.id)}
                />
              ))}
              <button
                type="button"
                onClick={() => setAddTypeOpen(true)}
                className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-dashed border-rose-500 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                <Plus className="h-4 w-4" />
                Add Expense Type
              </button>
            </div>
          )}
        </div>

        <Field
          label="Amount (₹)"
          type="number"
          min="0"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
        />

        <Field
          label="Description (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. August wages, meter reading 4213"
        />
      </div>

      <StickyActionBar>
        <button
          type="button"
          onClick={handleSave}
          disabled={addExpense.isPending}
          className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 py-3.5 text-base font-bold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
        >
          <Wallet className="h-[18px] w-[18px]" strokeWidth={2.5} />
          {addExpense.isPending ? 'Saving…' : 'Save Expense'}
        </button>
      </StickyActionBar>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            This month so far
          </h3>
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
            ₹{formatQty(monthTotal)}
          </span>
        </div>

        {loadingMonth && <LoadingState />}
        {!loadingMonth && (monthExpenses ?? []).length === 0 && (
          <EmptyNote>No expenses recorded this month yet.</EmptyNote>
        )}

        <div className="space-y-1">
          {(monthExpenses ?? []).slice(0, 10).map((e) => (
            <div
              key={e.id}
              className="flex items-baseline justify-between gap-3 border-t border-slate-100 py-2 first:border-t-0 dark:border-slate-800"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                  {e.category_name}
                </p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {formatDateLabel(e.entry_date)}
                  {e.notes ? ` · ${e.notes}` : ''}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                ₹{formatQty(e.amount)}
              </span>
            </div>
          ))}
        </div>

        {(monthExpenses ?? []).length > 10 && (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Showing the 10 most recent — see Records for the full list.
          </p>
        )}
      </div>

      <Modal
        title="Add Expense Type"
        open={addTypeOpen}
        onClose={() => {
          setAddTypeOpen(false)
          setNewTypeName('')
        }}
      >
        <div className="space-y-4">
          <Field
            label="Name"
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            placeholder="e.g. Vehicle Maintenance"
          />
          <button
            type="button"
            onClick={handleAddCategory}
            disabled={addCategory.isPending}
            className="min-h-[44px] w-full rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {addCategory.isPending ? 'Adding…' : 'Add & Select'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
