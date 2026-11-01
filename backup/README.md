# Automatic backup to Google Drive (every 15 days)

Supabase's free plan keeps **no backup** of your data. This sets up a free,
automatic backup: every 15 days a full copy of all your data is saved to a
folder called **Sai Ganga Backups** in your Google Drive.

Each backup is two files:

- `Sai_Ganga_Backup_2026-11-01.xlsx` — open it in Excel or Google Sheets. One sheet
  for each kind of data (Bills, Sales, Customer Payments, Purchases, Stock, …).
- `Sai_Ganga_Backup_2026-11-01.json` — every entry exactly as stored. Keep it; it
  is what is used to put the data back if it is ever lost.

The newest 24 backups (about one year) are kept; older ones go to the Drive bin.
If a backup fails, Google sends you an email and it tries again the next day.

Set it up **once**, from a computer. It takes about 10 minutes.

---

## Step 1 — Make a login only for backups (in Supabase)

1. Open your project at <https://supabase.com/dashboard>.
2. Left menu: **Authentication** → **Users** → **Add user** → **Create new user**.
3. Email: `backup@saiganga.app` (any email is fine — it is only a login name).
   Password: make a long password and write it down.
   Tick **Auto Confirm User**. Click **Create user**.

## Step 2 — Copy two values from Supabase

1. Left menu: **Project Settings** → **API** (or the **Connect** button at the top).
2. Copy the **Project URL** (looks like `https://xxxx.supabase.co`).
3. Copy the **anon / public** key (a long text starting with `eyJ…` or `sb_publishable_…`).

These are the same two values the app uses (`VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in Vercel).

## Step 3 — Put the backup script in your Google account

1. On the computer, sign in to Google as **susheelbahuroju@gmail.com**.
2. Open <https://script.google.com> → **New project**.
3. Click "Untitled project" at the top and name it **Sai Ganga Backup**.
4. Delete everything in the editor, then paste **all** of the file
   `backup/google-apps-script/SaiGangaBackup.gs`.
5. At the top, fill in the 4 settings:

   ```js
   var SUPABASE_URL = 'https://xxxx.supabase.co'      // from Step 2
   var SUPABASE_ANON_KEY = 'eyJ...'                     // from Step 2
   var BACKUP_LOGIN_EMAIL = 'backup@saiganga.app'      // from Step 1
   var BACKUP_LOGIN_PASSWORD = 'your-long-password'    // from Step 1
   ```

6. Click the **Save** icon (💾).

## Step 4 — Run it once

1. In the bar at the top, choose the function **setup**, then click **▶ Run**.
2. Google asks for permission: **Review permissions** → choose your account.
   It shows "Google hasn't verified this app" — that is normal for your own
   script. Click **Advanced** → **Go to Sai Ganga Backup (unsafe)** → **Allow**.
3. Wait about a minute. The log at the bottom shows **"Done. A backup was saved…"**.
4. Open Google Drive: the folder **Sai Ganga Backups** now has the first backup.
   In the app, **Settings → Download Data** now says "Automatic backup to Google Drive".

That's all. From now on it runs by itself every 15 days.

---

## Good to know

- **Take a backup now:** open the script, choose **backupNow**, click **▶ Run**.
- **Changed the backup password?** Change it at the top of the script and click Save.
- **Keep your Google account safe** (turn on 2-Step Verification): the script holds
  the backup login, which can read all your business data.
- **Manual backup any time:** in the app, **Settings → Download Data → Save Backup
  to Google Drive** makes the same Excel file from your phone.
- **Stop the automatic backup:** in the script, left menu **Triggers** (⏰) → delete
  the `dailyCheck` trigger.
