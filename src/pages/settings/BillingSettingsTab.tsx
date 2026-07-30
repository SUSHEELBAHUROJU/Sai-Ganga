import { useState, useEffect } from 'react'
import { Field } from '../../components/Field'
import { useCompanySettings, useUpdateCompanySettings } from '../../hooks/useCompanySettings'
import { useToast } from '../../lib/toast'
import { LoadingState } from '../../components/States'
import { Check } from 'lucide-react'

export function BillingSettingsTab() {
  const { data: settings, isLoading } = useCompanySettings()
  const updateSettings = useUpdateCompanySettings()
  const { showToast } = useToast()

  const [businessName, setBusinessName] = useState('')
  const [address, setAddress] = useState('')
  const [gstNumber, setGstNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [billPrefix, setBillPrefix] = useState('SG-')
  const [nextBillNumber, setNextBillNumber] = useState('1')
  const [billStartDate, setBillStartDate] = useState('')

  useEffect(() => {
    if (settings) {
      setBusinessName(settings.business_name)
      setAddress(settings.address)
      setGstNumber(settings.gst_number)
      setPhone(settings.phone ?? '')
      setBillPrefix(settings.bill_prefix)
      setNextBillNumber(String(settings.next_bill_number))
      setBillStartDate(settings.bill_start_date)
    }
  }, [settings])

  if (isLoading) return <LoadingState />

  function handleSaveCompanyDetails(e: React.FormEvent) {
    e.preventDefault()
    if (!businessName.trim()) {
      showToast('Business name is required', 'error')
      return
    }

    updateSettings.mutate(
      {
        business_name: businessName.trim(),
        address: address.trim(),
        gst_number: gstNumber.trim(),
        phone: phone.trim() || null,
      },
      {
        onSuccess: () => showToast('Company details saved'),
        onError: () => showToast('Could not save company details', 'error'),
      },
    )
  }

  function handleSaveBillNumbering(e: React.FormEvent) {
    e.preventDefault()
    const num = parseInt(nextBillNumber, 10)
    if (isNaN(num) || num < 1) {
      showToast('Enter a valid starting bill number', 'error')
      return
    }

    updateSettings.mutate(
      {
        bill_prefix: billPrefix.trim() || 'SG-',
        next_bill_number: num,
        bill_start_date: billStartDate || new Date().toISOString().split('T')[0],
      },
      {
        onSuccess: () => showToast('Bill numbering configuration saved'),
        onError: () => showToast('Could not save bill numbering', 'error'),
      },
    )
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Company Details */}
      <form
        onSubmit={handleSaveCompanyDetails}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Company Details on Bill Header
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          These details will be printed on top of every PDF bill.
        </p>

        <Field
          label="Business Name"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="e.g. SAI GANGA POLYMER INDUSTRIES"
        />

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
            Address
          </label>
          <textarea
            rows={3}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Factory / Office Address"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="GST Number"
            value={gstNumber}
            onChange={(e) => setGstNumber(e.target.value)}
            placeholder="e.g. 36ALRPB5625Q2ZG"
          />
          <Field
            label="Phone Number (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. +91 9876543210"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={updateSettings.isPending}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {updateSettings.isPending ? 'Saving…' : 'Save Company Details'}
          </button>
        </div>
      </form>

      {/* Section 2: Bill Numbering */}
      <form
        onSubmit={handleSaveBillNumbering}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Bill Numbering & Sequence
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure prefix and next bill counter. New bills auto-increment sequentially (e.g. SG-0001, SG-0002).
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="Bill Prefix"
            value={billPrefix}
            onChange={(e) => setBillPrefix(e.target.value)}
            placeholder="e.g. SG-"
          />
          <Field
            label="Next Bill Number"
            type="number"
            min="1"
            value={nextBillNumber}
            onChange={(e) => setNextBillNumber(e.target.value)}
            placeholder="1"
          />
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Start Date
            </label>
            <input
              type="date"
              value={billStartDate}
              onChange={(e) => setBillStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Preview of Next Bill Number:{' '}
          <strong className="font-mono text-teal-600 dark:text-teal-400">
            {billPrefix || 'SG-'}
            {String(parseInt(nextBillNumber || '1', 10) || 1).padStart(4, '0')}
          </strong>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={updateSettings.isPending}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {updateSettings.isPending ? 'Saving…' : 'Save Bill Sequence'}
          </button>
        </div>
      </form>
    </div>
  )
}
