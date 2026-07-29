/**
 * Small validation helpers shared by the entry forms. Each returns a
 * user-facing message (never a code) or null when the value is acceptable.
 */

export function validateQuantity(
  raw: string,
  fieldLabel: string,
  { allowDecimal = true }: { allowDecimal?: boolean } = {},
): string | null {
  const text = raw.trim()
  if (!text) return `Enter ${fieldLabel}`

  const value = Number(text)
  if (!Number.isFinite(value)) return `${fieldLabel} must be a number`
  if (value < 0) return `${fieldLabel} can't be negative`
  if (value === 0) return `${fieldLabel} must be more than 0`
  if (!allowDecimal && !Number.isInteger(value)) return `${fieldLabel} must be a whole number`
  if (value > 1_000_000) return `${fieldLabel} looks too large — please check`
  return null
}

export function validateOptionalCost(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null

  const value = Number(text)
  if (!Number.isFinite(value)) return 'Cost must be a number'
  if (value < 0) return "Cost can't be negative"
  if (value > 100_000_000) return 'Cost looks too large — please check'
  return null
}

export function validateRequiredText(raw: string, fieldLabel: string): string | null {
  return raw.trim() ? null : `Enter a ${fieldLabel}`
}

/** First non-null message from a list of checks, for a single toast. */
export function firstError(...results: (string | null)[]): string | null {
  return results.find((r) => r !== null) ?? null
}
