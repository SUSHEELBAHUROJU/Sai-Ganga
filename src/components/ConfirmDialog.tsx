import { Modal } from './Modal'

type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} open={open} onClose={onCancel}>
      <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
      {/* Stacked and full-width on a phone so neither button is a thin strip
          near the screen edge; side by side from `sm` up as before. */}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`min-h-[44px] rounded-lg px-4 py-2.5 text-sm font-medium text-white ${
            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
