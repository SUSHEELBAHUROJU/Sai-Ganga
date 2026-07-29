import { formatKgWithPcs } from '../lib/format'

type AmountKgPcsProps = {
  kg: number
  pcs: number
  className?: string
}

/**
 * The business measures everything by weight, so kg is always the primary
 * figure and piece count rides along as a smaller secondary note — used
 * everywhere production/sales/stock quantities are displayed.
 */
export function AmountKgPcs({ kg, pcs, className }: AmountKgPcsProps) {
  const { kgText, pcsText } = formatKgWithPcs(kg, pcs)
  return (
    <span className={`whitespace-nowrap ${className ?? ''}`}>
      <span className="font-semibold text-slate-900 dark:text-slate-100">{kgText}</span>{' '}
      <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{pcsText}</span>
    </span>
  )
}
