/** A backup is due once this many days have passed since the last one.
 *  Kept apart from backup.ts so the Home screen's reminder doesn't pull the
 *  whole backup code into the app's first download. */
export const BACKUP_DUE_AFTER_DAYS = 15
