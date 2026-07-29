import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type FinishedGoodsStock = Database['public']['Views']['finished_goods_stock']['Row']
export type RawMaterialStock = Database['public']['Views']['raw_material_stock']['Row']
export type ScrapStock = Database['public']['Views']['scrap_stock']['Row']

export function useFinishedGoodsStock() {
  return useQuery({
    queryKey: ['finished_goods_stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finished_goods_stock')
        .select('*')
        .order('diameter_inches', { ascending: true })
        .order('weight_kg', { ascending: true })
      if (error) throw error
      return data as FinishedGoodsStock[]
    },
  })
}

export function useRawMaterialStock() {
  return useQuery({
    queryKey: ['raw_material_stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raw_material_stock')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data as RawMaterialStock[]
    },
  })
}

export function useScrapStock() {
  return useQuery({
    queryKey: ['scrap_stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scrap_stock')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data as ScrapStock[]
    },
  })
}
