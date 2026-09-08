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
  transport_charges: number
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
  transport_charges?: number
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
          transport_charges: billData.transport_charges ?? 0,
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
      // A new bill creates a ledger "due" via a DB trigger — refresh the
      // derived balance/status views so it shows up immediately.
      queryClient.invalidateQueries({ queryKey: ['ledger_balances'] })
      queryClient.invalidateQueries({ queryKey: ['bill_payment_status'] })
      queryClient.invalidateQueries({ queryKey: ['ledger_passbook'] })
    },
  })
}

export type UpdateBillInput = {
  id: string
  /** Only set when the number is actually being changed — see useUpdateBill. */
  bill_number?: string
  bill_date: string
  customer_id?: string | null
  customer_name: string
  customer_address?: string | null
  customer_phone?: string | null
  line_items: BillLineItem[]
  subtotal: number
  discount?: number
  tax?: number
  transport_charges?: number
  grand_total: number
  notes?: string | null
}

/**
 * Thrown when a bill is renamed onto a number another bill already holds.
 * Named so the UI can surface the real message instead of a generic failure.
 */
export class DuplicateBillNumberError extends Error {
  constructor(billNumber: string) {
    super(`Bill number ${billNumber} is already used by another bill.`)
    this.name = 'DuplicateBillNumberError'
  }
}

/**
 * A renamed bill can jump ahead of the auto-increment counter — rename one to
 * SG-0040 while next_bill_number sits at 36 and generate_next_bill_number(),
 * which does no collision check of its own, marches straight into SG-0040 four
 * bills later and trips the unique index at creation time, far away from the
 * edit that caused it. Pushing the counter past the new number closes that gap.
 */
async function advanceBillCounterPast(billNumber: string) {
  const { data: settings } = await supabase
    .from('company_settings')
    .select('bill_prefix, next_bill_number')
    .eq('id', 'default')
    .single()

  if (!settings) return

  const prefix = settings.bill_prefix ?? 'SG-'
  // Only numbers shaped like generated ones feed the counter — a one-off such
  // as "MANUAL-7" shouldn't drag the whole sequence along behind it.
  if (!billNumber.startsWith(prefix)) return

  const digits = billNumber.slice(prefix.length)
  if (!/^\d+$/.test(digits)) return

  const seq = parseInt(digits, 10)
  if (seq < (settings.next_bill_number ?? 1)) return

  await supabase
    .from('company_settings')
    .update({ next_bill_number: seq + 1, updated_at: new Date().toISOString() })
    .eq('id', 'default')
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
          transport_charges: patch.transport_charges ?? 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        // bill_number is the table's only unique column, so a 23505 here can
        // only mean the invoice number is taken. The modal pre-checks against
        // its cached list; this is the backstop for a concurrent save.
        if (error.code === '23505' && patch.bill_number) {
          throw new DuplicateBillNumberError(patch.bill_number)
        }
        throw error
      }
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

      if (input.bill_number) {
        await advanceBillCounterPast(input.bill_number)
      }

      return updatedBill
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['records'] })
      // A rename may have pushed the auto-increment counter forward.
      queryClient.invalidateQueries({ queryKey: ['next_bill_number'] })
      queryClient.invalidateQueries({ queryKey: ['company_settings'] })
      queryClient.invalidateQueries({ queryKey: ['finished_goods_stock'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      // Editing a bill's total/customer changes the linked ledger due — the
      // sync trigger handles the DB side, this refreshes what the UI reads.
      queryClient.invalidateQueries({ queryKey: ['ledger_balances'] })
      queryClient.invalidateQueries({ queryKey: ['bill_payment_status'] })
      queryClient.invalidateQueries({ queryKey: ['ledger_passbook'] })
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
      // Voiding drops the bill's due from customer_ledger_balance /
      // bill_payment_status (both filter to status = 'active').
      queryClient.invalidateQueries({ queryKey: ['ledger_balances'] })
      queryClient.invalidateQueries({ queryKey: ['bill_payment_status'] })
      // The bill's "sold" pipes go back into finished_goods_stock (see
      // 20260807000000_void_bill_restores_stock.sql) — Reports' Daily/Trend
      // totals read the same now-voided-excluding RPCs, so they'd otherwise
      // keep showing this sale as sold until their own staleTime lapsed.
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['ledger_passbook'] })
    },
  })
}

