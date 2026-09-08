import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isFutureISODate, isValidISODate, todayISODate } from '../lib/date'

/**
 * Entry-screen date state. Defaults to today, but honours a `?date=` param so
 * the dashboard's missed-day nudges can deep-link straight to the right day.
 *
 * A future `?date=` falls back to today: the param is the one route into this
 * state that never passes through DateField, so without this check a
 * hand-edited or stale URL could seed an entry screen with a date the field
 * itself would refuse.
 */
export function useEntryDate() {
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const usable = isValidISODate(dateParam) && !isFutureISODate(dateParam)
  return useState(usable ? dateParam : todayISODate())
}
