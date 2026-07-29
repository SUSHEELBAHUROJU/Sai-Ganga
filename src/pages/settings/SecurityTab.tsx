import { useState } from 'react'
import { Lock, ShieldCheck, ShieldOff } from 'lucide-react'
import { PinKeypad } from '../../components/PinKeypad'
import { Modal } from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { PIN_LENGTH, isPinSet, setPin, clearPin, verifyPin } from '../../lib/pin'
import { useToast } from '../../lib/toast'

type Stage = 'current' | 'new' | 'confirm'

export function SecurityTab() {
  const [pinActive, setPinActive] = useState(isPinSet)
  const [modalOpen, setModalOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)

  const [stage, setStage] = useState<Stage>('new')
  const [entry, setEntry] = useState('')
  const [firstEntry, setFirstEntry] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()

  function openChange() {
    setStage(pinActive ? 'current' : 'new')
    setEntry('')
    setFirstEntry('')
    setError(null)
    setModalOpen(true)
  }

  async function handleEntryChange(next: string) {
    setEntry(next)
    setError(null)
    if (next.length !== PIN_LENGTH || busy) return

    if (stage === 'current') {
      setBusy(true)
      const ok = await verifyPin(next)
      setBusy(false)
      if (!ok) {
        setError('That PIN is incorrect')
        setEntry('')
        return
      }
      setStage('new')
      setEntry('')
      return
    }

    if (stage === 'new') {
      setFirstEntry(next)
      setStage('confirm')
      setEntry('')
      return
    }

    // confirm
    if (next !== firstEntry) {
      setError("Those PINs don't match — start again")
      setStage('new')
      setEntry('')
      setFirstEntry('')
      return
    }

    setBusy(true)
    try {
      await setPin(next)
      setPinActive(true)
      setModalOpen(false)
      showToast(pinActive ? 'PIN changed' : 'PIN lock enabled')
    } catch {
      setError('Could not save the PIN')
    } finally {
      setBusy(false)
    }
  }

  function handleDisable() {
    clearPin()
    setPinActive(false)
    setDisableOpen(false)
    showToast('PIN lock disabled')
  }

  const stageCopy: Record<Stage, string> = {
    current: 'Enter your current PIN',
    new: pinActive ? 'Enter a new 4-digit PIN' : 'Choose a 4-digit PIN',
    confirm: 'Re-enter the PIN to confirm',
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <span
          className={`shrink-0 rounded-full p-2.5 ${
            pinActive
              ? 'bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400'
              : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
          }`}
        >
          {pinActive ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900 dark:text-slate-100">
            PIN lock is {pinActive ? 'on' : 'off'}
          </p>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {pinActive
              ? 'The app asks for your 4-digit PIN each time it opens.'
              : 'Add a 4-digit PIN so the app asks before opening.'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openChange}
          className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <Lock className="h-4 w-4" />
          {pinActive ? 'Change PIN' : 'Set up PIN'}
        </button>
        {pinActive && (
          <button
            type="button"
            onClick={() => setDisableOpen(true)}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
          >
            Turn off PIN
          </button>
        )}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-medium">What the PIN does and doesn't cover</p>
        <p className="mt-1">
          It keeps the app closed to someone who picks up this device, and it's stored only as a
          scrambled hash — never as the digits you typed. It does not encrypt your records, and it
          applies to this device only. Full protection needs proper sign-in accounts, which the
          database is already prepared for.
        </p>
      </div>

      <Modal
        title={pinActive && stage === 'current' ? 'Confirm current PIN' : 'Set PIN'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <div className="flex flex-col items-center">
          <p className="mb-5 text-sm text-slate-600 dark:text-slate-400">{stageCopy[stage]}</p>
          <PinKeypad value={entry} onChange={handleEntryChange} disabled={busy} />
          <p
            role="status"
            aria-live="polite"
            className="mt-4 h-5 text-sm font-medium text-red-600 dark:text-red-400"
          >
            {error ?? ''}
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={disableOpen}
        title="Turn off PIN lock?"
        message="The app will open without asking for a PIN. You can set one up again at any time."
        confirmLabel="Turn off"
        onConfirm={handleDisable}
        onCancel={() => setDisableOpen(false)}
      />
    </div>
  )
}
