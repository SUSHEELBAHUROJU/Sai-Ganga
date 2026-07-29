export function todayISODate(): string {
  return isoDateFromDate(new Date())
}

export function isoDateFromDate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function isValidISODate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00`)
  return !Number.isNaN(d.getTime()) && isoDateFromDate(d) === value
}

export function isoDateDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return isoDateFromDate(d)
}

/** Monday of the current calendar week. */
export function startOfWeek(): string {
  const d = new Date()
  const day = d.getDay() // 0 = Sunday
  const diffToMonday = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diffToMonday)
  return isoDateFromDate(d)
}

/** First day of the current calendar month. */
export function startOfMonth(): string {
  const d = new Date()
  return isoDateFromDate(new Date(d.getFullYear(), d.getMonth(), 1))
}

/** All ISO dates from `start` to `end`, inclusive. */
export function isoDateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const cursor = new Date(`${start}T00:00:00`)
  const last = new Date(`${end}T00:00:00`)
  while (cursor <= last) {
    dates.push(isoDateFromDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

/** e.g. "1 Jul – 29 Jul 2026", or a single date when the range is one day. */
export function formatRangeLabel(fromDate: string, toDate: string): string {
  if (fromDate === toDate) return formatShortDate(fromDate)
  return `${formatShortDate(fromDate)} – ${formatShortDate(toDate)}`
}

/** Widest custom range Records/Reports will query in one go — a manually
 * widened range (e.g. years of history) would otherwise fetch an unbounded
 * number of rows across several parallel queries. */
export const MAX_QUERY_RANGE_DAYS = 366

export function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00`)
  const to = new Date(`${toDate}T00:00:00`)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/** Clamps `toDate` back so the range never exceeds MAX_QUERY_RANGE_DAYS. */
export function clampRangeEnd(fromDate: string, toDate: string): string {
  if (daysBetween(fromDate, toDate) <= MAX_QUERY_RANGE_DAYS) return toDate
  const d = new Date(`${fromDate}T00:00:00`)
  d.setDate(d.getDate() + MAX_QUERY_RANGE_DAYS)
  return isoDateFromDate(d)
}

/** Clamps `fromDate` forward so the range never exceeds MAX_QUERY_RANGE_DAYS. */
export function clampRangeStart(fromDate: string, toDate: string): string {
  if (daysBetween(fromDate, toDate) <= MAX_QUERY_RANGE_DAYS) return fromDate
  const d = new Date(`${toDate}T00:00:00`)
  d.setDate(d.getDate() - MAX_QUERY_RANGE_DAYS)
  return isoDateFromDate(d)
}

/** The `count` days ending yesterday, most recent first. */
export function recentDatesBefore(today: string, count: number): string[] {
  const dates: string[] = []
  for (let i = 1; i <= count; i++) {
    const d = new Date(`${today}T00:00:00`)
    d.setDate(d.getDate() - i)
    dates.push(isoDateFromDate(d))
  }
  return dates
}

export function formatDateLabel(dateStr: string): string {
  if (dateStr === todayISODate()) return 'Today'

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (dateStr === isoDateFromDate(yesterday)) return 'Yesterday'

  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** e.g. "26 Jul" — for compact inline mentions of a date. */
export function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** e.g. "Monday, 27 July 2026" — the dashboard header. */
export function formatFullDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
