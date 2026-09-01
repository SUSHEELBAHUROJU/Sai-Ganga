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

export function useAddExpenseCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string }) => {
      const { data, error } = await supabase
        .from('expense_categories')
        .insert({ name: input.name })
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
