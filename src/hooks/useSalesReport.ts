import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { BillLineItem } from './useBills'

/** One row per bill — not per line item. A sales report is read bill by bill
 *  ("what did this customer take, what did it come to"), and repeating the
 *  customer on a row per pipe size made a month's report pages long. */
export type SalesReportLine = {
  bill_date: string
  bill_number: string
  customer: string
  /** Everything on the bill, added up. */
  weightKg: number
  /** The bill's grand total, so the rows add up to total sales. */
  amount: number
}

export type SalesReport = {
  lines: SalesReportLine[]
  totals: {
    quantityPcs: number
    weightKg: number
    /** Sum of each bill's grand_total — not of the line amounts, so any
     *  discount/tax/transport on a bill is reflected in what was actually
     *  earned. */
    salesAmount: number
    billCount: number
  }
}

function parseLineItems(raw: unknown): BillLineItem[] {
  let items: unknown = raw
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items)
    } catch {
      return []
    }
  }
  return Array.isArray(items) ? (items as BillLineItem[]) : []
}

/**
 * What the business earned in a period. Sourced from bills, not sales_entries:
 * sales_entries records physical movement only and has never carried a price —
 * the money lives on the bill (line items plus its discount/tax/transport).
 *
 * Voided bills are excluded, matching customer_ledger_balance and
 * finished_goods_stock, so a cancelled invoice can't show up as revenue.
 */
export function useSalesReport(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['reports', 'sales', fromDate, toDate],
    queryFn: async (): Promise<SalesReport> => {
      const { data, error } = await supabase
        .from('bills')
        .select('bill_number, bill_date, customer_name, line_items, grand_total')
        .eq('status', 'active')
        .gte('bill_date', fromDate)
        .lte('bill_date', toDate)
        .order('bill_date', { ascending: true })
      if (error) throw error

      const bills = (data ?? []) as any[]
      const lines: SalesReportLine[] = []
      let quantityPcs = 0
      let weightKg = 0
      let salesAmount = 0

      for (const bill of bills) {
        const billTotal = Number(bill.grand_total) || 0
        salesAmount += billTotal

        // Line items are still read — that's the only place weight and piece
        // counts live — but they're folded into the bill's own row.
        let billKg = 0
        for (const item of parseLineItems(bill.line_items)) {
          billKg += Number(item.weight_kg) || 0
          quantityPcs += item.quantity_pcs != null ? Number(item.quantity_pcs) || 0 : 0
        }
        weightKg += billKg

        lines.push({
          bill_date: bill.bill_date,
          bill_number: bill.bill_number,
          customer: bill.customer_name || 'Cash Customer',
          weightKg: billKg,
          amount: billTotal,
        })
      }

      return {
        lines,
        totals: { quantityPcs, weightKg, salesAmount, billCount: bills.length },
      }
    },
  })
}
