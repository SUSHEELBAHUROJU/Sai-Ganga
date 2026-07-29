import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type ScrapDealer = Database['public']['Tables']['scrap_dealers']['Row']
export type ScrapDealerInput = { name: string; address: string | null; phone: string | null }

const QUERY_KEY = ['scrap_dealers']

export function useScrapDealers() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scrap_dealers')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data as ScrapDealer[]
    },
  })
}

export function useAddScrapDealer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ScrapDealerInput) => {
      const { data, error } = await supabase.from('scrap_dealers').insert(input).select().single()
      if (error) throw error
      return data as ScrapDealer
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useUpdateScrapDealer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ScrapDealerInput & { id: string }) => {
      const { id, ...rest } = input
      const { error } = await supabase.from('scrap_dealers').update(rest).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useSetScrapDealerActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('scrap_dealers')
        .update({ is_active: input.is_active })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}
