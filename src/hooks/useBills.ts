import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type BillLineItem = {
  pipe_product_id?: string | null
  description: string
  quantity_pcs?: number | null
  weight_kg: number
  price_per_kg: number
  amount: number
}

export type BillRow = {
  id: string
  bill_number: string
  bill_date: string
  customer_id: string | null
  customer_name: string
  customer_address: string | null
  customer_phone: string | null
  line_items: BillLineItem[]
  subtotal: number
  discount: number
  tax: number
  grand_total: number
  status: 'active' | 'voided'
  notes: string | null
  created_at: string
  updated_at: string
}

export type CreateBillInput = {
  bill_number: string
  bill_date: string
  customer_id?: string | null
  customer_name: string
  customer_address?: string | null
  customer_phone?: string | null
  line_items: BillLineItem[]
  subtotal: number
  discount?: number
  tax?: number
  grand_total: number
  notes?: string | null
  sale_entry_ids?: string[]
}

export function useNextBillNumber() {
  return useQuery({
    queryKey: ['next_bill_number'],
    queryFn: async () => {
      const { data: settings } = await supabase
        .from('company_settings')
        .select('bill_prefix, next_bill_number')
        .eq('id', 'default')
        .single()

      const prefix = settings?.bill_prefix ?? 'SG-'
      const num = settings?.next_bill_number ?? 1
      return `${prefix}${String(num).padStart(4, '0')}`
    },
  })
}

export function useBills() {
  return useQuery({
    queryKey: ['bills'],
    queryFn: async (): Promise<BillRow[]> => {
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as unknown as BillRow[]
    },
  })
}

export function useBill(id?: string | null) {
  return useQuery({
    queryKey: ['bills', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<BillRow | null> => {
      if (!id) return null
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      return (data ?? null) as unknown as BillRow | null
    },
  })
}

export function useCreateBill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateBillInput): Promise<BillRow> => {
      const { sale_entry_ids, bill_number: _providedNum, ...billData } = input

      // Atomically generate the next bill number on actual save
      let finalBillNumber = _providedNum
      const { data: rpcBillNo, error: rpcError } = await supabase.rpc('generate_next_bill_number')
      if (!rpcError && rpcBillNo) {
        finalBillNumber = rpcBillNo as string
      }

      const { data, error } = await supabase
        .from('bills')
        .insert({
          ...billData,
          bill_number: finalBillNumber,
          discount: billData.discount ?? 0,
          tax: billData.tax ?? 0,
          status: 'active',
        })
        .select()
        .single()

      if (error) throw error

      const createdBill = data as unknown as BillRow

      // Link sales entries if provided
      if (sale_entry_ids && sale_entry_ids.length > 0) {
        await supabase
          .from('sales_entries')
          .update({ bill_id: createdBill.id })
          .in('id', sale_entry_ids)
      }

      return createdBill
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['next_bill_number'] })
      queryClient.invalidateQueries({ queryKey: ['company_settings'] })
      queryClient.invalidateQueries({ queryKey: ['records'] })
    },
  })
}

export type UpdateBillInput = {
  id: string
  bill_date: string
  customer_id?: string | null
  customer_name: string
  customer_address?: string | null
  customer_phone?: string | null
  line_items: BillLineItem[]
  subtotal: number
  discount?: number
  tax?: number
  grand_total: number
  notes?: string | null
}

export function useUpdateBill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateBillInput): Promise<BillRow> => {
      const { id, ...patch } = input

      const { data, error } = await supabase
        .from('bills')
        .update({
          ...patch,
          discount: patch.discount ?? 0,
          tax: patch.tax ?? 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      const updatedBill = data as unknown as BillRow

      // Re-sync sales entries linked to this bill
      await supabase.from('sales_entries').delete().eq('bill_id', id)

      const salesToInsert = (input.line_items || [])
        .filter((l) => l.pipe_product_id && l.quantity_pcs && l.quantity_pcs > 0)
        .map((l) => ({
          entry_date: input.bill_date,
          customer_id: input.customer_id || null,
          pipe_product_id: l.pipe_product_id!,
          quantity: l.quantity_pcs!,
          notes: `Billed: ${input.customer_name}`,
          bill_id: id,
        }))

      if (salesToInsert.length > 0) {
        await supabase.from('sales_entries').insert(salesToInsert)
      }

      return updatedBill
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['records'] })
      queryClient.invalidateQueries({ queryKey: ['finished_goods_stock'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useVoidBill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (billId: string) => {
      const { error } = await supabase
        .from('bills')
        .update({ status: 'voided', updated_at: new Date().toISOString() })
        .eq('id', billId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['records'] })
      queryClient.invalidateQueries({ queryKey: ['finished_goods_stock'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

