import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type NewExpense = {
  /** The day it was paid. */
  entry_date: string
  category_id: string
  amount: number
  notes: string | null
  /** The days it pays for — the paid date for a one-time expense. */
  period_start: string
  period_end: string
  /** Meter units, for types that track them (electricity). */
  units: number | null
}

/**
 * Adding only — editing and deleting an expense go through the shared
 * Records machinery (useRecordMutations), same as every other entry kind,
 * so there's one edit/delete path rather than a parallel one per feature.
 */
export function useAddExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewExpense) => {
      const { error } = await supabase.from('expenses').insert(input)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['records'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['stock_check_report'] })
    },
  })
}

export type ExpenseWithCategory = {
  id: string
  entry_date: string
  period_start: string
  period_end: string
  amount: number
  notes: string | null
  category_name: string
  is_salary: boolean
}

/** Expenses in a date range, newest first — used by the "recent" list on the
 *  Expenses screen. The report has its own hook that also pulls purchases. */
export function useExpensesInRange(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['expenses', fromDate, toDate],
    queryFn: async (): Promise<ExpenseWithCategory[]> => {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, entry_date, period_start, period_end, amount, notes, expense_categories(name, is_salary)')
        .gte('entry_date', fromDate)
        .lte('entry_date', toDate)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error

      return (data ?? []).map((row: any) => ({
        id: row.id,
        entry_date: row.entry_date,
        period_start: row.period_start,
        period_end: row.period_end,
        amount: Number(row.amount) || 0,
        notes: row.notes,
        category_name: row.expense_categories?.name ?? 'Uncategorised',
        is_salary: Boolean(row.expense_categories?.is_salary),
      }))
    },
  })
}

/** Expenses of one type saved for exactly this period — used to warn about a
 *  second bill or rent entry for the same month. */
export function useExpensesForPeriod(categoryId: string | null, periodStart: string | null, periodEnd: string | null) {
  return useQuery({
    queryKey: ['expenses', 'period', categoryId, periodStart, periodEnd],
    enabled: Boolean(categoryId && periodStart && periodEnd),
    queryFn: async (): Promise<{ id: string; amount: number }[]> => {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, amount')
        .eq('category_id', categoryId!)
        .eq('period_start', periodStart!)
        .eq('period_end', periodEnd!)
      if (error) throw error
      return (data ?? []).map((row) => ({ id: row.id, amount: Number(row.amount) || 0 }))
    },
  })
}
