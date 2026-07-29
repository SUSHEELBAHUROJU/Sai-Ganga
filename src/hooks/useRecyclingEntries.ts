import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { OutputEntryMode } from '../components/GranuleOutputField'

export type RecyclingOutputMode = 'granules' | 'direct_to_pipe'

export type NewGranulesRecyclingEntry = {
  entry_date: string
  source_scrap_type_id: string
  /** Reduces that scrap type's stock. Optional — often not known precisely. */
  scrap_consumed_kg: number | null
  output_entry_mode: OutputEntryMode
  /** Only meaningful in 'bag' mode; null for a direct total. */
  output_pack_kg: number | null
  num_bags: number | null
  /** Granules produced — entered independently, adds to granule stock. */
  total_output_kg: number
  notes: string | null
}

export function useAddGranulesRecyclingEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewGranulesRecyclingEntry) => {
      const { error } = await supabase
        .from('recycling_entries')
        .insert({ ...input, output_mode: 'granules' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recycling_entries'] })
      queryClient.invalidateQueries({ queryKey: ['raw_material_stock'] })
      queryClient.invalidateQueries({ queryKey: ['scrap_stock'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export type NewDirectToPipeRecyclingEntry = {
  entry_date: string
  source_scrap_type_id: string
  scrap_consumed_kg: number | null
  pipe_product_id: string
  pipe_quantity: number
  notes: string | null
}

/** Adds straight to finished-pipe stock, merging (adding) into any existing
 * same-day direct-to-pipe entry for the same product via the DB RPC — the
 * same merge-by-date-and-product pattern production entries use. */
export function useAddDirectToPipeRecyclingEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewDirectToPipeRecyclingEntry) => {
      const { error } = await supabase.rpc('add_recycling_direct_to_pipe', {
        p_entry_date: input.entry_date,
        p_pipe_product_id: input.pipe_product_id,
        p_source_scrap_type_id: input.source_scrap_type_id,
        p_pipe_quantity: input.pipe_quantity,
        ...(input.scrap_consumed_kg !== null ? { p_scrap_consumed_kg: input.scrap_consumed_kg } : {}),
        ...(input.notes ? { p_notes: input.notes } : {}),
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recycling_entries'] })
      queryClient.invalidateQueries({ queryKey: ['finished_goods_stock'] })
      queryClient.invalidateQueries({ queryKey: ['scrap_stock'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
