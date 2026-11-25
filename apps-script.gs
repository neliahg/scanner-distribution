/**
 * Scanner -> Google Sheet receiver
 * Paste this into Extensions > Apps Script of YOUR Google Sheet,
 * then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 *
 * One row per barcode per list. Re-scans update the Qty on the same row.
 */
const SHEET_NAME = 'Scans';
const HEADERS = ['Last update', 'Scanned at', 'Scanned by', 'Device', 'List',
                 'Barcode', 'Format', 'Qty', 'Note', 'Row ID'];
const ID_COL = 10;      // "Row ID"
const BARCODE_COL = 6;  // keep as text so leading zeros survive

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const data = JSON.parse(e.postData.contents);
    const sh = getSheet_();
    const now = new Date();

    const last = sh.getLastRow();
    const index = {};
    if (last > 1) {
      sh.getRange(2, ID_COL, last - 1, 1).getValues()
        .forEach((r, i) => { if (r[0]) index[String(r[0])] = i + 2; });
    }

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
      if (at) sh.getRange(at, 1, 1, row.length).setValues([row]);
      else appends.push(row);
    });
    if (appends.length) {
      const start = sh.getLastRow() + 1;
      sh.getRange(start, BARCODE_COL, appends.length, 1).setNumberFormat('@');
      sh.getRange(start, 1, appends.length, HEADERS.length).setValues(appends);
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

// Open the Web app URL in a browser to check it is running
function doGet() {
  return json_({ ok: true, message: 'Scanner endpoint is running' });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.getRange(1, BARCODE_COL, sh.getMaxRows(), 1).setNumberFormat('@');
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
