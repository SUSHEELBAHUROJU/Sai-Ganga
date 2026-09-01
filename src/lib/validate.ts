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

/**
 * The purchase rate is mandatory — a purchase can't be saved without it. The
 * total cost is derived from it (see purchaseCost), so this is the only money
 * figure the forms ask for besides transport.
 */
export function validateCost(raw: string, fieldLabel = 'the price per kg'): string | null {
  const text = raw.trim()
  if (!text) return `Enter ${fieldLabel}`

  const value = Number(text)
  if (!Number.isFinite(value)) return `${fieldLabel} must be a number`
  if (value <= 0) return `${fieldLabel} must be more than 0`
  if (value > 100_000_000) return `${fieldLabel} looks too large — please check`
  return null
}

/** Transport charges are optional and default to 0 — only reject a bad number. */
export function validateOptionalTransport(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null

  const value = Number(text)
  if (!Number.isFinite(value)) return 'Transport charges must be a number'
  if (value < 0) return "Transport charges can't be negative"
  if (value > 100_000_000) return 'Transport charges look too large — please check'
  return null
}

export function validateRequiredText(raw: string, fieldLabel: string): string | null {
  return raw.trim() ? null : `Enter a ${fieldLabel}`
}

/** First non-null message from a list of checks, for a single toast. */
export function firstError(...results: (string | null)[]): string | null {
  return results.find((r) => r !== null) ?? null
}
