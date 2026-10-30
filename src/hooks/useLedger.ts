import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { formatQty } from '../lib/format'
import {
  invalidateSupplierLedger,
  balanceEffect,
  type PartyType,
  type SupplierLedgerBalance,
  type SupplierPassbookEntry,
} from './useSupplierLedger'

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
  bill_id: string | null
  bill_number: string | null
  bill_total_kg: number | null
  note: string | null
  created_at: string
  /** Set when the customer paid one of our suppliers directly — the same
   *  payment also sits in that supplier's ledger. */
  paid_to_party_type: PartyType | null
  paid_to_party_id: string | null
  paid_to_party_name: string | null
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
  queryClient.invalidateQueries({ queryKey: ['ledger_period'] })
}

export type CustomerPeriodActivity = {
  due: number
  received: number
  count: number
}

export type CustomerLedgerPeriodData = {
  customerActivity: Map<string, CustomerPeriodActivity>
  totalDue: number
  totalReceived: number
  net: number
}

export function useCustomerLedgerPeriod(fromDate: string | null, toDate: string | null) {
  return useQuery({
    queryKey: ['ledger_period', fromDate, toDate],
    enabled: Boolean(fromDate && toDate),
    queryFn: async (): Promise<CustomerLedgerPeriodData> => {
      if (!fromDate || !toDate) {
        return { customerActivity: new Map(), totalDue: 0, totalReceived: 0, net: 0 }
      }
      const { data, error } = await supabase
        .from('ledger_transactions')
        .select('id, customer_id, type, amount, date, bill_id, bills(status)')
        .gte('date', fromDate)
        .lte('date', toDate)
        .limit(10000)

      if (error) throw error

      const customerActivity = new Map<string, CustomerPeriodActivity>()
      let totalDue = 0
      let totalReceived = 0

      for (const row of data ?? []) {
        const billStatus = (row.bills as { status?: string } | null)?.status
        if (row.bill_id && billStatus === 'voided') continue

        const cid = row.customer_id
        const current = customerActivity.get(cid) ?? { due: 0, received: 0, count: 0 }
        const amt = Number(row.amount) || 0

        if (row.type === 'due') {
          current.due += amt
          totalDue += amt
        } else {
          current.received += amt
          totalReceived += amt
        }
        current.count += 1
        customerActivity.set(cid, current)
      }

      return {
        customerActivity,
        totalDue,
        totalReceived,
        net: totalDue - totalReceived,
      }
    },
  })
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
        data?.[0] ?? { cash_total: 0, online_total: 0, combined_total: 0, to_supplier_total: 0 }
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
  /** The customer paid this supplier / scrap dealer instead of us. */
  paid_to?: { party_type: PartyType; party_id: string } | null
}

/** Running balances recomputed oldest-first, returned newest-first like the RPCs. */
function withRunningBalances<T extends { entry_date: string; created_at: string; running_balance: number }>(
  rows: T[],
  effect: (row: T) => number,
): T[] {
  const ordered = [...rows].sort(
    (a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at),
  )
  let running = 0
  const withBalance = ordered.map((row) => {
    running = Math.round((running + effect(row)) * 100) / 100
    return { ...row, running_balance: running }
  })
  return withBalance.reverse()
}

type PaymentSnapshot = [readonly unknown[], unknown][]

/**
 * Shows a payment everywhere the moment Save is tapped — customer balance,
 * passbook, and (for a payment made straight to a supplier) that supplier's
 * balance and passbook, which also moves the Ledger's net position — instead
 * of waiting for the save and the re-fetch. Returns the caches it touched so a
 * failed save can put them back.
 */
async function applyPaymentOptimistically(
  queryClient: QueryClient,
  input: RecordPaymentInput,
): Promise<PaymentSnapshot> {
  const keys: (readonly unknown[])[] = [LEDGER_KEY, ['ledger_passbook', input.customer_id]]
  const party = input.paid_to
  if (party) keys.push(['supplier_ledger_balances'], ['supplier_passbook', party.party_type, party.party_id])

  await Promise.all(keys.map((queryKey) => queryClient.cancelQueries({ queryKey })))
  const snapshot: PaymentSnapshot = keys.map((k) => [k, queryClient.getQueryData(k)])

  const now = new Date().toISOString()
  const tempId = `pending-${now}`
  const amount = input.amount
  const supplierName = party
    ? queryClient
        .getQueryData<SupplierLedgerBalance[]>(['supplier_ledger_balances'])
        ?.find((p) => p.party_type === party.party_type && p.party_id === party.party_id)?.name ?? null
    : null

  queryClient.setQueryData<CustomerLedgerBalance[]>(LEDGER_KEY, (rows) =>
    rows?.map((c) =>
      c.customer_id === input.customer_id
        ? { ...c, total_received: c.total_received + amount, balance: c.balance - amount }
        : c,
    ),
  )

  queryClient.setQueryData<PassbookEntry[]>(['ledger_passbook', input.customer_id], (rows) =>
    rows
      ? withRunningBalances(
          [
            ...rows,
            {
              id: tempId,
              entry_date: input.date,
              type: 'received',
              amount,
              running_balance: 0,
              payment_mode: input.payment_mode,
              payment_app: input.payment_app ?? null,
              bill_id: null,
              bill_number: null,
              bill_total_kg: null,
              note: input.note?.trim() || null,
              created_at: now,
              paid_to_party_type: party?.party_type ?? null,
              paid_to_party_id: party?.party_id ?? null,
              paid_to_party_name: supplierName,
            },
          ],
          (row) => (row.type === 'due' ? row.amount : -row.amount),
        )
      : rows,
  )

  if (party) {
    queryClient.setQueryData<SupplierLedgerBalance[]>(['supplier_ledger_balances'], (rows) =>
      rows?.map((p) =>
        p.party_type === party.party_type && p.party_id === party.party_id
          ? { ...p, total_paid: p.total_paid + amount, balance: p.balance - amount }
          : p,
      ),
    )
    const customerName =
      queryClient
        .getQueryData<CustomerLedgerBalance[]>(LEDGER_KEY)
        ?.find((c) => c.customer_id === input.customer_id)?.name ?? null
    queryClient.setQueryData<SupplierPassbookEntry[]>(
      ['supplier_passbook', party.party_type, party.party_id],
      (rows) =>
        rows
          ? withRunningBalances(
              [
                ...rows,
                {
                  id: tempId,
                  kind: 'payment',
                  entry_date: input.date,
                  amount,
                  running_balance: 0,
                  item_name: null,
                  quantity_kg: null,
                  price_per_kg: null,
                  payment_mode: input.payment_mode,
                  payment_app: input.payment_app ?? null,
                  paid_to: null,
                  reference_no: null,
                  bank_account: null,
                  paid_by: null,
                  note: input.note?.trim() || null,
                  created_at: now,
                  paid_by_customer_id: input.customer_id,
                  paid_by_customer_name: customerName ?? 'Customer',
                },
              ],
              (row) => balanceEffect(row.kind, row.amount),
            )
          : rows,
    )
  }

  return snapshot
}

export function useRecordPayment() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  // The payment modal closes as soon as Save is tapped, so the outcome is
  // reported from here — these callbacks run even after it has unmounted.
  return useMutation({
    onMutate: (input: RecordPaymentInput) => applyPaymentOptimistically(queryClient, input),
    onError: (_err, input, snapshot) => {
      for (const [queryKey, data] of snapshot ?? []) queryClient.setQueryData(queryKey, data)
      showToast(
        `Payment of ₹${formatQty(input.amount)} was NOT saved — check your connection and record it again.`,
        'error',
      )
    },
    onSuccess: (_data, input) => {
      const customer = queryClient
        .getQueryData<CustomerLedgerBalance[]>(LEDGER_KEY)
        ?.find((c) => c.customer_id === input.customer_id)
      const supplier = input.paid_to
        ? queryClient
            .getQueryData<SupplierLedgerBalance[]>(['supplier_ledger_balances'])
            ?.find((p) => p.party_type === input.paid_to!.party_type && p.party_id === input.paid_to!.party_id)
        : null
      const who = customer?.name ?? 'customer'
      const what = supplier
        ? `₹${formatQty(input.amount)} paid by ${who} to ${supplier.name}`
        : `₹${formatQty(input.amount)} received from ${who}`
      // The cached balance already includes this payment (optimistic update).
      const remaining = customer ? customer.balance : null
      showToast(
        remaining === null
          ? `${what} — saved`
          : remaining > 0
            ? `${what} — ₹${formatQty(remaining)} still due`
            : `${what} — fully paid!`,
      )
    },
    mutationFn: async (input: RecordPaymentInput) => {
      if (input.paid_to) {
        // Both ledgers in one transaction: the customer's 'received' and the
        // supplier's 'payment', linked so they can only be removed together.
        const { error } = await supabase.rpc('record_customer_payment_to_supplier', {
          p: {
            customer_id: input.customer_id,
            party_type: input.paid_to.party_type,
            party_id: input.paid_to.party_id,
            amount: input.amount,
            date: input.date,
            payment_mode: input.payment_mode,
            payment_app: input.payment_app ?? null,
            note: input.note?.trim() || null,
          },
        })
        if (error) throw error
        return
      }
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
    // Success or failure, re-read the real figures (bill PAID/PARTIAL status,
    // collections and period totals are left to this refresh).
    onSettled: (_data, _err, input) => {
      invalidateLedger(queryClient, input.customer_id)
      if (input.paid_to) invalidateSupplierLedger(queryClient)
    },
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

/** Undo a mis-entered payment or manual due. Safe: balance is always recomputed live.
 *  A payment made straight to a supplier takes its supplier-ledger twin with it. */
export function useDeleteLedgerTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; customer_id: string }) => {
      const { error } = await supabase.from('ledger_transactions').delete().eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_data, input) => {
      invalidateLedger(queryClient, input.customer_id)
      invalidateSupplierLedger(queryClient)
    },
  })
}
