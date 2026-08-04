import { useMemo, useState } from 'react'
import { Pencil, Plus, RotateCcw, Trash2, AlertTriangle } from 'lucide-react'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import { Modal } from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Field } from '../../components/Field'
import { useToast } from '../../lib/toast'
import { LoadingState } from '../../components/States'
import { normalizePhone } from '../../lib/phone'

export type Contact = {
  id: string
  name: string
  address: string | null
  phone: string | null
  is_active: boolean
}

export type ContactInput = { name: string; address: string | null; phone: string | null }

type ContactListTabProps = {
  entityLabel: string
  useList: () => UseQueryResult<Contact[]>
  useAdd: () => UseMutationResult<Contact, Error, ContactInput>
  useUpdate: () => UseMutationResult<void, Error, ContactInput & { id: string }>
  useSetActive: () => UseMutationResult<void, Error, { id: string; is_active: boolean }>
}

export function ContactListTab({
  entityLabel,
  useList,
  useAdd,
  useUpdate,
  useSetActive,
}: ContactListTabProps) {
  const { data: contacts, isLoading } = useList()
  const addContact = useAdd()
  const updateContact = useUpdate()
  const setActive = useSetActive()
  const { showToast } = useToast()

  const [showInactive, setShowInactive] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Contact | null>(null)

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')

  // Warn before saving, with the existing contact's name, rather than only
  // finding out from a raw DB error after submitting.
  const duplicateMatch = useMemo(() => {
    const normalized = normalizePhone(phone)
    if (!normalized) return null
    return (
      (contacts ?? []).find((c) => c.id !== editing?.id && normalizePhone(c.phone ?? '') === normalized) ??
      null
    )
  }, [phone, contacts, editing])

  function openAdd() {
    setEditing(null)
    setName('')
    setAddress('')
    setPhone('')
    setModalOpen(true)
  }

  function openEdit(c: Contact) {
    setEditing(c)
    setName(c.name)
    setAddress(c.address ?? '')
    setPhone(c.phone ?? '')
    setModalOpen(true)
  }

  function describeError(error: unknown, fallback: string): string {
    // Postgres unique_violation — customers.phone has a normalized-format
    // unique index so the same number can't be typed in twice under
    // different formatting. Give a clear message instead of the raw DB error.
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return `That phone number is already used by another ${entityLabel.toLowerCase()}.`
    }
    return fallback
  }

  function handleSave() {
    if (!name.trim()) {
      showToast(`Enter a ${entityLabel.toLowerCase()} name`, 'error')
      return
    }
    if (duplicateMatch) {
      showToast(`"${duplicateMatch.name}" already has this phone number`, 'error')
      return
    }
    const input: ContactInput = {
      name: name.trim(),
      address: address.trim() || null,
      phone: phone.trim() || null,
    }

    if (editing) {
      updateContact.mutate(
        { ...input, id: editing.id },
        {
          onSuccess: () => {
            showToast(`${entityLabel} updated`)
            setModalOpen(false)
          },
          onError: (error) =>
            showToast(describeError(error, `Could not update ${entityLabel.toLowerCase()}`), 'error'),
        },
      )
    } else {
      addContact.mutate(input, {
        onSuccess: () => {
          showToast(`${entityLabel} added`)
          setModalOpen(false)
        },
        onError: (error) =>
          showToast(describeError(error, `Could not add ${entityLabel.toLowerCase()}`), 'error'),
      })
    }
  }

  function handleRemove() {
    if (!removeTarget) return
    setActive.mutate(
      { id: removeTarget.id, is_active: false },
      {
        onSuccess: () => {
          showToast('Removed')
          setRemoveTarget(null)
        },
        onError: () => showToast('Could not remove', 'error'),
      },
    )
  }

  function handleRestore(c: Contact) {
    setActive.mutate(
      { id: c.id, is_active: true },
      {
        onSuccess: () => showToast('Restored'),
        onError: () => showToast('Could not restore', 'error'),
      },
    )
  }

  const visible = (contacts ?? []).filter((c) => showInactive || c.is_active)
  const saving = addContact.isPending || updateContact.isPending

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300"
          />
          Show removed
        </label>
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          Add {entityLabel}
        </button>
      </div>

      {isLoading && <LoadingState />}

      {!isLoading && visible.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No {entityLabel.toLowerCase()}s yet. Tap "Add {entityLabel}" to create one.
        </p>
      )}

      <ul className="space-y-2">
        {visible.map((c) => (
          <li
            key={c.id}
            className={`flex items-center justify-between gap-2 rounded-lg border px-4 py-3 ${
              c.is_active
                ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                : 'border-dashed border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50'
            }`}
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900 dark:text-slate-100">{c.name}</p>
              {(c.phone || c.address) && (
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {[c.phone, c.address].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {c.is_active && (
                <button
                  type="button"
                  aria-label={`Edit ${c.name}`}
                  onClick={() => openEdit(c)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {c.is_active ? (
                <button
                  type="button"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => setRemoveTarget(c)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={`Restore ${c.name}`}
                  onClick={() => handleRestore(c)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-teal-50 hover:text-teal-600 dark:hover:bg-teal-950/50"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Modal title={editing ? `Edit ${entityLabel}` : `Add ${entityLabel}`} open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="space-y-4">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <div>
            <Field
              label="Phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
            />
            {duplicateMatch && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                "{duplicateMatch.name}" already has this phone number
              </p>
            )}
          </div>
          <Field
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || Boolean(duplicateMatch)}
            className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : editing ? 'Save Changes' : `Add ${entityLabel}`}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={removeTarget !== null}
        title={`Remove ${entityLabel.toLowerCase()}?`}
        message={
          removeTarget
            ? `Remove "${removeTarget.name}" from the active list? Past records referencing them are kept, and you can restore them later.`
            : ''
        }
        confirmLabel="Remove"
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  )
}
