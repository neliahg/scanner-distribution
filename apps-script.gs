/**
 * Scanner -> Google Sheet + Drive receiver
 * Paste this into Extensions > Apps Script of YOUR Google Sheet,
 * then Deploy > Manage deployments > edit > New version (Execute as: Me, Who has access: Anyone).
 *
 * Two separate pages, kept apart:
 *   warehouse.html -> tab "Warehouse"  (scan only)
 *   pod.html       -> tab "POD"        (scan + proof photo, saved in Drive "POD photos/<list>/")
 * One row per barcode per list. Re-scans update the Qty on the same row.
 */
const MODES = {
  warehouse: { sheet: 'Warehouse', photoRoot: 'Warehouse photos' },
  pod:       { sheet: 'POD',       photoRoot: 'POD photos' }
};
function mode_(d) { return MODES[d && d.mode] || MODES.warehouse; }
const HEADERS = ['Last update', 'Scanned at', 'Scanned by', 'Device', 'List',
                 'Barcode', 'Format', 'Qty', 'Note', 'Row ID', 'Photos'];
const DATA_COLS = 10;   // columns written on each row update (Photos is kept separately)
const ID_COL = 10;      // "Row ID"
const BARCODE_COL = 6;  // keep as text so leading zeros survive
const PHOTOS_COL = 11;

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const data = JSON.parse(e.postData.contents);
    const m = mode_(data);
    const sh = getSheet_(m.sheet);
    if (data.action === 'photo') return json_(savePhoto_(sh, data, m));

    const now = new Date();
    const index = indexRows_(sh);
    const appends = [];
    (data.rows || []).forEach(r => {
      const row = [
        now,
        r.scannedAt ? new Date(r.scannedAt) : '',
        data.name || '',
        data.device || '',
        r.list || '',
        String(r.code),
        r.format || '',
        Number(r.qty) || 1,
        r.note || '',
        r.id
      ];
      const at = index[String(r.id)];
      if (at) sh.getRange(at, 1, 1, DATA_COLS).setValues([row]);
      else appends.push(row);
    });
    if (appends.length) {
      const start = sh.getLastRow() + 1;
      sh.getRange(start, BARCODE_COL, appends.length, 1).setNumberFormat('@');
      sh.getRange(start, 1, appends.length, DATA_COLS).setValues(appends);
    }

    // Deletions: remove from the bottom up so row numbers stay valid
    (data.deleted || [])
      .map(id => index[String(id)])
      .filter(Boolean)
      .sort((a, b) => b - a)
      .forEach(r => sh.deleteRow(r));

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function savePhoto_(sh, d, m) {
  const folder = subFolder_(rootFolder_(m.photoRoot), d.list || 'Unsorted');
  // File name = the scanned number (e.g. 7290012345678.jpg); extra photos get _2, _3 ...
  const safeCode = String(d.code || 'item').replace(/[\\/:*?"<>|]+/g, '-');
  let name = safeCode + '.jpg', n = Math.max(1, Number(d.n) || 1);
  if (n > 1) name = safeCode + '_' + n + '.jpg';
  while (folder.getFilesByName(name).hasNext()) { n++; name = safeCode + '_' + n + '.jpg'; }
  const blob = Utilities.newBlob(Utilities.base64Decode(d.data), d.mime || 'image/jpeg', name);
  const file = folder.createFile(blob);
  file.setDescription('Barcode ' + d.code + ' · list ' + (d.list || '') + ' · photo ' + d.photoId);
  const url = file.getUrl();

  const at = indexRows_(sh)[String(d.id)];
  if (at) {
    const cell = sh.getRange(at, PHOTOS_COL);
    const prev = String(cell.getValue() || '');
    cell.setValue(prev ? prev + '\n' + url : url);
  }
  return { ok: true, url: url, linked: !!at };
}

function indexRows_(sh) {
  const last = sh.getLastRow();
  const index = {};
  if (last > 1) {
    sh.getRange(2, ID_COL, last - 1, 1).getValues()
      .forEach((r, i) => { if (r[0]) index[String(r[0])] = i + 2; });
  }
  return index;
}

function rootFolder_(name) {
  const props = PropertiesService.getScriptProperties();
  const key = 'FOLDER_' + name;
  const id = props.getProperty(key);
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const it = DriveApp.getRootFolder().getFoldersByName(name);
  const f = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(name);
  props.setProperty(key, f.getId());
  return f;
}

function subFolder_(parent, name) {
  const clean = String(name).replace(/[\\/]+/g, '-').slice(0, 100);
  const it = parent.getFoldersByName(clean);
  return it.hasNext() ? it.next() : parent.createFolder(clean);
}

// Open the Web app URL in a browser to check it is running
function doGet() {
  return json_({ ok: true, message: 'Scanner endpoint is running', photos: true, modes: Object.keys(MODES) });
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.getRange(1, BARCODE_COL, sh.getMaxRows(), 1).setNumberFormat('@');
  } else if (sh.getRange(1, PHOTOS_COL).getValue() === '') {
    sh.getRange(1, PHOTOS_COL).setValue('Photos').setFontWeight('bold');
  }
  return sh;
}

// Run this once from the editor (select "authorize" > Run) to grant Drive access.
function authorize() {
  rootFolder_(MODES.pod.photoRoot);
  getSheet_(MODES.warehouse.sheet);
  getSheet_(MODES.pod.sheet);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
