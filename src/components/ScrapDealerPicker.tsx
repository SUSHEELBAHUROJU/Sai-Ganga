import { useMemo, useState } from 'react'
import { Pencil, Plus, Search } from 'lucide-react'
import { useScrapDealers, useAddScrapDealer } from '../hooks/useScrapDealers'
import { Chip } from './Chip'
import { Modal } from './Modal'
import { Field } from './Field'
import { useToast } from '../lib/toast'

type ScrapDealerPickerProps = {
  value: string | null
  onChange: (dealerId: string) => void
}

// Same reasoning as CustomerPicker's DISPLAY_CAP: a chip-per-dealer list
// works for a handful of dealers but shouldn't render an unbounded list.
const DISPLAY_CAP = 10

export function ScrapDealerPicker({ value, onChange }: ScrapDealerPickerProps) {
  const { data: dealers } = useScrapDealers()
  const addDealer = useAddScrapDealer()
  const { showToast } = useToast()

  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  const activeDealers = useMemo(() => (dealers ?? []).filter((d) => d.is_active), [dealers])
  const selected = activeDealers.find((d) => d.id === value) ?? null

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return activeDealers
    return activeDealers.filter((d) => d.name.toLowerCase().includes(q))
  }, [activeDealers, search])

  const cappedList = filtered.slice(0, DISPLAY_CAP)
  const hiddenCount = filtered.length - cappedList.length

  function openAdd() {
    setName(search.trim())
    setPhone('')
    setAddress('')
    setAddOpen(true)
  }

  function handleAddDealer() {
    if (!name.trim()) {
      showToast('Enter a dealer name', 'error')
      return
    }
    addDealer.mutate(
      { name: name.trim(), address: address.trim() || null, phone: phone.trim() || null },
      {
        onSuccess: (dealer) => {
          showToast(`${dealer.name} added`)
          onChange(dealer.id)
          setAddOpen(false)
        },
        onError: () => showToast('Could not add dealer', 'error'),
      },
    )
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-orange-500 bg-orange-50 px-4 py-3 dark:border-orange-500 dark:bg-orange-950/30">
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
          className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100 dark:text-orange-300 dark:hover:bg-orange-900"
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
          placeholder="Search or add dealer"
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-base text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {cappedList.map((d) => (
          <Chip key={d.id} label={d.name} onClick={() => onChange(d.id)} />
        ))}
        <button
          type="button"
          onClick={openAdd}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-teal-500 px-4 py-2 text-sm font-medium text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40"
        >
          <Plus className="h-4 w-4" />
          New Dealer
        </button>
      </div>
      {hiddenCount > 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          +{hiddenCount} more — keep typing to search for them.
        </p>
      )}

      <Modal title="Add Scrap Dealer" open={addOpen} onClose={() => setAddOpen(false)}>
        <div className="space-y-4">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Field
            label="Phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number (optional)"
          />
          <Field
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address (optional)"
          />
          <button
            type="button"
            onClick={handleAddDealer}
            disabled={addDealer.isPending}
            className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {addDealer.isPending ? 'Adding…' : 'Add & Select'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
