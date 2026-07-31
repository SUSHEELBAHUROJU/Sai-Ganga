import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { MASTER_DATA_STALE_TIME } from '../lib/queryClient'

export type CompanySettings = {
  id: string
  business_name: string
  address: string
  gst_number: string
  phone: string | null
  bill_prefix: string
  next_bill_number: number
  bill_start_date: string
  updated_at: string
}

export type UpdateCompanySettingsInput = Partial<Omit<CompanySettings, 'id' | 'updated_at'>>

export function useCompanySettings() {
  return useQuery({
    queryKey: ['company_settings'],
    staleTime: MASTER_DATA_STALE_TIME,
    queryFn: async (): Promise<CompanySettings> => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('id', 'default')
        .single()

      if (error) {
        // Fallback default object if row doesn't exist yet in client state
        return {
          id: 'default',
          business_name: 'SAI GANGA POLYMER INDUSTRIES',
          address: 'SY.NO.216, H.NO. 3-245, NH 65, opp. M.S.R. Institute, Durajpalle, Suryapet, Telangana 508213',
          gst_number: '36ALRPB5625Q2ZG',
          phone: '',
          bill_prefix: 'SG-',
          next_bill_number: 1,
          bill_start_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        }
      }
      return data as CompanySettings
    },
  })
}

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: UpdateCompanySettingsInput) => {
      const { error } = await supabase
        .from('company_settings')
        .upsert({ id: 'default', ...updates, updated_at: new Date().toISOString() })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_settings'] })
    },
  })
}
