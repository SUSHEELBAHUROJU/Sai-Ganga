import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type ProductionEntryRow = Database['public']['Tables']['production_entries']['Row']
export type ProductionEntryWithProduct = ProductionEntryRow & {
  pipe_products: { diameter_inches: number; weight_kg: number } | null
}
export type NewProductionEntry = {
  entry_date: string
  pipe_product_id: string
  quantity: number
  notes?: string | null
}

function byDateKey(date: string) {
  return ['production_entries', 'by_date', date]
}

export function useProductionEntriesByDate(date: string) {
  return useQuery({
    queryKey: byDateKey(date),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('production_entries')
        .select('*, pipe_products(diameter_inches, weight_kg)')
        .eq('entry_date', date)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as ProductionEntryWithProduct[]
    },
  })
}

/**
 * Same date + same product must land in one row, not a duplicate — merge by
 * summing before we even reach the DB. The DB itself also enforces this (a
 * unique constraint + an atomic add-on-conflict RPC), so this pre-merge is a
 * defense-in-depth / fewer-round-trips optimization, not the only guard.
 */
function mergeByDateAndProduct(rows: NewProductionEntry[]): NewProductionEntry[] {
  const merged = new Map<string, NewProductionEntry>()
  for (const row of rows) {
    const key = `${row.entry_date}:${row.pipe_product_id}`
    const existing = merged.get(key)
    if (existing) {
      existing.quantity += row.quantity
      existing.notes = existing.notes ?? row.notes ?? null
    } else {
      merged.set(key, { ...row })
    }
  }
  return Array.from(merged.values())
}

export function useAddProductionEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rows: NewProductionEntry[]) => {
      const merged = mergeByDateAndProduct(rows)
      const results = await Promise.all(
        merged.map((row) =>
          supabase.rpc('add_production_quantity', {
            p_entry_date: row.entry_date,
            p_pipe_product_id: row.pipe_product_id,
            p_quantity: row.quantity,
            ...(row.notes ? { p_notes: row.notes } : {}),
          }),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
      return results.map((r) => r.data)
    },
    onSuccess: (_data, rows) => {
      const dates = new Set(rows.map((r) => r.entry_date))
      for (const date of dates) {
        queryClient.invalidateQueries({ queryKey: byDateKey(date) })
      }
      queryClient.invalidateQueries({ queryKey: ['finished_goods_stock'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['records'] })
    },
  })
}
