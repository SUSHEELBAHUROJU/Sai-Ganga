import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/** Which master table a ledger party lives in — raw_material_suppliers or scrap_dealers. */
export type PartyType = 'supplier' | 'scrap_dealer'
export type SupplierPaymentMode = 'cash' | 'online' | 'cash_deposit'
/** payment: we paid them. due: payable not tied to a purchase (opening
 *  balance). refund: they returned money to us. */
export type SupplierEntryType = 'payment' | 'due' | 'refund'

export type SupplierLedgerBalance = {
  party_type: PartyType
  party_id: string
  name: string
  phone: string | null
  is_active: boolean
  /** Purchase material cost (transport excluded) + manual dues. */
  total_purchased: number
  /** Payments minus refunds. */
  total_paid: number
  /** > 0: we owe them. < 0: advance sitting with them. */
  balance: number
}

export type SupplierPassbookEntry = {
  id: string
  kind: 'purchase' | SupplierEntryType
  entry_date: string
  amount: number
  running_balance: number
  item_name: string | null
  quantity_kg: number | null
  price_per_kg: number | null
  payment_mode: SupplierPaymentMode | null
  paid_to: string | null
  reference_no: string | null
  bank_account: string | null
  paid_by: string | null
  note: string | null
  created_at: string
}

export const SUPPLIER_PAYMENT_MODE_LABEL: Record<SupplierPaymentMode, string> = {
  cash: 'Cash',
  online: 'Online',
  cash_deposit: 'Cash Deposit',
}

/** "₹12,000 Payable" / "₹5,000 Advance" / "Settled" — the one wording used on every supplier-ledger screen. */
export function supplierBalanceText(balance: number, format: (n: number) => string): string {
  if (balance > 0) return `₹${format(balance)} Payable`
  if (balance < 0) return `₹${format(-balance)} Advance`
  return 'Settled'
}

/** How an entry moves the balance: purchases, dues and refunds raise what we owe, payments lower it. */
export function balanceEffect(kind: SupplierPassbookEntry['kind'], amount: number): number {
  return kind === 'payment' ? -amount : amount
}

const BALANCES_KEY = ['supplier_ledger_balances']

/** Purchases feed the supplier ledger directly (it reads their cost live), so
 *  anything that adds, edits or deletes a purchase calls this too. */
export function invalidateSupplierLedger(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: BALANCES_KEY })
  queryClient.invalidateQueries({ queryKey: ['supplier_passbook'] })
}

/** Every supplier's and scrap dealer's live balance. */
export function useSupplierLedgerBalances() {
  return useQuery({
    queryKey: BALANCES_KEY,
    queryFn: async (): Promise<SupplierLedgerBalance[]> => {
      const { data, error } = await supabase.from('supplier_ledger_balance').select('*')
      if (error) throw error
      return (data ?? []) as SupplierLedgerBalance[]
    },
  })
}

/** One party's purchases and payments, newest first, with a running balance computed in Postgres. */
export function useSupplierPassbook(partyType: PartyType | null, partyId: string | null) {
  return useQuery({
    queryKey: ['supplier_passbook', partyType, partyId],
    enabled: Boolean(partyType && partyId),
    queryFn: async (): Promise<SupplierPassbookEntry[]> => {
      if (!partyType || !partyId) return []
      const { data, error } = await supabase.rpc('rpc_supplier_passbook', {
        p_party_type: partyType,
        p_party_id: partyId,
      })
      if (error) throw error
      return (data ?? []) as SupplierPassbookEntry[]
    },
  })
}

export type SupplierLedgerEntryFields = {
  type: SupplierEntryType
  amount: number
  date: string
  payment_mode: SupplierPaymentMode | null
  paid_to: string | null
  reference_no: string | null
  bank_account: string | null
  paid_by: string | null
  note: string | null
}

export type AddSupplierLedgerEntryInput = SupplierLedgerEntryFields & {
  party_type: PartyType
  party_id: string
}

export function useAddSupplierLedgerEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ party_type, party_id, ...fields }: AddSupplierLedgerEntryInput) => {
      const { error } = await supabase.from('supplier_ledger_transactions').insert({
        ...fields,
        party_type,
        supplier_id: party_type === 'supplier' ? party_id : null,
        scrap_dealer_id: party_type === 'scrap_dealer' ? party_id : null,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateSupplierLedger(queryClient),
  })
}

/** Correct a payment's details after the fact — amount, mode, who it went to. */
export function useUpdateSupplierLedgerEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: SupplierLedgerEntryFields & { id: string }) => {
      const { error } = await supabase.from('supplier_ledger_transactions').update(fields).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateSupplierLedger(queryClient),
  })
}

/** Undo a mis-entered payment or adjustment. Safe: balance is always recomputed live. */
export function useDeleteSupplierLedgerEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('supplier_ledger_transactions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateSupplierLedger(queryClient),
  })
}
