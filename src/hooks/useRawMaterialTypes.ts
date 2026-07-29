import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type RawMaterialType = Database['public']['Tables']['raw_material_types']['Row']

const QUERY_KEY = ['raw_material_types']

export function useRawMaterialTypes() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raw_material_types')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data as RawMaterialType[]
    },
  })
}

export function useAddRawMaterialType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; default_pack_kg: number | null }) => {
      const { data, error } = await supabase
        .from('raw_material_types')
        .insert({ name: input.name, default_pack_kg: input.default_pack_kg })
        .select()
        .single()
      if (error) throw error
      return data as RawMaterialType
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useSetRawMaterialTypeActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('raw_material_types')
        .update({ is_active: input.is_active })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}
