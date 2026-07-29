import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type ItemType = 'pipe_product' | 'raw_material' | 'scrap'
export type OpeningBalance = Database['public']['Tables']['opening_balances']['Row']
export type LowStockThreshold = Database['public']['Tables']['low_stock_thresholds']['Row']

const OPENING_BALANCES_KEY = ['opening_balances']
const LOW_STOCK_THRESHOLDS_KEY = ['low_stock_thresholds']

const STOCK_VIEW_KEY: Record<ItemType, string[]> = {
  pipe_product: ['finished_goods_stock'],
  raw_material: ['raw_material_stock'],
  scrap: ['scrap_stock'],
}

export function useOpeningBalances() {
  return useQuery({
    queryKey: OPENING_BALANCES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('opening_balances').select('*')
      if (error) throw error
      return data as OpeningBalance[]
    },
  })
}

export function useLowStockThresholds() {
  return useQuery({
    queryKey: LOW_STOCK_THRESHOLDS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('low_stock_thresholds').select('*')
      if (error) throw error
      return data as LowStockThreshold[]
    },
  })
}

export function useUpsertOpeningBalance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      item_type: ItemType
      item_id: string
      quantity: number
      unit: 'pcs' | 'kg'
    }) => {
      const { error } = await supabase
        .from('opening_balances')
        .upsert(input, { onConflict: 'item_type,item_id' })
      if (error) throw error
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: OPENING_BALANCES_KEY })
      queryClient.invalidateQueries({ queryKey: STOCK_VIEW_KEY[input.item_type] })
    },
  })
}

export function useUpsertLowStockThreshold() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { item_type: ItemType; item_id: string; min_quantity: number }) => {
      const { error } = await supabase
        .from('low_stock_thresholds')
        .upsert(input, { onConflict: 'item_type,item_id' })
      if (error) throw error
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: LOW_STOCK_THRESHOLDS_KEY })
      queryClient.invalidateQueries({ queryKey: STOCK_VIEW_KEY[input.item_type] })
    },
  })
}

export function useDeleteLowStockThreshold() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { item_type: ItemType; item_id: string }) => {
      const { error } = await supabase
        .from('low_stock_thresholds')
        .delete()
        .eq('item_type', input.item_type)
        .eq('item_id', input.item_id)
      if (error) throw error
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: LOW_STOCK_THRESHOLDS_KEY })
      queryClient.invalidateQueries({ queryKey: STOCK_VIEW_KEY[input.item_type] })
    },
  })
}

export function useDeleteOpeningBalance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { item_type: ItemType; item_id: string }) => {
      const { error } = await supabase
        .from('opening_balances')
        .delete()
        .eq('item_type', input.item_type)
        .eq('item_id', input.item_id)
      if (error) throw error
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: OPENING_BALANCES_KEY })
      queryClient.invalidateQueries({ queryKey: STOCK_VIEW_KEY[input.item_type] })
    },
  })
}
