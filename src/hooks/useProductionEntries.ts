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
    // One RPC call for the whole cart, not one-per-line: Postgres rolls the
    // entire function back if any line fails, so a network drop mid-save
    // can never leave some lines committed and others not — a retry after a
    // failure is always safe to resubmit in full, never a double-count.
    // That's also what makes automatic retry safe here specifically — most
    // other mutations in this app are plain inserts where a blind retry
    // could double-write, so they rely on the form staying filled in and
    // the user tapping Save again instead.
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    mutationFn: async (rows: NewProductionEntry[]) => {
      const merged = mergeByDateAndProduct(rows)
      const { data, error } = await supabase.rpc('add_production_quantities_batch', {
        p_rows: merged.map((row) => ({
          entry_date: row.entry_date,
          pipe_product_id: row.pipe_product_id,
          quantity: row.quantity,
          notes: row.notes ?? null,
        })),
      })
      if (error) throw error
      return data
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
