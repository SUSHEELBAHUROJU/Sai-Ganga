import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type PipeProduct = Database['public']['Tables']['pipe_products']['Row']

const QUERY_KEY = ['pipe_products']

export function usePipeProducts() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipe_products')
        .select('*')
        .order('diameter_inches', { ascending: true })
        .order('weight_kg', { ascending: true })
      if (error) throw error
      return data as PipeProduct[]
    },
  })
}

export function useAddPipeProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { diameter_inches: number; weight_kg: number }) => {
      const { data, error } = await supabase
        .from('pipe_products')
        .upsert(
          { diameter_inches: input.diameter_inches, weight_kg: input.weight_kg, is_active: true },
          { onConflict: 'diameter_inches,weight_kg' },
        )
        .select()
        .single()
      if (error) throw error
      return data as PipeProduct
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useSetPipeProductActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('pipe_products')
        .update({ is_active: input.is_active })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}
