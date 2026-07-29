import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isValidISODate, todayISODate } from '../lib/date'

/**
 * Entry-screen date state. Defaults to today, but honours a `?date=` param so
 * the dashboard's missed-day nudges can deep-link straight to the right day.
 */
export function useEntryDate() {
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  return useState(isValidISODate(dateParam) ? dateParam : todayISODate())
}
