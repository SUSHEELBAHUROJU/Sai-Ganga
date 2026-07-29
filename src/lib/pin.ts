/**
 * Optional 4-digit app lock.
 *
 * THREAT MODEL — read before relying on this. This is a *casual-access* lock:
 * it stops someone who picks up an unattended phone from browsing the app. It
 * is NOT encryption and NOT an authentication boundary:
 *
 *  - A 4-digit PIN has only 10,000 possible values. PBKDF2 with a high
 *    iteration count makes each guess cost real time, and the UI throttles
 *    failures, but an attacker who can read localStorage and run their own
 *    script can still exhaust the keyspace offline.
 *  - The PIN protects the *screen*, not the *data*. Records live in Supabase
 *    and are reachable with the anon key regardless of this lock.
 *
 * Real protection for the data requires Supabase Auth with per-user RLS, which
 * the schema is already shaped for (`created_by` on every table). This lock is
 * a convenience layer to add alongside it, not a substitute.
 *
 * The PIN is stored as a PBKDF2-SHA256 hash with a random 16-byte salt. The
 * plaintext PIN is never persisted.
 */

const STORAGE_KEY = 'sai-ganga:pin'
const THROTTLE_KEY = 'sai-ganga:pin-throttle'
const ITERATIONS = 250_000
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 60_000

export const PIN_LENGTH = 4

type StoredPin = { salt: string; hash: string; iterations: number }

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return toBase64(new Uint8Array(bits))
}

function readStored(): StoredPin | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredPin
    return parsed.salt && parsed.hash && parsed.iterations ? parsed : null
  } catch {
    return null
  }
}

export function isPinSet(): boolean {
  return readStored() !== null
}

export async function setPin(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(pin, salt, ITERATIONS)
  const stored: StoredPin = { salt: toBase64(salt), hash, iterations: ITERATIONS }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  clearThrottle()
}

export function clearPin(): void {
  localStorage.removeItem(STORAGE_KEY)
  clearThrottle()
}

/** Constant-time-ish comparison so verification doesn't leak via timing. */
function equalStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = readStored()
  if (!stored) return false
  const hash = await derive(pin, fromBase64(stored.salt), stored.iterations)
  return equalStrings(hash, stored.hash)
}

// --- Failed-attempt throttling -------------------------------------------
// Persisted so reloading the page doesn't reset the attempt counter.

type Throttle = { attempts: number; lockedUntil: number }

function readThrottle(): Throttle {
  try {
    const raw = localStorage.getItem(THROTTLE_KEY)
    if (!raw) return { attempts: 0, lockedUntil: 0 }
    return JSON.parse(raw) as Throttle
  } catch {
    return { attempts: 0, lockedUntil: 0 }
  }
}

function writeThrottle(value: Throttle) {
  try {
    localStorage.setItem(THROTTLE_KEY, JSON.stringify(value))
  } catch {
    // Storage unavailable — throttling degrades to in-session only.
  }
}

export function clearThrottle(): void {
  localStorage.removeItem(THROTTLE_KEY)
}

/** Milliseconds remaining in a lockout, or 0 when entry is allowed. */
export function lockoutRemainingMs(): number {
  const { lockedUntil } = readThrottle()
  return Math.max(lockedUntil - Date.now(), 0)
}

export function recordFailedAttempt(): { attemptsLeft: number; lockedForMs: number } {
  const current = readThrottle()
  const attempts = current.attempts + 1
  if (attempts >= MAX_ATTEMPTS) {
    const lockedUntil = Date.now() + LOCKOUT_MS
    writeThrottle({ attempts: 0, lockedUntil })
    return { attemptsLeft: 0, lockedForMs: LOCKOUT_MS }
  }
  writeThrottle({ attempts, lockedUntil: 0 })
  return { attemptsLeft: MAX_ATTEMPTS - attempts, lockedForMs: 0 }
}
