import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type PaymentMode = 'cash' | 'online'
export type PaymentApp = 'phonepe' | 'gpay' | 'other'

export type CustomerLedgerBalance = {
  customer_id: string
  name: string
  phone: string | null
  total_due: number
  total_received: number
  balance: number
}

export type PassbookEntry = {
  id: string
  entry_date: string
  type: 'due' | 'received'
  amount: number
  running_balance: number
  payment_mode: PaymentMode | null
  payment_app: PaymentApp | null
  bill_number: string | null
  note: string | null
  created_at: string
}

export type BillPaymentStatus = {
  bill_id: string
  customer_id: string
  grand_total: number
  paid_amount: number
  due_amount: number
  payment_status: 'paid' | 'partial' | 'due'
}

const LEDGER_KEY = ['ledger_balances']

function invalidateLedger(queryClient: ReturnType<typeof useQueryClient>, customerId: string) {
  queryClient.invalidateQueries({ queryKey: LEDGER_KEY })
  queryClient.invalidateQueries({ queryKey: ['ledger_passbook', customerId] })
  queryClient.invalidateQueries({ queryKey: ['bill_payment_status'] })
  queryClient.invalidateQueries({ queryKey: ['ledger_collections'] })
}

/** Every customer's live balance — the Ledger list and the Reports dues tab both read from this. */
export function useCustomerLedgerBalances() {
  return useQuery({
    queryKey: LEDGER_KEY,
    queryFn: async (): Promise<CustomerLedgerBalance[]> => {
      const { data, error } = await supabase.from('customer_ledger_balance').select('*')
      if (error) throw error
      return (data ?? []) as CustomerLedgerBalance[]
    },
  })
}

/** One customer's chronological passbook, newest first, with a running balance computed in Postgres. */
export function useCustomerPassbook(customerId: string | null) {
  return useQuery({
    queryKey: ['ledger_passbook', customerId],
    enabled: Boolean(customerId),
    queryFn: async (): Promise<PassbookEntry[]> => {
      if (!customerId) return []
      const { data, error } = await supabase.rpc('rpc_customer_passbook', {
        p_customer_id: customerId,
      })
      if (error) throw error
      return (data ?? []) as PassbookEntry[]
    },
  })
}

/** PAID/PARTIAL/DUE status for every active bill — Records and BillPdfModal look up by bill_id. */
export function useBillPaymentStatuses() {
  return useQuery({
    queryKey: ['bill_payment_status'],
    queryFn: async (): Promise<Map<string, BillPaymentStatus>> => {
      const { data, error } = await supabase.from('bill_payment_status').select('*')
      if (error) throw error
      const rows = (data ?? []) as BillPaymentStatus[]
      return new Map(rows.map((row) => [row.bill_id, row]))
    },
  })
}

export function useCollectionsByMode(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['ledger_collections', fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_collections_by_mode', {
        p_from: fromDate,
        p_to: toDate,
      })
      if (error) throw error
      return (
        data?.[0] ?? { cash_total: 0, online_total: 0, combined_total: 0 }
      )
    },
  })
}

export type RecordPaymentInput = {
  customer_id: string
  amount: number
  date: string
  payment_mode: PaymentMode
  payment_app?: PaymentApp | null
  note?: string | null
}

export function useRecordPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: RecordPaymentInput) => {
      const { error } = await supabase.from('ledger_transactions').insert({
        customer_id: input.customer_id,
        type: 'received',
        amount: input.amount,
        date: input.date,
        payment_mode: input.payment_mode,
        payment_app: input.payment_app ?? null,
        note: input.note?.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: (_data, input) => invalidateLedger(queryClient, input.customer_id),
  })
}

export type AddManualDueInput = {
  customer_id: string
  amount: number
  date: string
  note?: string | null
}

export function useAddManualDue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: AddManualDueInput) => {
      const { error } = await supabase.from('ledger_transactions').insert({
        customer_id: input.customer_id,
        type: 'due',
        amount: input.amount,
        date: input.date,
        note: input.note?.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: (_data, input) => invalidateLedger(queryClient, input.customer_id),
  })
}

/** Undo a mis-entered payment or manual due. Safe: balance is always recomputed live. */
export function useDeleteLedgerTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; customer_id: string }) => {
      const { error } = await supabase.from('ledger_transactions').delete().eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_data, input) => invalidateLedger(queryClient, input.customer_id),
  })
}
