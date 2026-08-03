/**
 * Matches the DB's normalize_phone() (supabase/migrations/20260802000000_customer_phone_unique.sql):
 * strip everything but digits, keep the last 10 — so "9876543210",
 * "+91 98765 43210", and "098765-43210" are all recognized as the same
 * number. Used to warn about a duplicate before even hitting the DB.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}
