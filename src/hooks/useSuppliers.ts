import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { MASTER_DATA_STALE_TIME } from '../lib/queryClient'
import type { Database } from '../types/database'

/** Raw-material suppliers — the same structured-entity pattern as
 *  scrap_dealers, so a raw-material purchase carries a real supplier the
 *  same conceptual way a Sale carries a real customer. */
export type Supplier = Database['public']['Tables']['raw_material_suppliers']['Row']
export type SupplierInput = { name: string; address: string | null; phone: string | null }

const QUERY_KEY = ['suppliers']

export function useSuppliers() {
  return useQuery({
    queryKey: QUERY_KEY,
    staleTime: MASTER_DATA_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raw_material_suppliers')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data as Supplier[]
    },
  })
}

export function useAddSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SupplierInput) => {
      const { data, error } = await supabase
        .from('raw_material_suppliers')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as Supplier
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SupplierInput & { id: string }) => {
      const { id, ...rest } = input
      const { error } = await supabase.from('raw_material_suppliers').update(rest).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useSetSupplierActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('raw_material_suppliers')
        .update({ is_active: input.is_active })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}
