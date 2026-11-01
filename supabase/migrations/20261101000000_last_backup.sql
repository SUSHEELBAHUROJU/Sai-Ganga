-- When the last full backup was taken, and how: 'app' (Download Data in
-- Settings) or 'auto' (the Google Drive backup script). The app reminds the
-- owner once BACKUP_DUE_AFTER_DAYS have passed — on the free plans nothing
-- else keeps a copy of the data.
alter table company_settings add column if not exists last_backup_at timestamptz;
alter table company_settings add column if not exists last_backup_by text;
