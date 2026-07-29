import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { SaiGangaLogo } from './SaiGangaLogo'

/**
 * Real sign-in — required, not optional, unlike the PIN. RLS now rejects
 * every table unless `auth.uid() is not null`, so without a session the app
 * has nothing to show anyway. Accounts are created by the business owner via
 * the Supabase dashboard; there is deliberately no public self-signup here.
 */
export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes('invalid')
          ? 'Wrong email or password'
          : signInError.message,
      )
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 dark:bg-slate-950">
      <SaiGangaLogo className="mb-6 h-16 w-auto" />

      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Email
          </span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Password
          </span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <p
          role="status"
          aria-live="polite"
          className="min-h-5 text-sm font-medium text-red-600 dark:text-red-400"
        >
          {error ?? ''}
        </p>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-teal-600 py-3 text-base font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>

        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          Don't have an account? Ask the business owner to set one up for you.
        </p>
      </form>
    </div>
  )
}
