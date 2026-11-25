/* Shared logic for both pages. Each page sets window.APP before loading this file:
   { mode: "warehouse" | "pod", label: "...", photos: bool, photoRequired: bool } */
const APP = Object.assign({ mode: "warehouse", label: "", photos: false, photoRequired: false }, window.APP || {});
/* ================= SETTINGS (owner edits this) ================= */
const CONFIG = {
  // Paste the Web app URL from Google Apps Script (ends with /exec):
  SHEET_URL: "https://script.google.com/macros/s/AKfycbwm_H_4cm4yr8fexgo6WphoPPd3wViwTKbNdxHWcwpvR7NnmalIuKDnf7s-GmtmvU8h/exec",
};
/* =============================================================== */

const KEY = "scanner." + APP.mode + ".v1";   // each page keeps its own data
const $ = s => document.querySelector(s);
const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2));

function newListObj(name){ return { id: uid(), name, created: new Date().toISOString(), items: [] }; }
const pad = n => String(n).padStart(2, "0");
const fmtDate = iso => { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const fmtTime = iso => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const fmtStamp = iso => fmtDate(iso) + " " + fmtTime(iso);
function defaultListName(){
  const d = new Date().toISOString();
  return "רשימה " + fmtDate(d) + " " + fmtTime(d).slice(0,5);
}
function load(){
  try{
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.lists) && s.lists.length) { s.deleted = s.deleted || []; return s; }
  }catch(e){}
  const l = newListObj(defaultListName());
  return { device: uid().slice(0,8), name: "", lists: [l], current: l.id, deleted: [] };
}
let state = load();
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){ toast("אין מספיק מקום בטלפון"); } }
function cur(){ return state.lists.find(l => l.id === state.current) || state.lists[0]; }
function touch(it){ it.v = (it.v || 0) + 1; it.updatedAt = new Date().toISOString(); }

/* ---------- items ---------- */
let flashId = null;
function addCode(raw, format){
  const code = String(raw).trim();
  if (!code) return null;
  const list = cur();
  const idx = list.items.findIndex(i => i.code === code);
  let it;
  if (idx >= 0){
    it = list.items.splice(idx, 1)[0];
    it.qty++; it.lastScannedAt = new Date().toISOString(); touch(it);
  } else {
    it = { id: uid(), code, format: format || "ידני", qty: 1, note: "",
           scannedAt: new Date().toISOString(), v: 1, sv: 0 };
  }
  list.items.unshift(it);
  flashId = it.id;
  save(); render(); scheduleSync();
  return it;
}
function setQty(it, q){
  if (q < 1){ removeItem(it); return; }
  it.qty = q; touch(it); save(); render(); scheduleSync();
}
function removeItem(it){
  if (!confirm(`למחוק את ${it.code}?`)) return;
  const list = cur();
  list.items = list.items.filter(i => i !== it);
  state.deleted.push(it.id);
  dropPhotos(it);
  save(); render(); scheduleSync();
}
function itemMenu(it){
  const n = prompt(`הערה עבור ${it.code} (השאירו ריק כדי לנקות).\nהקלידו מחק כדי להסיר את השורה.`, it.note || "");
  if (n === null) return;
  if (["מחק","DELETE"].includes(n.trim().toUpperCase())){ removeItem(it); return; }
  it.note = n.trim(); touch(it); save(); render(); scheduleSync();
}

/* ---------- render ---------- */
function render(){
  const sel = $("#listSel");
  sel.innerHTML = "";
  state.lists.forEach(l => {
    const o = document.createElement("option");
    o.value = l.id; o.textContent = l.name; if (l.id === state.current) o.selected = true;
    sel.appendChild(o);
  });
  const list = cur();
  const ul = $("#items");
  ul.innerHTML = "";
  if (!list.items.length){
    const e = document.createElement("li"); e.className = "empty";
    e.textContent = "עדיין אין סריקות. לחצו על סריקה כדי להתחיל.";
    ul.appendChild(e);
  }
  list.items.forEach(it => {
    const li = document.createElement("li");
    li.className = "item" + (it.id === flashId ? " flash" : "");
    const info = document.createElement("div"); info.className = "grow";
    const c = document.createElement("div"); c.className = "code"; c.textContent = it.code;
    const m = document.createElement("div"); m.className = "meta";
    m.textContent = "🕒 " + fmtStamp(it.scannedAt)
      + (it.v !== it.sv && CONFIG.SHEET_URL ? " · ממתין לשמירה" : "");
    info.append(c, m);
    if (it.qty > 1 && it.lastScannedAt){ const d = document.createElement("div"); d.className = "dup";
      d.textContent = `נסרק ${it.qty} פעמים · אחרונה: ${fmtStamp(it.lastScannedAt)}`; info.appendChild(d); }
    if (it.note){ const n = document.createElement("div"); n.className = "note"; n.textContent = "📝 " + it.note; info.appendChild(n); }
    const q = document.createElement("div"); q.className = "qty";
    const minus = document.createElement("button"); minus.textContent = "−"; minus.onclick = () => setQty(it, it.qty - 1);
    const val = document.createElement("span"); val.textContent = it.qty;
    const plus = document.createElement("button"); plus.textContent = "+"; plus.onclick = () => setQty(it, it.qty + 1);
    q.append(minus, val, plus);
    const more = document.createElement("button"); more.className = "more"; more.textContent = "✎";
    more.setAttribute("aria-label", "הערה או מחיקה"); more.onclick = () => itemMenu(it);
    const needsPhoto = APP.photoRequired && !(it.photos && it.photos.length);
    if (needsPhoto){ const w = document.createElement("div"); w.className = "missing"; w.textContent = "⚠ חסרה תמונת הוכחה"; info.appendChild(w); }
    if (needsPhoto) li.classList.add("nophoto");
    const cam = document.createElement("button"); cam.className = "more"; cam.textContent = "📷";
    cam.setAttribute("aria-label", "צילום תמונה לפריט"); cam.onclick = () => pickPhotoFor(it);
    if (it.photos && it.photos.length){
      const ph = document.createElement("div"); ph.className = "photos";
      it.photos.forEach((p, n) => {
        if (p.url){ const a = document.createElement("a"); a.href = p.url; a.target = "_blank"; a.rel = "noopener";
          a.textContent = `📷 תמונה ${n + 1}`; ph.appendChild(a); }
        else { const sp = document.createElement("span");
          sp.textContent = `📷 תמונה ${n + 1}${p.lost ? " (אבדה)" : CONFIG.SHEET_URL ? " · ממתינה" : ""}`; ph.appendChild(sp); }
      });
      info.appendChild(ph);
    }
    if (APP.photos) li.append(info, q, cam, more); else li.append(info, q, more);
    ul.appendChild(li);
  });
  flashId = null;
  const total = list.items.reduce((s, i) => s + i.qty, 0);
  $("#countText").textContent = `${list.items.length} פריטים`;
  const missing = APP.photoRequired ? list.items.filter(i => !(i.photos && i.photos.length)).length : 0;
  $("#totalText").textContent = missing ? `⚠ ${missing} בלי תמונה` : `סה״כ סריקות: ${total}`;
  $("#totalText").classList.toggle("bad", !!missing);
  $("#setupNote").classList.toggle("hidden", !!CONFIG.SHEET_URL);
  updateStatus();
}

/* ---------- lists ---------- */
$("#listSel").onchange = e => { state.current = e.target.value; save(); render(); };
$("#newList").onclick = () => {
  const name = prompt("שם לרשימה החדשה:", defaultListName());
  if (name === null) return;
  const l = newListObj(name.trim() || defaultListName());
  state.lists.unshift(l); state.current = l.id; save(); render();
};
$("#listMenu").onclick = () => {
  const list = cur();
  const choice = prompt(
    `רשימה: ${list.name}\n\n1 = שינוי שם הרשימה\n2 = מחיקת הרשימה\n3 = השם שלך (יופיע בגיליון)` +
    (state.name ? ` – כרגע "${state.name}"` : ""), "");
  if (choice === "1"){
    const n = prompt("שם חדש:", list.name);
    if (n && n.trim()){ list.name = n.trim(); list.items.forEach(touch); save(); render(); scheduleSync(); }
  } else if (choice === "2"){
    if (!confirm(`למחוק את "${list.name}" ואת ${list.items.length} הפריטים שבה?`)) return;
    list.items.forEach(i => { state.deleted.push(i.id); dropPhotos(i); });
    state.lists = state.lists.filter(l => l !== list);
    if (!state.lists.length) state.lists.push(newListObj(defaultListName()));
    state.current = state.lists[0].id; save(); render(); scheduleSync();
  } else if (choice === "3"){
    const n = prompt("השם שלך:", state.name || "");
    if (n !== null){ state.name = n.trim(); state.lists.forEach(l => l.items.forEach(touch)); save(); render(); scheduleSync(); }
  }
};

/* ---------- manual entry ---------- */
$("#manualForm").onsubmit = e => {
  e.preventDefault();
  const inp = $("#manualInput");
  const it = addCode(inp.value, "ידני");
  if (it){ toast("נוסף"); inp.value = ""; inp.blur(); maybeAskPhoto(it); }
};

/* ---------- scanner ---------- */
let scanner = null, lastCode = "", scanCooldown = false, audioCtx = null, lastItem = null;
let cameras = [], camIdx = -1;
const CAM_KEY = "scanner.camera";
function beep(){
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 1100; g.gain.value = 0.15;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.09);
  }catch(e){}
}
function formats(){
  const F = Html5QrcodeSupportedFormats;
  return [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93,
          F.ITF, F.CODABAR, F.QR_CODE, F.DATA_MATRIX];
}
function updateCounter(){ $("#counter").textContent = cur().items.length; }
function logScan(code, dup){
  const row = document.createElement("div");
  row.className = "scan" + (dup ? " dup" : "");
  const c = document.createElement("span"); c.className = "c"; c.textContent = (dup ? "⚠ " : "") + code;
  const t = document.createElement("span"); t.className = "t"; t.textContent = fmtTime(new Date().toISOString());
  row.append(c, t);
  $("#scanLog").prepend(row);
}
function onScan(text, result){
  if (scanCooldown) return;             // short pause between reads
  if (text === lastCode) return;        // same label still in front of the camera
  lastCode = text;
  scanCooldown = true;
  setTimeout(() => { scanCooldown = false; }, 500);
  let fmt = "";
  try{ fmt = result.result.format.formatName; }catch(e){}
  const it = addCode(text, fmt);
  lastItem = it; if ($("#photoForLast")) $("#photoForLast").disabled = false;
  const msg = $("#scanMsg");
  $("#lastCode").textContent = text;
  updateCounter();
  if (it.qty > 1){
    beep(); setTimeout(beep, 160); if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
    msg.className = "warn";
    msg.textContent = `⚠ כבר נסרק – זו הסריקה ה-${it.qty}`;
    logScan(text, true);
  } else {
    beep(); if (navigator.vibrate) navigator.vibrate(80);
    msg.className = "ok";
    msg.textContent = `✓ נסרק · ${fmtTime(it.scannedAt)}`;
    logScan(text, false);
  }
  maybeAskPhoto(it);
}
// Pick the main back camera: label says back/rear/environment (or Hebrew "אחור"),
// avoiding ultra-wide/tele lenses that focus badly up close.
function pickCamera(devs){
  let saved = null; try{ saved = localStorage.getItem(CAM_KEY); }catch(e){}
  const si = devs.findIndex(d => d.id === saved);
  if (si >= 0) return si;
  const back = devs.map((d, i) => ({ l: (d.label || "").toLowerCase(), i }))
    .filter(x => /back|rear|environment|אחור/.test(x.l));
  const main = back.find(x => !/wide|ultra|tele|zoom|רחב|טלה/.test(x.l));
  if (main) return main.i;
  if (back.length) return back[0].i;
  return -1; // unknown labels: let the browser choose the back camera
}
const scanConfig = {
  fps: 20,
  qrbox: (w, h) => { const bw = Math.max(120, Math.min(Math.floor(w * 0.85), 320));
                     return { width: bw, height: Math.max(80, Math.min(Math.floor(bw * 0.6), Math.floor(h * 0.8))) }; }
};
async function startCamera(){
  const msg = $("#scanMsg");
  const source = camIdx >= 0 && cameras[camIdx] ? cameras[camIdx].id : { facingMode: "environment" };
  try{
    await scanner.start(source, scanConfig, onScan, () => {});
  }catch(e){
    msg.className = "";
    msg.textContent = "אין גישה למצלמה (" + (e && e.message ? e.message : e) +
      "). השתמשו ב״צילום״, או סגרו והקלידו את המספר.";
  }
}
$("#scanBtn").onclick = async () => {
  try{ audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); }catch(e){}
  $("#scanView").hidden = false;
  lastCode = ""; scanCooldown = false; lastItem = null; if ($("#photoForLast")) $("#photoForLast").disabled = true;
  $("#lastCode").textContent = ""; $("#scanLog").innerHTML = ""; updateCounter();
  const msg = $("#scanMsg"); msg.className = "";
  msg.textContent = "מוכן לסריקה – כוונו לברקוד של מספר האספקה או החבילה הזרה";
  if (typeof Html5Qrcode === "undefined"){ msg.textContent = "הסורק לא נטען – בדקו את החיבור לאינטרנט או הקלידו את המספר."; return; }
  scanner = new Html5Qrcode("reader", { verbose:false, formatsToSupport: formats(),
    experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
  try{
    cameras = await Html5Qrcode.getCameras();   // also asks for camera permission
  }catch(e){ cameras = []; }
  camIdx = cameras.length ? pickCamera(cameras) : -1;
  $("#switchCam").hidden = cameras.length < 2;
  await startCamera();
};
$("#switchCam").onclick = async () => {
  if (!scanner || cameras.length < 2) return;
  try{ if (scanner.isScanning) await scanner.stop(); }catch(e){}
  camIdx = (camIdx + 1) % cameras.length;
  try{ localStorage.setItem(CAM_KEY, cameras[camIdx].id); }catch(e){}
  toast(cameras[camIdx].label || `מצלמה ${camIdx + 1}`);
  await startCamera();
};
async function closeScanner(){
  if (scanner){
    try{ if (scanner.isScanning) await scanner.stop(); scanner.clear(); }catch(e){}
    scanner = null;
  }
  $("#scanView").hidden = true;
}
$("#doneBtn").onclick = closeScanner;
$("#photoInput").onchange = async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!f) return;
  const msg = $("#scanMsg");
  const tmp = new Html5Qrcode("fileReader", { verbose:false, formatsToSupport: formats() });
  try{
    const text = await tmp.scanFile(f, false);
    lastCode = ""; scanCooldown = false;
    onScan(text, null);
  }catch(err){
    msg.className = ""; msg.textContent = "לא נמצא ברקוד בתמונה – נסו מקרוב יותר ובתאורה טובה.";
  }finally{ try{ tmp.clear(); }catch(e){} }
};

/* ---------- photos (kept in IndexedDB until uploaded to Drive) ---------- */
const idb = (() => {
  let dbp;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("scanner-photos-" + APP.mode, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("p");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = (mode, fn) => db().then(d => new Promise((res, rej) => {
    const t = d.transaction("p", mode); const r = fn(t.objectStore("p"));
    t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error);
  }));
  return { get: k => tx("readonly", s => s.get(k)),
           put: (k, v) => tx("readwrite", s => s.put(v, k)),
           del: k => tx("readwrite", s => s.delete(k)) };
})();
async function compressImage(file, max = 1600, q = 0.8){
  const url = URL.createObjectURL(file);
  try{
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(b => res(b || file), "image/jpeg", q));
  }catch(e){ return file; }
  finally{ URL.revokeObjectURL(url); }
}
let photoTarget = null;
function pickPhotoFor(it){ photoTarget = it; $("#itemPhoto").click(); }
async function addPhoto(it, file){
  try{
    const blob = await compressImage(file);
    const pid = uid();
    await idb.put(pid, blob);
    it.photos = it.photos || [];
    it.photos.push({ pid, takenAt: new Date().toISOString() });
    save(); render(); scheduleSync(300);
    toast(`התמונה נשמרה (${it.code})`);
  }catch(e){ toast("לא ניתן לשמור את התמונה בטלפון"); }
}
function dropPhotos(it){ (it.photos || []).forEach(p => { if (!p.url) idb.del(p.pid).catch(() => {}); }); }
function photoQueue(){
  const q = [];
  state.lists.forEach(l => l.items.forEach(i => (i.photos || []).forEach(p => { if (!p.url && !p.lost) q.push({ l, i, p }); })));
  return q;
}
const blobToBase64 = b => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(b);
});
async function uploadPhotos(){
  for (const { l, i, p } of photoQueue()){
    if (!i.sv) continue;                       // row must reach the sheet first
    const blob = await idb.get(p.pid);
    if (!blob){ p.lost = true; save(); continue; }
    const res = await fetch(CONFIG.SHEET_URL, { method: "POST", body: JSON.stringify({
      action: "photo", mode: APP.mode, id: i.id, photoId: p.pid, n: i.photos.indexOf(p) + 1, list: l.name, code: i.code,
      mime: blob.type || "image/jpeg", takenAt: p.takenAt, data: await blobToBase64(blob) }) });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "Photo error");
    if (!j.url) throw new Error("צריך לעדכן את הסקריפט בגיליון כדי לשמור תמונות");
    p.url = j.url; save();
    idb.del(p.pid).catch(() => {});
    render();
  }
}
$("#itemPhoto").onchange = e => {
  const f = e.target.files && e.target.files[0]; e.target.value = "";
  const it = photoTarget; photoTarget = null;
  if (f && it){ addPhoto(it, f); hidePhotoPrompt(); }
  resumeCamera();
};
$("#itemPhoto").addEventListener("cancel", () => { photoTarget = null; resumeCamera(); });
if ($("#photoForLast")) $("#photoForLast").onclick = () => {
  if (!lastItem) return;
  pickPhotoFor(lastItem);                    // open the picker first (needs the tap)
  pauseCamera();
};
// POD: after a new item is scanned or typed, ask for the proof photo.
// Browsers only open the camera after a tap, so we show a big button to tap.
let promptItem = null;
function maybeAskPhoto(it){
  if (!APP.photoRequired || !it || (it.photos && it.photos.length)) return;
  promptItem = it;
  $("#ppCode").textContent = it.code;
  $("#photoPrompt").hidden = false;
  pauseCamera();
}
function hidePhotoPrompt(){ $("#photoPrompt").hidden = true; promptItem = null; }
if ($("#photoPrompt")){
  $("#ppTake").onclick = () => { if (promptItem) pickPhotoFor(promptItem); };
  $("#ppLater").onclick = () => { hidePhotoPrompt(); resumeCamera(); };
}
$("#photoInput").addEventListener("click", pauseCamera);
$("#photoInput").addEventListener("cancel", resumeCamera);
function pauseCamera(){ if (scanner && scanner.isScanning) scanner.stop().catch(() => {}); }
function resumeCamera(){
  setTimeout(() => {
    const prompting = $("#photoPrompt") && !$("#photoPrompt").hidden;
    if (scanner && !prompting && !$("#scanView").hidden && !scanner.isScanning) startCamera();
  }, 300);
}

/* ---------- online save to Google Sheet ---------- */
let syncing = false, syncTimer = null, lastError = "";
function pending(){
  let n = 0;
  state.lists.forEach(l => l.items.forEach(i => { if (i.v !== i.sv) n++; }));
  return n + state.deleted.length + photoQueue().length;
}
function scheduleSync(delay = 800){
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, delay);
  updateStatus();
}
async function sync(){
  if (!CONFIG.SHEET_URL || syncing || !navigator.onLine){ updateStatus(); return; }
  const rows = [], snap = [];
  state.lists.forEach(l => l.items.forEach(i => {
    if (i.v !== i.sv){
      rows.push({ id:i.id, list:l.name, code:i.code, format:i.format, qty:i.qty, note:i.note, scannedAt:i.scannedAt });
      snap.push([i, i.v]);
    }
  }));
  const deleted = state.deleted.slice();
  if (!rows.length && !deleted.length && !photoQueue().length){ updateStatus(); return; }
  syncing = true; updateStatus();
  let ok = false;
  try{
    if (rows.length || deleted.length){
      // No custom headers -> simple request, which Google Apps Script accepts from any website.
      const res = await fetch(CONFIG.SHEET_URL, { method: "POST",
        body: JSON.stringify({ mode: APP.mode, device: state.device, name: state.name, rows, deleted }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Sheet error");
      snap.forEach(([i, v]) => { i.sv = v; });
      state.deleted = state.deleted.filter(id => !deleted.includes(id));
      save();
    }
    await uploadPhotos();
    lastError = ""; ok = true;
  }catch(e){
    lastError = e.message || String(e);
  }finally{
    syncing = false;
    render();
    if (pending()) scheduleSync(ok ? 500 : 15000);
  }
}
function updateStatus(){
  const dot = $("#status .dot"), t = $("#statusText"), n = pending();
  let color = "#cbd5d4", text;
  if (!CONFIG.SHEET_URL){ text = "נשמר בטלפון הזה בלבד"; }
  else if (!navigator.onLine){ color = "#fbbf24"; text = `אין חיבור – ${n} ממתינים, יישמרו כשהחיבור יחזור`; }
  else if (syncing){ color = "#93c5fd"; text = "שומר בגיליון…"; }
  else if (lastError && n){ color = "#fca5a5"; text = `השמירה נכשלה (${n} ממתינים) – מנסה שוב`; }
  else if (n){ color = "#fbbf24"; text = `${n} ממתינים לשמירה…`; }
  else { color = "#86efac"; text = "הכול נשמר בגיליון ✓"; }
  dot.style.background = color; t.textContent = text;
}
window.addEventListener("online", () => scheduleSync(0));
window.addEventListener("offline", updateStatus);
setInterval(() => { if (pending()) sync(); }, 30000);

/* ---------- export ---------- */
function safeName(s){ return (s || "scans").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60); }
function buildXlsx(list){
  const head = ["מספר אספקה / חבילה", "תאריך", "שעה", "מספר סריקות", "סריקה אחרונה", "הערה", "סוג ברקוד"];
  if (APP.photos) head.push("תמונות");
  const rows = [head];
  list.items.slice().reverse().forEach(i => {
    const r = [String(i.code), fmtDate(i.scannedAt), fmtTime(i.scannedAt), i.qty,
               i.lastScannedAt ? fmtStamp(i.lastScannedAt) : "", i.note || "", i.format || ""];
    if (APP.photos) r.push((i.photos || []).map(p => p.url || "ממתינה להעלאה").join("\n") || "אין תמונה");
    rows.push(r);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{wch:22},{wch:12},{wch:10},{wch:12},{wch:20},{wch:28},{wch:12},{wch:50}];
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, APP.mode === "pod" ? "POD" : "מחסן");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new File([buf], safeName(APP.label + " - " + list.name) + ".xlsx",
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function download(file){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function checkList(){
  const list = cur();
  if (!list.items.length){ toast("הרשימה ריקה"); return null; }
  if (typeof XLSX === "undefined"){ toast("כלי האקסל לא נטען – בדקו את החיבור"); return null; }
  if (!confirmMissing(list)) return null;
  return list;
}
function confirmMissing(list){
  if (!APP.photoRequired) return true;
  const n = list.items.filter(i => !(i.photos && i.photos.length)).length;
  return !n || confirm(`ל-${n} פריטים אין תמונת הוכחה. לשלוח בכל זאת?`);
}
function asText(list){
  const lines = list.items.slice().reverse().map(i =>
    `${i.code} | ${fmtStamp(i.scannedAt)}${i.qty > 1 ? " | ×" + i.qty : ""}${i.note ? " | " + i.note : ""}`);
  return `${APP.label}\n${list.name}\n${list.items.length} פריטים\n\n${lines.join("\n")}`;
}
$("#shareBtn").onclick = async () => {
  const list = checkList(); if (!list) return;
  const file = buildXlsx(list);
  if (navigator.canShare && navigator.canShare({ files: [file] })){
    try{ await navigator.share({ files: [file], title: list.name }); }
    catch(e){ if (e.name !== "AbortError"){ download(file); toast("הקובץ הורד – צרפו אותו להודעה"); } }
  } else {
    download(file);
    toast("קובץ האקסל הורד – צרפו אותו במייל או בוואטסאפ");
  }
};
$("#dlBtn").onclick = () => { const list = checkList(); if (list) download(buildXlsx(list)); };
$("#waBtn").onclick = () => {
  const list = cur(); if (!list.items.length) return toast("הרשימה ריקה");
  if (!confirmMissing(list)) return;
  location.href = "https://wa.me/?text=" + encodeURIComponent(asText(list));
};
$("#mailBtn").onclick = () => {
  const list = cur(); if (!list.items.length) return toast("הרשימה ריקה");
  if (!confirmMissing(list)) return;
  location.href = "mailto:?subject=" + encodeURIComponent(APP.label + ": " + list.name) +
                  "&body=" + encodeURIComponent(asText(list));
};

/* ---------- misc ---------- */
let toastTimer;
function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

render();
scheduleSync(300);
