import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/** Which master table a ledger party lives in — raw_material_suppliers or scrap_dealers. */
export type PartyType = 'supplier' | 'scrap_dealer'
export type SupplierPaymentMode = 'cash' | 'online' | 'cash_deposit'
/** Which app an online payment went through. */
export type SupplierPaymentApp = 'phonepe' | 'gpay' | 'paytm' | 'other'
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
  /** 'return': bad material sent back against a purchase — lowers what we owe. */
  kind: 'purchase' | 'return' | SupplierEntryType
  entry_date: string
  amount: number
  running_balance: number
  item_name: string | null
  quantity_kg: number | null
  price_per_kg: number | null
  payment_mode: SupplierPaymentMode | null
  payment_app: SupplierPaymentApp | null
  paid_to: string | null
  reference_no: string | null
  bank_account: string | null
  paid_by: string | null
  note: string | null
  created_at: string
  /** Set when a customer paid this party on our behalf — the same payment is
   *  a 'received' in that customer's ledger, so it is managed from there. */
  paid_by_customer_id: string | null
  paid_by_customer_name: string | null
}

export const SUPPLIER_PAYMENT_MODE_LABEL: Record<SupplierPaymentMode, string> = {
  cash: 'Cash',
  online: 'Online',
  cash_deposit: 'Cash Deposit',
}

export const SUPPLIER_PAYMENT_APP_LABEL: Record<SupplierPaymentApp, string> = {
  phonepe: 'PhonePe',
  gpay: 'GPay',
  paytm: 'Paytm',
  other: 'Other',
}

/** "Online · GPay" / "Cash Deposit" — mode plus app when there is one. */
export function supplierPaymentModeText(
  mode: SupplierPaymentMode | null,
  app: SupplierPaymentApp | null,
): string {
  if (!mode) return 'Payment'
  const label = SUPPLIER_PAYMENT_MODE_LABEL[mode]
  return mode === 'online' && app ? `${label} · ${SUPPLIER_PAYMENT_APP_LABEL[app]}` : label
}

/** "₹12,000 To Pay" / "₹5,000 Advance" / "Fully Paid" — the one wording used on every supplier-ledger screen. */
export function supplierBalanceText(balance: number, format: (n: number) => string): string {
  if (balance > 0) return `₹${format(balance)} To Pay`
  if (balance < 0) return `₹${format(-balance)} Advance`
  return 'Fully Paid'
}

/** How an entry moves the balance: purchases, dues and refunds raise what we owe; payments and returns lower it. */
export function balanceEffect(kind: SupplierPassbookEntry['kind'], amount: number): number {
  return kind === 'payment' || kind === 'return' ? -amount : amount
}

const BALANCES_KEY = ['supplier_ledger_balances']

/** Purchases feed the supplier ledger directly (it reads their cost live), so
 *  anything that adds, edits or deletes a purchase calls this too. */
export function invalidateSupplierLedger(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: BALANCES_KEY })
  queryClient.invalidateQueries({ queryKey: ['supplier_passbook'] })
  queryClient.invalidateQueries({ queryKey: ['supplier_ledger_period'] })
}

export type SupplierPeriodActivity = {
  purchased: number
  paid: number
  count: number
}

export type SupplierLedgerPeriodData = {
  partyActivity: Map<string, SupplierPeriodActivity>
  totalPurchased: number
  totalPaid: number
  net: number
}

export function useSupplierLedgerPeriod(fromDate: string | null, toDate: string | null) {
  return useQuery({
    queryKey: ['supplier_ledger_period', fromDate, toDate],
    enabled: Boolean(fromDate && toDate),
    queryFn: async (): Promise<SupplierLedgerPeriodData> => {
      if (!fromDate || !toDate) {
        return { partyActivity: new Map(), totalPurchased: 0, totalPaid: 0, net: 0 }
      }

      const [rawPurchases, scrapPurchases, ledgerTxns, returns] = await Promise.all([
        supabase
          .from('raw_material_purchases')
          .select('id, supplier_id, cost, entry_date')
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate)
          .not('supplier_id', 'is', null)
          .not('cost', 'is', null)
          .limit(10000),
        supabase
          .from('scrap_purchases')
          .select('id, scrap_dealer_id, cost, entry_date')
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate)
          .not('scrap_dealer_id', 'is', null)
          .not('cost', 'is', null)
          .limit(10000),
        supabase
          .from('supplier_ledger_transactions')
          .select('id, party_type, supplier_id, scrap_dealer_id, type, amount, date')
          .gte('date', fromDate)
          .lte('date', toDate)
          .limit(10000),
        supabase
          .from('raw_material_purchase_returns')
          .select('id, quantity_kg, return_date, raw_material_purchases(supplier_id, price_per_kg, cost, total_qty_kg)')
          .gte('return_date', fromDate)
          .lte('return_date', toDate)
          .limit(10000),
      ])

      if (rawPurchases.error) throw rawPurchases.error
      if (scrapPurchases.error) throw scrapPurchases.error
      if (ledgerTxns.error) throw ledgerTxns.error
      if (returns.error) throw returns.error

      const partyActivity = new Map<string, SupplierPeriodActivity>()
      let totalPurchased = 0
      let totalPaid = 0

      const getActivity = (key: string) => {
        let act = partyActivity.get(key)
        if (!act) {
          act = { purchased: 0, paid: 0, count: 0 }
          partyActivity.set(key, act)
        }
        return act
      }

      for (const row of rawPurchases.data ?? []) {
        if (!row.supplier_id) continue
        const key = `supplier:${row.supplier_id}`
        const act = getActivity(key)
        const cost = Number(row.cost) || 0
        act.purchased += cost
        act.count += 1
        totalPurchased += cost
      }

      for (const row of scrapPurchases.data ?? []) {
        if (!row.scrap_dealer_id) continue
        const key = `scrap_dealer:${row.scrap_dealer_id}`
        const act = getActivity(key)
        const cost = Number(row.cost) || 0
        act.purchased += cost
        act.count += 1
        totalPurchased += cost
      }

      for (const row of returns.data ?? []) {
        const purchase = row.raw_material_purchases as {
          supplier_id?: string
          price_per_kg?: number | null
          cost?: number | null
          total_qty_kg?: number | null
        } | null
        const supplierId = purchase?.supplier_id
        if (!supplierId) continue
        const key = `supplier:${supplierId}`
        const act = getActivity(key)
        const qty = Number(row.quantity_kg) || 0
        let retAmt = 0
        if (purchase.price_per_kg != null) {
          retAmt = qty * Number(purchase.price_per_kg)
        } else if (purchase.total_qty_kg && purchase.total_qty_kg > 0 && purchase.cost != null) {
          retAmt = Math.round(((qty * purchase.cost) / purchase.total_qty_kg) * 100) / 100
        }
        act.purchased -= retAmt
        act.count += 1
        totalPurchased -= retAmt
      }

      for (const row of ledgerTxns.data ?? []) {
        const partyId = row.supplier_id || row.scrap_dealer_id
        if (!partyId) continue
        const key = `${row.party_type}:${partyId}`
        const act = getActivity(key)
        const amt = Number(row.amount) || 0
        act.count += 1

        if (row.type === 'payment') {
          act.paid += amt
          totalPaid += amt
        } else if (row.type === 'refund') {
          act.paid -= amt
          totalPaid -= amt
        } else if (row.type === 'due') {
          act.purchased += amt
          totalPurchased += amt
        }
      }

      return {
        partyActivity,
        totalPurchased,
        totalPaid,
        net: totalPurchased - totalPaid,
      }
    },
  })
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
  payment_app: SupplierPaymentApp | null
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

/** Undo a mis-entered payment or adjustment. Safe: balance is always recomputed live.
 *  A payment a customer made for us also removes its 'received' in that
 *  customer's ledger (a DB trigger), so the customer side is refreshed too. */
export function useDeleteSupplierLedgerEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('supplier_ledger_transactions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateSupplierLedger(queryClient)
      for (const key of ['ledger_balances', 'ledger_passbook', 'bill_payment_status', 'ledger_collections', 'ledger_period']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}
