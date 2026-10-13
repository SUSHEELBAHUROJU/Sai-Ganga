import { useState } from 'react'
import { useAllMyCosts, type StockCheckPeriod } from '../../hooks/useStockChecks'
import { generateStockCheckReportBlob, stockCheckPeriodLabel } from '../../lib/pdfGenerator'
import { useToast } from '../../lib/toast'
import { isoDateFromDate } from '../../lib/date'
import { formatQty } from '../../lib/format'

/** Helpers shared by the Weekly Report and My Costs tabs. */

export function threeMonthsAgo(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 3)
  return isoDateFromDate(d)
}

export const pct = (n: number | null) => (n === null ? '—' : `${formatQty(n)}%`)
export const wastePercent = (p: StockCheckPeriod) =>
  p.consumed_kg > 0 ? (p.waste_kg / p.consumed_kg) * 100 : null

/** The week's PDF (with the owner's saved costs when there are any), shared or downloaded. */
export function useSharePeriodPdf(period: StockCheckPeriod) {
  const { showToast } = useToast()
  const [sharing, setSharing] = useState(false)
  const { data: allMyCosts } = useAllMyCosts()

  async function share() {
    setSharing(true)
    try {
      const { file, url, filename } = generateStockCheckReportBlob(period, allMyCosts?.get(period.count_id))
      if (typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator) {
        try {
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ title: `Stock Check — ${stockCheckPeriodLabel(period)}`, files: [file] })
            return
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') return
        }
      }
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      showToast(`Downloaded ${filename}`)
    } catch {
      showToast('Could not generate the report', 'error')
    } finally {
      setSharing(false)
    }
  }

  return { share, sharing }
}
