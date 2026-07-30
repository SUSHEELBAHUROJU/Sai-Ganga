import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { OutputEntryMode } from '../components/GranuleOutputField'

export type NewGranulesRecyclingEntry = {
  entry_date: string
  source_scrap_type_id: string
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
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
