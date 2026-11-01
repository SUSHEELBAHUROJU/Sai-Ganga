/**
 * Sai Ganga — automatic backup to Google Drive, every 15 days.
 *
 * Runs inside your own Google account (script.google.com), free. Every day it
 * checks whether 15 days have passed since the last backup; if so it reads
 * every table from Supabase and saves, in the Drive folder "Sai Ganga Backups":
 *   - Sai_Ganga_Backup_<date>.xlsx  — one sheet per table, easy to read
 *   - Sai_Ganga_Backup_<date>.json  — every row exactly as stored, to restore from
 * It keeps the newest 24 backups (about one year) and deletes older ones.
 * If a backup fails, you get an email, and it tries again the next day.
 *
 * Setup: see backup/README.md. In short — fill in the 4 settings below, then
 * choose the function "setup" at the top and press Run once.
 *
 * Keep in step with src/lib/backup.ts (the app's "Download Data"): same tables,
 * sheet names and name lookups.
 */

// ===================== SETTINGS — fill these in ==========================
// Supabase -> Project Settings -> API (or "Connect"): Project URL and the
// "anon" / "publishable" key. These are the same values the app uses.
var SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co'
var SUPABASE_ANON_KEY = 'PASTE-ANON-KEY-HERE'
// The login made only for backups (Supabase -> Authentication -> Add user).
var BACKUP_LOGIN_EMAIL = 'backup@saiganga.app'
var BACKUP_LOGIN_PASSWORD = 'PASTE-PASSWORD-HERE'
// ===========================================================================

var EVERY_DAYS = 15
var KEEP_BACKUPS = 24
var FOLDER_NAME = 'Sai Ganga Backups'
var FILE_PREFIX = 'Sai_Ganga_Backup_'
var PAGE_SIZE = 1000

var BACKUP_TABLES = [
  { table: 'bills', sheet: 'Bills', order: ['created_at', 'id'] },
  { table: 'sales_entries', sheet: 'Sales', order: ['created_at', 'id'] },
  { table: 'ledger_transactions', sheet: 'Customer Payments & Dues', order: ['created_at', 'id'] },
  { table: 'production_entries', sheet: 'Production', order: ['created_at', 'id'] },
  { table: 'recycling_entries', sheet: 'Recycling', order: ['created_at', 'id'] },
  { table: 'raw_material_purchases', sheet: 'Raw Material Purchases', order: ['created_at', 'id'] },
  { table: 'raw_material_purchase_returns', sheet: 'Purchase Returns', order: ['created_at', 'id'] },
  { table: 'scrap_purchases', sheet: 'Scrap Purchases', order: ['created_at', 'id'] },
  { table: 'factory_waste_entries', sheet: 'Factory Waste', order: ['created_at', 'id'] },
  { table: 'supplier_ledger_transactions', sheet: 'Supplier Payments & Dues', order: ['created_at', 'id'] },
  { table: 'expenses', sheet: 'Expenses', order: ['created_at', 'id'] },
  { table: 'stock_counts', sheet: 'Stock Counts', order: ['created_at', 'id'] },
  { table: 'stock_count_items', sheet: 'Stock Count Items', order: ['created_at', 'id'] },
  { table: 'stock_check_my_costs', sheet: 'My Costs', order: ['count_id'] },
  { table: 'stock_check_manual_rates', sheet: 'My Costs - Material Rates', order: ['count_id', 'raw_material_type_id'] },
  { table: 'customers', sheet: 'Customers', order: ['created_at', 'id'] },
  { table: 'raw_material_suppliers', sheet: 'Suppliers', order: ['created_at', 'id'] },
  { table: 'scrap_dealers', sheet: 'Scrap Dealers', order: ['created_at', 'id'] },
  { table: 'pipe_products', sheet: 'Pipe Sizes', order: ['created_at', 'id'] },
  { table: 'raw_material_types', sheet: 'Raw Material Types', order: ['created_at', 'id'] },
  { table: 'scrap_types', sheet: 'Scrap Types', order: ['created_at', 'id'] },
  { table: 'expense_categories', sheet: 'Expense Types', order: ['created_at', 'id'] },
  { table: 'opening_balances', sheet: 'Opening Stock', order: ['created_at', 'id'] },
  { table: 'low_stock_thresholds', sheet: 'Low Stock Alerts', order: ['created_at', 'id'] },
  { table: 'company_settings', sheet: 'Bill Settings', order: ['id'] },
]

/* ============================== run these ================================ */

/** Run once after filling in the settings: takes the first backup and turns on the daily check. */
function setup() {
  checkSettings_()
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyCheck') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('dailyCheck').timeBased().everyDays(1).atHour(2).create()
  backupNow()
  Logger.log('Done. A backup was saved, and from now on one is taken every ' + EVERY_DAYS + ' days.')
}

/** Takes a backup right now. */
function backupNow() {
  runBackup_()
}

/** Called every day at about 2 AM; backs up only when 15 days have passed. */
function dailyCheck() {
  var last = PropertiesService.getScriptProperties().getProperty('lastBackupAt')
  if (last && Date.now() - Number(last) < (EVERY_DAYS - 0.5) * 86400000) return
  runBackup_()
}

/* ================================ backup ================================= */

function runBackup_() {
  try {
    checkSettings_()
    var token = login_()
    var data = {}
    BACKUP_TABLES.forEach(function (t) {
      data[t.table] = fetchTable_(token, t)
    })

    var now = new Date()
    var base = FILE_PREFIX + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    var folder = backupFolder_()
    var businessName = (data.company_settings[0] || {}).business_name || 'Sai Ganga'

    folder.createFile(saveXlsx_(buildBackupSheets_(data, now, businessName), base, folder))
    folder.createFile(Utilities.newBlob(JSON.stringify({ takenAt: now.toISOString(), tables: data }), 'application/json', base + '.json'))
    pruneOldBackups_(folder)

    PropertiesService.getScriptProperties().setProperty('lastBackupAt', String(now.getTime()))
    recordBackupTaken_(token, now)
    Logger.log('Backup saved: ' + base)
  } catch (e) {
    MailApp.sendEmail(
      Session.getEffectiveUser().getEmail(),
      'Sai Ganga backup FAILED',
      'The automatic backup to Google Drive did not work.\n\nReason: ' + (e && e.message ? e.message : e) +
        '\n\nIt will try again tomorrow. If this keeps happening, open the app -> Settings -> Download Data and save a backup by hand.',
    )
    throw e
  }
}

function checkSettings_() {
  if (SUPABASE_URL.indexOf('YOUR-PROJECT') >= 0 || SUPABASE_ANON_KEY.indexOf('PASTE') === 0 || BACKUP_LOGIN_PASSWORD.indexOf('PASTE') === 0) {
    throw new Error('Fill in the SETTINGS at the top of the script first.')
  }
}

/** Signs in as the backup login and returns its access token. */
function login_() {
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_ANON_KEY },
    payload: JSON.stringify({ email: BACKUP_LOGIN_EMAIL, password: BACKUP_LOGIN_PASSWORD }),
    muteHttpExceptions: true,
  })
  if (res.getResponseCode() !== 200) {
    throw new Error('Could not log in to Supabase as ' + BACKUP_LOGIN_EMAIL + ' (' + res.getResponseCode() + '). Check the email and password.')
  }
  return JSON.parse(res.getContentText()).access_token
}

/** Every row of one table, 1000 at a time, in a stable order. */
function fetchTable_(token, t) {
  var all = []
  for (var offset = 0; ; offset += PAGE_SIZE) {
    var url = SUPABASE_URL + '/rest/v1/' + t.table + '?select=*' +
      '&order=' + t.order.map(function (c) { return c + '.asc' }).join(',') +
      '&limit=' + PAGE_SIZE + '&offset=' + offset
    var res = UrlFetchApp.fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    })
    if (res.getResponseCode() !== 200) {
      throw new Error('Could not read ' + t.table + ' (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 200))
    }
    var page = JSON.parse(res.getContentText())
    all = all.concat(page)
    if (page.length < PAGE_SIZE) return all
  }
}

/** Tells the app a backup was taken, so its reminder resets. Ignored if the app's database isn't updated yet. */
function recordBackupTaken_(token, when) {
  UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/company_settings?id=eq.default', {
    method: 'patch',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token, Prefer: 'return=minimal' },
    payload: JSON.stringify({ last_backup_at: when.toISOString(), last_backup_by: 'auto' }),
    muteHttpExceptions: true,
  })
}

function backupFolder_() {
  var found = DriveApp.getFoldersByName(FOLDER_NAME)
  return found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME)
}

/**
 * Builds a Google Sheet with the backup's sheets, then exports it as an
 * .xlsx file (the Google Sheet itself is deleted afterwards).
 */
function saveXlsx_(sheets, base, folder) {
  var ss = SpreadsheetApp.create(base)
  var file = DriveApp.getFileById(ss.getId())
  file.moveTo(folder)
  try {
    sheets.forEach(function (s, i) {
      var sheet = i === 0 ? ss.getSheets()[0] : ss.insertSheet()
      sheet.setName(s.name)
      var width = s.rows.reduce(function (m, r) { return Math.max(m, r.length) }, 1)
      var values = s.rows.map(function (r) {
        var row = r.map(safeCellValue_)
        while (row.length < width) row.push('')
        return row
      })
      sheet.getRange(1, 1, values.length, width).setValues(values)
      if (values.length > 1) {
        sheet.setFrozenRows(1)
        sheet.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#e2e8f0')
      }
    })
    SpreadsheetApp.flush()
    var res = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    })
    if (res.getResponseCode() !== 200) throw new Error('Could not make the Excel file (' + res.getResponseCode() + ')')
    return res.getBlob().setName(base + '.xlsx')
  } finally {
    file.setTrashed(true)
  }
}

/** Text that starts like a formula (=, +, @) is kept as text, not calculated. */
function safeCellValue_(v) {
  if (typeof v === 'string' && /^[=+@]/.test(v)) return "'" + v
  return v
}

/** Keeps the newest KEEP_BACKUPS backups (each is an .xlsx and a .json); moves older ones to the bin. */
function pruneOldBackups_(folder) {
  var files = []
  var it = folder.getFiles()
  while (it.hasNext()) {
    var f = it.next()
    if (f.getName().indexOf(FILE_PREFIX) === 0) files.push(f)
  }
  var bases = []
  files.forEach(function (f) {
    var b = f.getName().replace(/\.(xlsx|json)$/, '')
    if (bases.indexOf(b) < 0) bases.push(b)
  })
  bases.sort().reverse()
  var keep = bases.slice(0, KEEP_BACKUPS)
  files.forEach(function (f) {
    if (keep.indexOf(f.getName().replace(/\.(xlsx|json)$/, '')) < 0) f.setTrashed(true)
  })
}

/* ===================== sheets (same as src/lib/backup.ts) ================ */

function byId_(rows, label) {
  var map = {}
  ;(rows || []).forEach(function (r) { map[String(r.id)] = label(r) })
  return map
}

function nameOf_(r) { return String(r.name == null ? '' : r.name) }

function buildLookups_(data) {
  var pipes = byId_(data.pipe_products, function (r) { return r.diameter_inches + '" x ' + r.weight_kg + 'kg' })
  var materials = byId_(data.raw_material_types, nameOf_)
  var scrap = byId_(data.scrap_types, nameOf_)
  var purchases = byId_(data.raw_material_purchases, function (r) {
    return (r.entry_date + ' ' + (materials[String(r.raw_material_type_id)] || '')).trim()
  })
  var items = {}
  ;[pipes, materials, scrap].forEach(function (m) { Object.keys(m).forEach(function (k) { items[k] = m[k] }) })
  return {
    customer_id: { header: 'Customer', map: byId_(data.customers, nameOf_) },
    pipe_product_id: { header: 'Pipe Size', map: pipes },
    supplier_id: { header: 'Supplier', map: byId_(data.raw_material_suppliers, nameOf_) },
    scrap_dealer_id: { header: 'Scrap Dealer', map: byId_(data.scrap_dealers, nameOf_) },
    raw_material_type_id: { header: 'Material', map: materials },
    scrap_type_id: { header: 'Scrap Type', map: scrap },
    source_scrap_type_id: { header: 'Source Scrap', map: scrap },
    linked_scrap_type_id: { header: 'Linked Scrap', map: scrap },
    category_id: { header: 'Expense Type', map: byId_(data.expense_categories, nameOf_) },
    bill_id: { header: 'Bill No', map: byId_(data.bills, function (r) { return String(r.bill_number == null ? '' : r.bill_number) }) },
    count_id: { header: 'Count Date', map: byId_(data.stock_counts, function (r) { return String(r.count_date == null ? '' : r.count_date) }) },
    purchase_id: { header: 'Purchase', map: purchases },
    item_id: { header: 'Item', map: items },
  }
}

function headerOf_(column) {
  return column.split('_').map(function (w) { return w === 'id' ? 'ID' : w.charAt(0).toUpperCase() + w.slice(1) }).join(' ')
}

function cellOf_(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number' || typeof v === 'boolean') return v
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function buildBackupSheets_(data, generatedAt, businessName) {
  var lookups = buildLookups_(data)
  var tableSheets = BACKUP_TABLES.map(function (t) {
    var rows = data[t.table] || []
    var columns = []
    rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (columns.indexOf(k) < 0) columns.push(k) }) })
    var lookupCols = columns.filter(function (c) { return lookups[c] })
    var header = lookupCols.map(function (c) { return lookups[c].header }).concat(columns.map(headerOf_))
    var body = rows.map(function (r) {
      return lookupCols
        .map(function (c) { return r[c] ? lookups[c].map[String(r[c])] || '' : '' })
        .concat(columns.map(function (c) { return cellOf_(r[c]) }))
    })
    return { name: t.sheet, rows: rows.length ? [header].concat(body) : [['No entries yet']] }
  })
  var readMe = {
    name: 'Read me',
    rows: [
      ['Sai Ganga - Full Data Backup'],
      ['Business', businessName],
      ['Taken on', Utilities.formatDate(generatedAt, Session.getScriptTimeZone(), 'd/M/yyyy, h:mm a')],
      ['Note', 'Every table of the app, one sheet each. Name columns (Customer, Pipe Size...) are added for reading. Automatic backup.'],
      [],
      ['Sheet', 'Rows'],
    ].concat(BACKUP_TABLES.map(function (t) { return [t.sheet, (data[t.table] || []).length] })),
  }
  return [readMe].concat(tableSheets)
}
