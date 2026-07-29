import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type NewFactoryWasteEntry = {
  entry_date: string
  scrap_type_id: string
  quantity_kg: number
  notes: string | null
}

export function useAddFactoryWasteEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewFactoryWasteEntry) => {
      const { error } = await supabase.from('factory_waste_entries').insert(input)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factory_waste_entries'] })
      queryClient.invalidateQueries({ queryKey: ['scrap_stock'] })
    },
  })
}
