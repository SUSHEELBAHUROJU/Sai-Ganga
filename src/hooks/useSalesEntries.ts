import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const RECENT_CUSTOMERS_KEY = ['sales_entries', 'recent_customers']

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
