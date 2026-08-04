import { useMemo, useState } from 'react'
import { Pencil, Plus, Search, AlertTriangle } from 'lucide-react'
import { useCustomers, useAddCustomer } from '../hooks/useCustomers'
import { useRecentCustomerIds } from '../hooks/useSalesEntries'
import { Chip } from './Chip'
import { Modal } from './Modal'
import { Field } from './Field'
import { useToast } from '../lib/toast'
import { normalizePhone } from '../lib/phone'

type CustomerPickerProps = {
  value: string | null
  onChange: (customerId: string) => void
}

// A chip-per-customer list is fine for a few dozen customers but falls apart
// as the list grows — cap how many render at once and point the user at
// search instead of dumping hundreds of chips into the page.
const DISPLAY_CAP = 10

export function CustomerPicker({ value, onChange }: CustomerPickerProps) {
  const { data: customers } = useCustomers()
  const { data: recentIds } = useRecentCustomerIds()
  const addCustomer = useAddCustomer()
  const { showToast } = useToast()

  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  const activeCustomers = useMemo(() => (customers ?? []).filter((c) => c.is_active), [customers])
  const selected = activeCustomers.find((c) => c.id === value) ?? null

  const recentCustomers = useMemo(() => {
    const ids = recentIds ?? []
    return ids
      .map((id) => activeCustomers.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
  }, [recentIds, activeCustomers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return activeCustomers
    return activeCustomers.filter((c) => c.name.toLowerCase().includes(q))
  }, [activeCustomers, search])

  const recentIdSet = new Set(recentCustomers.map((c) => c.id))
  const restOfList = filtered.filter((c) => !recentIdSet.has(c.id))

  // Checked against the full list (not just active) — the DB constraint
  // covers inactive customers too, so warn before even hitting the network.
  const duplicateMatch = useMemo(() => {
    const normalized = normalizePhone(phone)
    if (!normalized) return null
    return (customers ?? []).find((c) => normalizePhone(c.phone ?? '') === normalized) ?? null
  }, [phone, customers])

  const visibleList = search ? filtered : restOfList
  const cappedList = visibleList.slice(0, DISPLAY_CAP)
  const hiddenCount = visibleList.length - cappedList.length

  function openAdd() {
    setName(search.trim())
    setPhone('')
    setAddress('')
    setAddOpen(true)
  }

  function handleAddCustomer() {
    if (!name.trim()) {
      showToast('Enter a customer name', 'error')
      return
    }
    if (duplicateMatch) {
      showToast(`"${duplicateMatch.name}" already has this phone number`, 'error')
      return
    }
    addCustomer.mutate(
      { name: name.trim(), address: address.trim() || null, phone: phone.trim() || null },
      {
        onSuccess: (customer) => {
          showToast(`${customer.name} added`)
          onChange(customer.id)
          setAddOpen(false)
          setSearch('')
        },
        onError: (error: any) => {
          // Postgres unique_violation — same phone, different formatting.
          if (error?.code === '23505') {
            showToast('That phone number already belongs to another customer — search for them above instead', 'error')
            return
          }
          showToast('Could not add customer', 'error')
        },
      },
    )
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-green-600 bg-green-50 px-4 py-3 dark:border-green-500 dark:bg-green-950/40">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900 dark:text-slate-100">{selected.name}</p>
          {(selected.phone || selected.address) && (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {[selected.phone, selected.address].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange('')}
          className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 dark:text-green-300 dark:hover:bg-green-900"
        >
          <Pencil className="h-3.5 w-3.5" />
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search or add customer"
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-base text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      {!search && recentCustomers.length > 0 && (
        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Recent
          </span>
          <div className="flex flex-wrap gap-2">
            {recentCustomers.map((c) => (
              <Chip key={c.id} label={c.name} onClick={() => onChange(c.id)} />
            ))}
          </div>
        </div>
      )}

      <div>
        {(search || restOfList.length > 0) && (
          <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
            {search ? 'Results' : 'All customers'}
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          {cappedList.map((c) => (
            <Chip key={c.id} label={c.name} onClick={() => onChange(c.id)} />
          ))}
          <button
            type="button"
            onClick={openAdd}
            className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-dashed border-teal-500 px-4 py-2 text-sm font-medium text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40"
          >
            <Plus className="h-4 w-4" />
            New Customer
          </button>
        </div>
        {hiddenCount > 0 && (
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            +{hiddenCount} more — keep typing to search for them.
          </p>
        )}
      </div>

      <Modal title="Add Customer" open={addOpen} onClose={() => setAddOpen(false)}>
        <div className="space-y-4">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <div>
            <Field
              label="Phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number (optional)"
            />
            {duplicateMatch && (
              <div className="mt-1.5 space-y-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  "{duplicateMatch.name}" already has this phone number
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onChange(duplicateMatch.id)
                    setAddOpen(false)
                    setSearch('')
                  }}
                  className="text-xs font-semibold text-teal-600 underline hover:text-teal-700 dark:text-teal-400"
                >
                  Use "{duplicateMatch.name}" instead
                </button>
              </div>
            )}
          </div>
          <Field
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address (optional)"
          />
          <button
            type="button"
            onClick={handleAddCustomer}
            disabled={addCustomer.isPending || Boolean(duplicateMatch)}
            className="min-h-[44px] w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {addCustomer.isPending ? 'Adding…' : 'Add & Select'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
