import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, CircleAlert, CloudUpload, Download, ShieldCheck } from 'lucide-react'
import { useCompanySettings } from '../../hooks/useCompanySettings'
import {
  BACKUP_DUE_AFTER_DAYS,
  BACKUP_TABLES,
  backupFileBase,
  buildBackupSheets,
  fetchBackupData,
  recordBackupTaken,
} from '../../lib/backup'
import { buildXlsx } from '../../lib/xlsxWriter'
import { useToast } from '../../lib/toast'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Whole days since an ISO timestamp. */
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function saveToDevice(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Full backup in one Excel file — every table of the app, one sheet each —
 * to download or send straight to Google Drive from the phone's share sheet.
 * The automatic 15-day Google Drive backup (see backup/README.md) makes the
 * same file; this screen shows when the last one of either kind was taken.
 */
export function BackupTab() {
  const { data: company } = useCompanySettings()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [progress, setProgress] = useState<string | null>(null)

  const lastAt = company?.last_backup_at ?? null
  const days = lastAt ? daysSince(lastAt) : null
  const due = days === null || days >= BACKUP_DUE_AFTER_DAYS
  const canShareFiles =
    typeof navigator !== 'undefined' &&
    'canShare' in navigator &&
    navigator.canShare({ files: [new File([''], 'x.xlsx', { type: XLSX_TYPE })] })

  async function makeBackup(mode: 'share' | 'download') {
    setProgress('Reading data…')
    try {
      const now = new Date()
      const data = await fetchBackupData((done, total) => setProgress(`Reading data ${done} of ${total}…`))
      setProgress('Making Excel file…')
      const bytes = buildXlsx(buildBackupSheets(data, now, company?.business_name ?? 'Sai Ganga'))
      const filename = `${backupFileBase(now)}.xlsx`
      const blob = new Blob([bytes as BlobPart], { type: XLSX_TYPE })

      if (mode === 'share' && canShareFiles) {
        try {
          await navigator.share({ title: filename, files: [new File([blob], filename, { type: XLSX_TYPE })] })
        } catch (err) {
          // Closing the share sheet isn't a failure, but nothing was saved either.
          if ((err as { name?: string })?.name === 'AbortError') {
            showToast('Backup not saved — the share was closed', 'error')
            return
          }
          throw err
        }
      } else {
        saveToDevice(blob, filename)
      }

      await recordBackupTaken('app')
      queryClient.invalidateQueries({ queryKey: ['company_settings'] })
      const rows = Object.values(data).reduce((sum, r) => sum + r.length, 0)
      showToast(`Backup saved — ${rows} entries in ${BACKUP_TABLES.length} sheets`)
    } catch {
      showToast('Could not make the backup. Check your internet and try again.', 'error')
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* When was the last backup? */}
      <div
        className={`flex items-center gap-3 rounded-2xl border p-4 ${
          due
            ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
            : 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
        }`}
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            due
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
              : 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
          }`}
        >
          {due ? <CircleAlert className="h-5 w-5" /> : <CalendarCheck className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {lastAt === null
              ? 'No backup taken yet'
              : `Last backup: ${new Date(lastAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} (${days === 0 ? 'today' : `${days} ${days === 1 ? 'day' : 'days'} ago`})`}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {lastAt && (company?.last_backup_by === 'auto' ? 'Automatic backup to Google Drive. ' : 'Taken from this app. ')}
            {due ? 'Please take a backup now.' : `Next backup in ${BACKUP_DUE_AFTER_DAYS - (days ?? 0)} days.`}
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100">Full backup in one Excel file</p>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            All your data — bills, sales, payments, purchases, stock, expenses and settings — in one file, one sheet
            each. Keep it in Google Drive. It is the only copy of your data outside this app.
          </p>
        </div>

        <button
          type="button"
          onClick={() => makeBackup('share')}
          disabled={progress !== null}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-teal-600 text-base font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          <CloudUpload className="h-5 w-5" />
          {progress ?? (canShareFiles ? 'Save Backup to Google Drive' : 'Download Backup (Excel)')}
        </button>
        {canShareFiles && (
          <>
            <p className="-mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
              Then choose <span className="font-semibold">Drive</span> in the share list.
            </p>
            <button
              type="button"
              onClick={() => makeBackup('download')}
              disabled={progress !== null}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Download className="h-4 w-4" />
              Download to this phone instead
            </button>
          </>
        )}
      </div>

      <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
        <div className="space-y-1 text-slate-600 dark:text-slate-300">
          <p className="font-semibold text-slate-900 dark:text-slate-100">Automatic backup every {BACKUP_DUE_AFTER_DAYS} days</p>
          <p>
            Once set up, a backup is saved to the <span className="font-semibold">Sai Ganga Backups</span> folder in
            your Google Drive every {BACKUP_DUE_AFTER_DAYS} days, without opening the app.
            {company?.last_backup_by === 'auto' ? ' It is working.' : ' It is set up once, from a computer.'}
          </p>
        </div>
      </div>
    </div>
  )
}
