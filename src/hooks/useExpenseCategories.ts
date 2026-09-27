import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { MASTER_DATA_STALE_TIME } from '../lib/queryClient'
import type { Database } from '../types/database'

/**
 * Expense categories are user-extensible: the three seeded ones (Salaries,
 * Electricity Bill, Miscellaneous) are just rows, and any number of custom
 * categories can be added. Same remove/restore convention as scrap_types.
 */
export type ExpenseCategory = Database['public']['Tables']['expense_categories']['Row']

const QUERY_KEY = ['expense_categories']

export function useExpenseCategories() {
  return useQuery({
    queryKey: QUERY_KEY,
    staleTime: MASTER_DATA_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data as ExpenseCategory[]
    },
  })
}

/** How a type asks for its period, whether it's part of production cost, and whether it records meter units. */
export type ExpenseCategorySettings = {
  period_type: 'one_time' | 'date_range' | 'month'
  in_production_cost: boolean
  tracks_units: boolean
}

export function useAddExpenseCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string } & Partial<ExpenseCategorySettings>) => {
      const { data, error } = await supabase
        .from('expense_categories')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as ExpenseCategory
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useSetExpenseCategoryActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('expense_categories')
        .update({ is_active: input.is_active })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useUpdateExpenseCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string } & ExpenseCategorySettings) => {
      const { id, ...settings } = input
      const { error } = await supabase.from('expense_categories').update(settings).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      // Running costs in the stock check depend on which types count.
      queryClient.invalidateQueries({ queryKey: ['stock_check_report'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
