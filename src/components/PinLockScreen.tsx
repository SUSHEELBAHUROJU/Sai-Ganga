import { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { PinKeypad } from './PinKeypad'
import { PIN_LENGTH, verifyPin, recordFailedAttempt, lockoutRemainingMs, clearThrottle } from '../lib/pin'

export function PinLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [lockedForMs, setLockedForMs] = useState(lockoutRemainingMs())

  // Count the lockout down so the user can see when they may retry.
  useEffect(() => {
    if (lockedForMs <= 0) return
    const timer = setInterval(() => {
      const remaining = lockoutRemainingMs()
      setLockedForMs(remaining)
      if (remaining <= 0) {
        setError(null)
        clearInterval(timer)
      }
    }, 500)
    return () => clearInterval(timer)
  }, [lockedForMs])

  // The in-flight guard is a ref, not state, and `checking` is deliberately
  // NOT a dependency: setting a dep from inside the effect would tear it down
  // mid-verification, discard the result, and leave `checking` stuck true —
  // which disables the keypad permanently and locks the user out for good.
  const verifying = useRef(false)

  useEffect(() => {
    if (pin.length !== PIN_LENGTH || verifying.current || lockedForMs > 0) return

    verifying.current = true
    setChecking(true)
    verifyPin(pin)
      .then((ok) => {
        if (ok) {
          clearThrottle()
          onUnlock()
          return
        }
        const { attemptsLeft, lockedForMs: lockMs } = recordFailedAttempt()
        setPin('')
        if (lockMs > 0) {
          setLockedForMs(lockMs)
          setError('Too many attempts. Try again in a minute.')
        } else {
          setError(`Incorrect PIN — ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left`)
        }
      })
      .catch(() => {
        setPin('')
        setError('Could not check the PIN — please try again')
      })
      .finally(() => {
        verifying.current = false
        setChecking(false)
      })
  }, [pin, lockedForMs, onUnlock])

  const lockedSeconds = Math.ceil(lockedForMs / 1000)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 dark:bg-slate-950">
      <span className="mb-4 rounded-full bg-teal-50 p-3 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
        <Lock className="h-6 w-6" />
      </span>
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Sai Ganga</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500 dark:text-slate-400">
        {lockedForMs > 0 ? `Locked — retry in ${lockedSeconds}s` : 'Enter your PIN to continue'}
      </p>

      <PinKeypad value={pin} onChange={setPin} disabled={checking || lockedForMs > 0} />

      <p
        role="status"
        aria-live="polite"
        className="mt-5 h-5 text-sm font-medium text-red-600 dark:text-red-400"
      >
        {error ?? ''}
      </p>
    </div>
  )
}
