import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { MASTER_DATA_STALE_TIME } from '../lib/queryClient'
import type { Database } from '../types/database'

export type Customer = Database['public']['Tables']['customers']['Row']
export type CustomerInput = { name: string; address: string | null; phone: string | null }

const QUERY_KEY = ['customers']

export function useCustomers() {
  return useQuery({
    queryKey: QUERY_KEY,
    staleTime: MASTER_DATA_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data as Customer[]
    },
  })
}

export function useAddCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CustomerInput) => {
      const { data, error } = await supabase.from('customers').insert(input).select().single()
      if (error) throw error
      return data as Customer
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CustomerInput & { id: string }) => {
      const { id, ...rest } = input
      const { error } = await supabase.from('customers').update(rest).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useSetCustomerActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('customers')
        .update({ is_active: input.is_active })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}
