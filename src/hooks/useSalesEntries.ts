import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type NewSalesEntry = {
  entry_date: string
  customer_id: string
  pipe_product_id: string
  quantity: number
  notes?: string | null
}

const RECENT_CUSTOMERS_KEY = ['sales_entries', 'recent_customers']

/**
 * Same date + same product + same customer must land in one row — merge by
 * summing before we even reach the DB. The DB itself also enforces this (a
 * unique constraint + an atomic add-on-conflict RPC), so this pre-merge is a
 * defense-in-depth / fewer-round-trips optimization, not the only guard.
 */
function mergeByDateProductCustomer(rows: NewSalesEntry[]): NewSalesEntry[] {
  const merged = new Map<string, NewSalesEntry>()
  for (const row of rows) {
    const key = `${row.entry_date}:${row.pipe_product_id}:${row.customer_id}`
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

export function useAddSalesEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    // One RPC call for the whole cart — see the equivalent note in
    // useProductionEntries.ts: this makes a multi-line save atomic, so a
    // failure never leaves some lines committed for a retry to double-count.
    mutationFn: async (rows: NewSalesEntry[]) => {
      const merged = mergeByDateProductCustomer(rows)
      const { data, error } = await supabase.rpc('add_sales_quantities_batch', {
        p_rows: merged.map((row) => ({
          entry_date: row.entry_date,
          pipe_product_id: row.pipe_product_id,
          customer_id: row.customer_id,
          quantity: row.quantity,
          notes: row.notes ?? null,
        })),
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECENT_CUSTOMERS_KEY })
      queryClient.invalidateQueries({ queryKey: ['finished_goods_stock'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['records'] })
    },
  })
}

export function useRecentCustomerIds(limit = 8) {
  return useQuery({
    queryKey: RECENT_CUSTOMERS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_entries')
        .select('customer_id')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error

      const seen = new Set<string>()
      const ids: string[] = []
      for (const row of data) {
        if (!row.customer_id || seen.has(row.customer_id)) continue
        seen.add(row.customer_id)
        ids.push(row.customer_id)
        if (ids.length >= limit) break
      }
      return ids
    },
  })
}
