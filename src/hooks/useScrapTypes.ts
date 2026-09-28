import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { MASTER_DATA_STALE_TIME } from '../lib/queryClient'
import type { Database } from '../types/database'

export type ScrapType = Database['public']['Tables']['scrap_types']['Row']

const QUERY_KEY = ['scrap_types']

export function useScrapTypes() {
  return useQuery({
    queryKey: QUERY_KEY,
    staleTime: MASTER_DATA_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scrap_types')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data as ScrapType[]
    },
  })
}

export function useAddScrapType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string }) => {
      const { data, error } = await supabase
        .from('scrap_types')
        .insert({ name: input.name })
        .select()
        .single()
      if (error) throw error
      return data as ScrapType
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useSetScrapTypeActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('scrap_types')
        .update({ is_active: input.is_active })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

/** Percent of scrap weight lost in recycling — prices granules in the stock check report. */
export function useSetScrapTypeLoss() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; loss_pct: number }) => {
      const { error } = await supabase.from('scrap_types').update({ loss_pct: input.loss_pct }).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['stock_check_report'] })
      queryClient.invalidateQueries({ queryKey: ['reports', 'production_cost'] })
    },
  })
}
