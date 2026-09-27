import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { EntryMode } from './useRawMaterialPurchases'

export type StockCountItem = {
  raw_material_type_id: string
  entry_mode: EntryMode
  pack_kg: number | null
  num_bags: number | null
  quantity_kg: number
}

export type StockCount = {
  id: string
  count_date: string
  notes: string | null
  items: StockCountItem[]
}

/** One material's line in a count period — consumption and its FIFO cost, computed in Postgres. */
export type StockCheckMaterialRow = {
  count_id: string
  prev_count_date: string
  count_date: string
  /** Count this material's opening came from — older than prev_count_date
   *  when the material was left out of the previous count. */
  opening_count_date: string
  raw_material_type_id: string
  material_name: string
  is_recycled_output: boolean
  opening_kg: number
  purchased_kg: number
  returned_kg: number
  recycled_kg: number
  closing_kg: number
  consumed_kg: number
  consumed_cost: number
  /** Consumed kg with no purchase lot behind it — entries are probably missing. */
  unpriced_kg: number
  produced_kg: number
  factory_waste_kg: number
}

export type StockCheckProductionRow = {
  count_id: string
  pipe_product_id: string
  diameter_inches: number
  weight_kg: number
  pcs: number
  kg: number
}

/** A count period (previous count → this count) with its materials and pipes. */
export type StockCheckPeriod = {
  count_id: string
  prev_count_date: string
  count_date: string
  materials: StockCheckMaterialRow[]
  production: StockCheckProductionRow[]
  consumed_kg: number
  consumed_cost: number
  produced_kg: number
  produced_pcs: number
  factory_waste_kg: number
  /** consumed − produced. */
  waste_kg: number
  unpriced_kg: number
}

const COUNTS_KEY = ['stock_counts']
const REPORT_KEY = ['stock_check_report']

/** Counts and returns both change consumption and live stock. */
export function invalidateStockCheck(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: COUNTS_KEY })
  queryClient.invalidateQueries({ queryKey: REPORT_KEY })
  queryClient.invalidateQueries({ queryKey: ['raw_material_stock'] })
  queryClient.invalidateQueries({ queryKey: ['dashboard'] })
}

/** Every count, newest first, with its items. */
export function useStockCounts() {
  return useQuery({
    queryKey: COUNTS_KEY,
    queryFn: async (): Promise<StockCount[]> => {
      const { data, error } = await supabase
        .from('stock_counts')
        .select('id, count_date, notes, items:stock_count_items(raw_material_type_id, entry_mode, pack_kg, num_bags, quantity_kg)')
        .order('count_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as StockCount[]
    },
  })
}

/** Most each material could have at the end of `date` if none was used — last
 *  count + everything received since — keyed by material id. */
export function useExpectedRawMaterialStock(date: string) {
  return useQuery({
    queryKey: [...COUNTS_KEY, 'expected', date],
    // Moves with every purchase, return and recycling entry, none of which
    // invalidate this key — always re-read when the count screen opens.
    staleTime: 0,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase.rpc('rpc_expected_raw_material_stock', { p_date: date })
      if (error) throw error
      return new Map((data ?? []).map((row) => [row.raw_material_type_id, Number(row.expected_kg) || 0]))
    },
  })
}

export function useSaveStockCount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { count_date: string; notes: string | null; items: StockCountItem[] }) => {
      const { error } = await supabase.rpc('save_stock_count', {
        p_date: input.count_date,
        p_notes: input.notes ?? '',
        p_items: input.items,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateStockCheck(queryClient),
  })
}

export function useDeleteStockCount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('stock_counts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateStockCheck(queryClient),
  })
}

/** Count periods ending between `fromDate` and `toDate`, newest first. */
export function useStockCheckReport(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: [...REPORT_KEY, fromDate, toDate],
    // Same as above: production and purchases change it without invalidating it.
    staleTime: 0,
    queryFn: async (): Promise<StockCheckPeriod[]> => {
      const [materialsRes, productionRes] = await Promise.all([
        supabase.rpc('rpc_stock_check_report', { p_from: fromDate, p_to: toDate }),
        supabase.rpc('rpc_stock_check_production', { p_from: fromDate, p_to: toDate }),
      ])
      if (materialsRes.error) throw materialsRes.error
      if (productionRes.error) throw productionRes.error
      return buildPeriods(
        (materialsRes.data ?? []) as StockCheckMaterialRow[],
        (productionRes.data ?? []) as StockCheckProductionRow[],
      )
    },
  })
}

function buildPeriods(
  materialRows: StockCheckMaterialRow[],
  productionRows: StockCheckProductionRow[],
): StockCheckPeriod[] {
  const byCount = new Map<string, StockCheckPeriod>()

  for (const row of materialRows) {
    let period = byCount.get(row.count_id)
    if (!period) {
      period = {
        count_id: row.count_id,
        prev_count_date: row.prev_count_date,
        count_date: row.count_date,
        materials: [],
        production: productionRows.filter((p) => p.count_id === row.count_id),
        consumed_kg: 0,
        consumed_cost: 0,
        // Production and factory waste are per period, repeated on every material row.
        produced_kg: Number(row.produced_kg) || 0,
        produced_pcs: 0,
        factory_waste_kg: Number(row.factory_waste_kg) || 0,
        waste_kg: 0,
        unpriced_kg: 0,
      }
      period.produced_pcs = period.production.reduce((sum, p) => sum + (Number(p.pcs) || 0), 0)
      byCount.set(row.count_id, period)
    }
    period.materials.push(row)
    period.consumed_kg += Number(row.consumed_kg) || 0
    period.consumed_cost += Number(row.consumed_cost) || 0
    period.unpriced_kg += Number(row.unpriced_kg) || 0
  }

  const periods = [...byCount.values()]
  for (const period of periods) {
    period.waste_kg = period.consumed_kg - period.produced_kg
    // Heaviest-used material first — "which material did we use most this week".
    period.materials.sort((a, b) => b.consumed_kg - a.consumed_kg)
  }
  return periods.sort((a, b) => b.count_date.localeCompare(a.count_date))
}

/** Material cost per kg of pipe produced; null when nothing was produced. */
export function costPerKgProduced(period: StockCheckPeriod): number | null {
  return period.produced_kg > 0 ? period.consumed_cost / period.produced_kg : null
}

/** Share of consumed material that became pipe; null when nothing was consumed. */
export function yieldPercent(period: StockCheckPeriod): number | null {
  return period.consumed_kg > 0 ? (period.produced_kg / period.consumed_kg) * 100 : null
}
