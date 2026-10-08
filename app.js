/* ==========================================================
 * Manajemen Proyek - Gantt Chart
 * HTML + CSS + JavaScript murni, data disimpan di localStorage
 * ========================================================== */
'use strict';

/* ---------------- Konstanta ---------------- */
const STORAGE_KEY = 'manajemenProyek.tugas.v1';
const UI_KEY = 'manajemenProyek.ui.v1';
const TEST_KEY = 'manajemenProyek.uji.sementara';
const CAL_KEY = 'manajemenProyek.kalender.v1';
const TEAM_KEY = 'manajemenProyek.tim.v1';

const COL_W = 36;   // lebar satu kolom hari (px)
const ROW_H = 40;   // tinggi satu baris tugas (px)
const HEAD_H = 58;  // tinggi header timeline (px)
const MAX_RANGE = 4000; // batas jumlah hari agar DOM tetap ringan

const PALETTE = ['#3b82f6','#8b5cf6','#ec4899','#ef4444','#f97316','#f59e0b','#22c55e','#14b8a6','#06b6d4','#64748b'];

const PRIORITY = {
  rendah: { label: 'Rendah', color: '#22c55e' },
  sedang: { label: 'Sedang', color: '#f59e0b' },
  tinggi: { label: 'Tinggi', color: '#ef4444' }
};

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const BULAN_PENDEK = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const HARI_PENDEK = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

const ICON = {
  chevron: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"/><path d="M18.5 6l-1 13.5A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5L5.5 6"/><path d="M10 10.5v7M14 10.5v7"/></svg>'
};

/* ---------------- State aplikasi ---------------- */
const state = {
  tasks: [],
  members: [],
  collapsed: new Set(),
  editingId: null,
  range: null,
  flat: [],
  rowIndexById: new Map(),
  criticalIds: new Set(),
  calendar: { weekendDays: [0, 6], holidays: [] } // 0=Minggu, 6=Sabtu
};

/* ---------------- Utilitas umum ---------------- */
function $(id){ return document.getElementById(id); }

function uid(){
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function pad2(n){ return String(n).padStart(2, '0'); }

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

function sanitizeColor(c){
  return (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) ? c : PALETTE[0];
}

/* ---------------- Utilitas tanggal ---------------- */
function startOfToday(){
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function parseISO(s){
  const p = String(s || '').split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function toISO(d){
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function addDays(d, n){
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function dayDiff(a, b){
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/* Hari kerja mengikuti Kalender Proyek (hari akhir pekan + hari libur). */
function isWeekendDay(d){
  return state.calendar.weekendDays.indexOf(d.getDay()) !== -1;
}

function isHoliday(d){
  const iso = toISO(d);
  return state.calendar.holidays.some(function(h){ return h.date === iso; });
}

function holidayName(d){
  const iso = toISO(d);
  const found = state.calendar.holidays.find(function(h){ return h.date === iso; });
  return found ? found.name : '';
}

function isWorkingDay(d){
  return !isWeekendDay(d) && !isHoliday(d);
}

/* Hari kerja pertama SETELAH tanggal d */
function nextWorkingDay(d){
  let x = addDays(d, 1);
  let g = 0;
  while(!isWorkingDay(x) && g++ < 4000) x = addDays(x, 1);
  return x;
}

function isValidISO(s){
  s = String(s || '');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISO(s);
  if(isNaN(d.getTime())) return false;
  return toISO(d) === s;
}

/* Tanggal mulai yang jatuh di akhir pekan digeser ke hari kerja berikutnya. */
function resolveStart(iso){
  let d = parseISO(iso);
  let adjusted = false;
  let guard = 0;
  while(!isWorkingDay(d) && guard++ < 4000){
    d = addDays(d, 1);
    adjusted = true;
  }
  return { iso: toISO(d), date: d, adjusted: adjusted };
}

/* Tanggal selesai: dihitung maju sebanyak `duration` hari kerja (Senin-Jumat). */
function calcEndDate(startIso, duration){
  let d = parseISO(startIso);
  let count = 0;
  let guard = 0;
  duration = Math.max(1, Number(duration) || 1);
  while(count < duration && guard++ < 4000){
    if(isWorkingDay(d)) count++;
    if(count < duration) d = addDays(d, 1);
  }
  return d;
}

function startOfWeek(d){ return addDays(d, -((d.getDay() + 6) % 7)); } // Senin
function endOfWeek(d){ return addDays(startOfWeek(d), 6); }            // Minggu

function fmtTanggal(d){ return d.getDate() + ' ' + BULAN_PENDEK[d.getMonth()] + ' ' + d.getFullYear(); }
function fmtPanjang(d){ return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear(); }

/* ---------------- Penyimpanan (localStorage) ---------------- */
function storageAvailable(){
  try{
    localStorage.setItem('__probe__', '1');
    localStorage.removeItem('__probe__');
    return true;
  }catch(e){
    return false;
  }
}

function readTasks(key){
  try{
    const raw = localStorage.getItem(key || STORAGE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? normalizeTasks(data) : null;
  }catch(err){
    console.warn('Gagal membaca data:', err);
    return null;
  }
}

function writeTasks(tasks, key){
  try{
    localStorage.setItem(key || STORAGE_KEY, JSON.stringify(tasks));
    return true;
  }catch(err){
    console.warn('Gagal menyimpan data:', err);
    return false;
  }
}

function saveUI(){
  try{
    localStorage.setItem(UI_KEY, JSON.stringify({ collapsed: Array.from(state.collapsed) }));
  }catch(err){ /* abaikan */ }
}

function loadUI(){
  try{
    const data = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
    if(data && Array.isArray(data.collapsed)){
      state.collapsed = new Set(data.collapsed.filter(function(x){ return typeof x === 'string'; }));
    }
  }catch(err){ state.collapsed = new Set(); }
}

/* ---------------- Kalender Proyek ---------------- */
function defaultCalendar(){
  return { weekendDays: [0, 6], holidays: [] };
}

function normalizeCalendar(raw){
  const cal = defaultCalendar();
  if(!raw || typeof raw !== 'object') return cal;
  if(Array.isArray(raw.weekendDays)){
    const days = [];
    raw.weekendDays.forEach(function(n){
      const v = Number(n);
      if(Number.isInteger(v) && v >= 0 && v <= 6 && days.indexOf(v) === -1) days.push(v);
    });
    if(days.length > 0 && days.length < 7) cal.weekendDays = days;
  }
  if(Array.isArray(raw.holidays)){
    const seen = new Set();
    raw.holidays.forEach(function(h){
      if(!h || typeof h !== 'object') return;
      const date = String(h.date || '');
      if(!isValidISO(date) || seen.has(date)) return;
      seen.add(date);
      cal.holidays.push({
        date: date,
        name: String(h.name || '').trim().slice(0, 60)
      });
    });
    cal.holidays.sort(function(a, b){ return a.date < b.date ? -1 : 1; });
  }
  return cal;
}

function loadCalendar(){
  try{
    const raw = localStorage.getItem(CAL_KEY);
    state.calendar = raw ? normalizeCalendar(JSON.parse(raw)) : defaultCalendar();
  }catch(err){
    state.calendar = defaultCalendar();
  }
}

function saveCalendar(){
  try{ localStorage.setItem(CAL_KEY, JSON.stringify(state.calendar)); }
  catch(err){ /* abaikan */ }
}

/* ---------------- Tim Proyek ---------------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeMember(r){
  if(!r || typeof r !== 'object') return null;
  const name = String(r.name == null ? '' : r.name).trim().slice(0, 80);
  if(!name) return null;
  const raw = Number(r.salary);
  return {
    id: String(r.id || '').trim() || uid(),
    name: name,
    email: String(r.email || '').trim().slice(0, 120),
    role: String(r.role || '').trim().slice(0, 60) || 'Anggota',
    salary: (Number.isFinite(raw) && raw >= 0) ? Math.min(1e12, Math.round(raw)) : 0,
    createdAt: Number(r.createdAt) || Date.now()
  };
}

function normalizeMembers(raw){
  if(!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  raw.forEach(function(r){
    const m = normalizeMember(r);
    if(!m) return;
    if(seen.has(m.id)) m.id = uid();
    seen.add(m.id);
    out.push(m);
  });
  return out;
}

function loadTeam(){
  try{
    const raw = localStorage.getItem(TEAM_KEY);
    state.members = raw ? normalizeMembers(JSON.parse(raw)) : [];
  }catch(err){
    state.members = [];
  }
}

function saveTeam(){
  try{ localStorage.setItem(TEAM_KEY, JSON.stringify(state.members)); }
  catch(err){ /* abaikan */ }
}

function memberById(id){
  return state.members.find(function(m){ return m.id === id; }) || null;
}

function formatRupiah(n){
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

/* ---------------- Normalisasi data ---------------- */
/* Daftar predecessor dibersihkan dari entri rusak; validasi id dilakukan setelah
   semua id terkumpul (lihat normalizeTasks). */
function normalizePredList(list){
  if(!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  list.slice(0, 8).forEach(function(p){
    if(!p || typeof p !== 'object') return;
    const taskId = String(p.taskId || '');
    if(!taskId || seen.has(taskId)) return;
    const raw = Math.round(Number(p.delay));
    seen.add(taskId);
    out.push({
      taskId: taskId,
      type: (p.type === 'SS') ? 'SS' : 'FS',
      delay: Number.isFinite(raw) ? Math.min(365, Math.max(0, raw)) : 0
    });
  });
  return out;
}

function normalizeIdList(list){
  if(!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  list.slice(0, 12).forEach(function(v){
    const id = String(v || '');
    if(id && !seen.has(id)){
      seen.add(id);
      out.push(id);
    }
  });
  return out;
}

function normalizeTask(r){
  if(!r || typeof r !== 'object') return null;
  const name = String(r.name == null ? '' : r.name).trim().slice(0, 120);
  if(!name) return null;
  const durRaw = Math.round(Number(r.duration));
  const duration = Number.isFinite(durRaw) ? Math.min(365, Math.max(1, durRaw)) : 1;
  const startDate = isValidISO(r.startDate) ? String(r.startDate) : toISO(startOfToday());
  const priority = Object.prototype.hasOwnProperty.call(PRIORITY, r.priority) ? r.priority : 'sedang';
  return {
    id: String(r.id || '').trim() || uid(),
    name: name,
    startDate: startDate,
    duration: duration,
    priority: priority,
    color: sanitizeColor(r.color),
    parentId: (r.parentId == null || r.parentId === '') ? null : String(r.parentId),
    predecessors: normalizePredList(r.predecessors),
    resources: normalizeIdList(r.resources),
    order: Number.isFinite(Number(r.order)) ? Number(r.order) : 0,
    createdAt: Number(r.createdAt) || Date.now()
  };
}

function normalizeTasks(raw){
  if(!Array.isArray(raw)) return [];
  const list = [];
  raw.forEach(function(r){
    const t = normalizeTask(r);
    if(t) list.push(t);
  });
  // pastikan id unik
  const seen = new Set();
  list.forEach(function(t){
    if(seen.has(t.id)) t.id = uid();
    seen.add(t.id);
  });
  // induk harus ada dan bukan dirinya sendiri
  const ids = new Set(list.map(function(t){ return t.id; }));
  list.forEach(function(t){
    if(t.parentId && (!ids.has(t.parentId) || t.parentId === t.id)) t.parentId = null;
  });
  // putus kemungkinan data siklus (A -> B -> A)
  const parentOf = new Map(list.map(function(t){ return [t.id, t.parentId]; }));
  list.forEach(function(t){
    const walk = new Set([t.id]);
    let cur = t.parentId;
    let steps = 0;
    while(cur && steps++ <= list.length){
      if(walk.has(cur)){ t.parentId = null; break; }
      walk.add(cur);
      cur = parentOf.get(cur);
    }
  });
  // bersihkan predecessor: id harus ada dan bukan diri sendiri
  list.forEach(function(t){
    t.predecessors = t.predecessors.filter(function(p){
      return p.taskId !== t.id && ids.has(p.taskId);
    });
  });
  breakPredecessorCycles(list);
  return list;
}

/* Buang alokasi anggota yang sudah tidak terdaftar. */
function pruneResources(){
  const valid = new Set(state.members.map(function(m){ return m.id; }));
  let changed = false;
  state.tasks.forEach(function(t){
    const before = (t.resources || []).length;
    t.resources = (t.resources || []).filter(function(id){ return valid.has(id); });
    if(t.resources.length !== before) changed = true;
  });
  return changed;
}

/* ---------------- Penjadwalan predecessor (FS / SS) ---------------- */
/* Urutan topologis berdasarkan hubungan predecessor.
   Mengembalikan daftar urutan + penanda apakah masih ada siklus. */
function topoOrder(tasks){
  const indeg = new Map();
  const succ = new Map();
  tasks.forEach(function(t){ indeg.set(t.id, 0); succ.set(t.id, []); });
  tasks.forEach(function(t){
    (t.predecessors || []).forEach(function(p){
      if(!indeg.has(p.taskId) || p.taskId === t.id) return;
      indeg.set(t.id, indeg.get(t.id) + 1);
      succ.get(p.taskId).push(t.id);
    });
  });
  const sorted = [];
  const sortedSet = new Set();
  const queue = tasks.filter(function(t){ return indeg.get(t.id) === 0; }).map(function(t){ return t.id; });
  while(queue.length){
    const id = queue.shift();
    sorted.push(id);
    sortedSet.add(id);
    succ.get(id).forEach(function(n){
      const v = indeg.get(n) - 1;
      indeg.set(n, v);
      if(v === 0) queue.push(n);
    });
  }
  return { sorted: sorted, sortedSet: sortedSet, hasCycle: sorted.length !== tasks.length };
}

/* Buang satu per satu edge sampai graf predecessor bebas siklus. */
function breakPredecessorCycles(list){
  let guard = 0;
  while(guard++ <= 200){
    const res = topoOrder(list);
    if(!res.hasCycle) return true;
    const stuck = list.filter(function(t){
      return !res.sortedSet.has(t.id) && t.predecessors.length > 0;
    });
    if(!stuck.length) return false;
    stuck[0].predecessors.shift();
  }
  return false;
}

/* Semua tugas yang secara transitif bergantung pada t.id (untuk mencegah siklus). */
function transitiveDependents(id){
  const out = new Set();
  const queue = [id];
  while(queue.length){
    const cur = queue.pop();
    state.tasks.forEach(function(t){
      const depends = (t.predecessors || []).some(function(p){ return p.taskId === cur; });
      if(depends && !out.has(t.id)){
        out.add(t.id);
        queue.push(t.id);
      }
    });
  }
  return out;
}

/*
 * Sesuaikan tanggal mulai semua tugas:
 *  1. tanggal mulai yang bukan hari kerja digeser maju ke hari kerja terdekat;
 *  2. tugas dengan predecessor dimajukan paling tidak sampai batas hasil
 *     hubungan FS (selesai pendahulu + jeda) atau SS (mulai pendahulu + jeda).
 * Berjalan sesuai urutan topologis sehingga efek berantai ikut menyesuaikan.
 * Mengembalikan jumlah tanggal yang berubah.
 */
function applyScheduling(){
  const byId = new Map(state.tasks.map(function(t){ return [t.id, t]; }));
  const order = topoOrder(state.tasks);
  let changed = 0;
  order.sorted.forEach(function(id){
    const t = byId.get(id);
    if(!t) return;

    // (1) pastikan tanggal mulai jatuh pada hari kerja
    const snapped = resolveStart(t.startDate);
    if(snapped.iso !== t.startDate){
      t.startDate = snapped.iso;
      changed++;
    }

    // (2) batas terawal dari setiap predecessor
    const preds = (t.predecessors || []).filter(function(p){ return byId.has(p.taskId) && p.taskId !== t.id; });
    if(!preds.length) return;
    let earliest = null;
    preds.forEach(function(p){
      const pt = byId.get(p.taskId);
      const pStart = parseISO(pt.startDate);
      const pEnd = calcEndDate(pt.startDate, pt.duration);
      const delay = Math.max(0, Math.min(365, Number(p.delay) || 0));
      let cand;
      if(p.type === 'SS'){
        cand = pStart;
        for(let i = 0; i < delay; i++) cand = nextWorkingDay(cand);
      }else{
        cand = nextWorkingDay(pEnd);
        for(let i = 0; i < delay; i++) cand = nextWorkingDay(cand);
      }
      if(!earliest || cand > earliest) earliest = cand;
    });
    if(earliest){
      const cur = parseISO(t.startDate);
      if(cur < earliest){
        t.startDate = toISO(earliest);
        changed++;
      }
    }
  });
  return changed;
}

/* ---------------- Struktur pohon & daftar datar ---------------- */
function byOrder(a, b){
  if(a.order !== b.order) return a.order - b.order;
  return a.createdAt - b.createdAt;
}

function buildTree(tasks){
  const map = new Map();
  tasks.forEach(function(t){
    const node = Object.assign({}, t);
    node.children = [];
    map.set(node.id, node);
  });
  const roots = [];
  map.forEach(function(node){
    if(node.parentId && node.parentId !== node.id && map.has(node.parentId)){
      map.get(node.parentId).children.push(node);
    }else{
      roots.push(node);
    }
  });
  function sortRec(arr){
    arr.sort(byOrder);
    arr.forEach(function(n){ sortRec(n.children); });
  }
  sortRec(roots);
  return roots;
}

/* Ubah pohon menjadi daftar datar sesuai urutan tampilan.
   skipCollapse = true mengabaikan status ciutkan (untuk dropdown induk). */
function flatten(nodes, depth, out, skipCollapse){
  depth = depth || 0;
  out = out || [];
  nodes.forEach(function(n){
    const hasChildren = n.children.length > 0;
    const isOpen = hasChildren && (skipCollapse || !state.collapsed.has(n.id));
    out.push({ task: n, depth: depth, hasChildren: hasChildren, isOpen: isOpen });
    if(isOpen) flatten(n.children, depth + 1, out, skipCollapse);
  });
  return out;
}

function findTask(id){
  for(let i = 0; i < state.tasks.length; i++){
    if(state.tasks[i].id === id) return state.tasks[i];
  }
  return null;
}

/* Semua keturunan sebuah tugas (aman dari siklus). */
function descendantsOf(id){
  const ids = new Set([id]);
  const queue = [id];
  const out = [];
  while(queue.length){
    const cur = queue.pop();
    state.tasks.forEach(function(t){
      if(t.parentId === cur && !ids.has(t.id)){
        ids.add(t.id);
        queue.push(t.id);
        out.push(t);
      }
    });
  }
  return out;
}

function nextOrder(parentId){
  let max = -1;
  state.tasks.forEach(function(t){
    if((t.parentId || null) === (parentId || null) && Number.isFinite(t.order)) max = Math.max(max, t.order);
  });
  return max + 1;
}

/* ---------------- Rentang timeline ---------------- */
function computeRange(tasks){
  const today = startOfToday();
  let min = today;
  let max = today;
  (tasks || []).forEach(function(t){
    if(!isValidISO(t.startDate)) return;
    const s = parseISO(t.startDate);
    const e = calcEndDate(t.startDate, t.duration);
    if(s < min) min = s;
    if(e > max) max = e;
  });
  min = startOfWeek(addDays(min, -7));
  max = endOfWeek(addDays(max, 14));
  if(dayDiff(min, max) + 1 > MAX_RANGE) min = addDays(max, -(MAX_RANGE - 1));
  return { min: min, max: max, days: dayDiff(min, max) + 1 };
}

/* Posisi & lebar batang Gantt untuk satu tugas. */
function barGeometry(task, range){
  const start = parseISO(task.startDate);
  const end = calcEndDate(task.startDate, task.duration);
  const idx = dayDiff(range.min, start);
  const span = dayDiff(start, end) + 1;
  return {
    idx: idx,
    span: span,
    left: idx * COL_W + 2,
    width: Math.max(span * COL_W - 4, 8),
    start: start,
    end: end
  };
}

/* ---------------- Analisis Proyek: Critical Path & PERT ---------------- */
function fmtPendek(d){ return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1); }

/* Forward pass (rencana) + backward pass (float) di ruang indeks hari kerja. */
function computeAnalysis(){
  const range = state.range || computeRange(state.tasks);
  const workList = [];
  const idxOf = new Map();
  for(let d = range.min; d <= range.max; d = addDays(d, 1)){
    if(isWorkingDay(d)){
      idxOf.set(toISO(d), workList.length);
      workList.push(toISO(d));
    }
  }

  const byId = new Map(state.tasks.map(function(t){ return [t.id, t]; }));
  const succ = new Map();
  state.tasks.forEach(function(t){ succ.set(t.id, []); });
  state.tasks.forEach(function(t){
    (t.predecessors || []).forEach(function(p){
      if(!succ.has(p.taskId)) return;
      succ.get(p.taskId).push({
        to: t.id,
        type: p.type === 'SS' ? 'SS' : 'FS',
        delay: Math.max(0, Math.min(365, Number(p.delay) || 0))
      });
    });
  });

  const order = topoOrder(state.tasks);
  const dur = new Map();
  const es = new Map();
  const ef = new Map();

  // (1) Forward pass: ES = rencana mulai, EF = ES + durasi - 1
  order.sorted.forEach(function(id){
    const t = byId.get(id);
    const d = Math.max(1, Math.min(365, Number(t.duration) || 1));
    dur.set(id, d);
    let s = idxOf.has(t.startDate) ? idxOf.get(t.startDate) : 0;
    let minS = null;
    (t.predecessors || []).forEach(function(p){
      if(!es.has(p.taskId)) return;
      const L = Math.max(0, Math.min(365, Number(p.delay) || 0));
      const cand = p.type === 'SS' ? es.get(p.taskId) + L : ef.get(p.taskId) + 1 + L;
      if(minS === null || cand > minS) minS = cand;
    });
    if(minS !== null && s < minS) s = minS;
    es.set(id, s);
    ef.set(id, s + d - 1);
  });

  let projectEnd = 0;
  let projectStart = Infinity;
  ef.forEach(function(v){ if(v > projectEnd) projectEnd = v; });
  es.forEach(function(v){ if(v < projectStart) projectStart = v; });
  if(!isFinite(projectStart)) projectStart = 0;

  // (2) Backward pass: LS terbatas oleh penerus, atau akhir proyek
  const ls = new Map();
  const floats = new Map();
  const critical = new Set();
  order.sorted.slice().reverse().forEach(function(id){
    const d = dur.get(id);
    const edges = succ.get(id) || [];
    let limit;
    if(edges.length){
      limit = Infinity;
      edges.forEach(function(e){
        if(!ls.has(e.to)) return;
        const cand = (e.type === 'SS')
          ? ls.get(e.to) - e.delay
          : ls.get(e.to) - e.delay - d;
        if(cand < limit) limit = cand;
      });
      if(limit === Infinity) limit = projectEnd - d + 1;
    }else{
      limit = projectEnd - d + 1;
    }
    ls.set(id, limit);
    const f = Math.max(0, limit - es.get(id));
    floats.set(id, f);
    if(f === 0) critical.add(id);
  });

  // (3) Peringkat PERT: FS turun satu kolom, SS tetap satu kolom
  const ranks = new Map();
  order.sorted.forEach(function(id){
    let r = 0;
    (byId.get(id).predecessors || []).forEach(function(p){
      if(!ranks.has(p.taskId)) return;
      const base = ranks.get(p.taskId) + (p.type === 'SS' ? 0 : 1);
      if(base > r) r = base;
    });
    ranks.set(id, r);
  });

  return {
    workList: workList, idxOf: idxOf,
    es: es, ef: ef, ls: ls, float: floats,
    critical: critical, ranks: ranks,
    projectStart: projectStart, projectEnd: projectEnd,
    duration: Math.max(0, projectEnd - projectStart + 1),
    total: order.sorted.length
  };
}

/* ---------------- Render ---------------- */
function renderHead(){
  const range = state.range;
  const months = [];
  let i = 0;
  while(i < range.days){
    const d = addDays(range.min, i);
    const m = d.getMonth();
    const y = d.getFullYear();
    let c = 0;
    while(i + c < range.days){
      const dd = addDays(range.min, i + c);
      if(dd.getMonth() !== m || dd.getFullYear() !== y) break;
      c++;
    }
    months.push('<div class="month" style="width:' + (c * COL_W) + 'px">' + BULAN[m] + ' ' + y + '</div>');
    i += c;
  }
  const todayIso = toISO(startOfToday());
  const cells = [];
  for(let k = 0; k < range.days; k++){
    const d = addDays(range.min, k);
    const working = isWorkingDay(d);
    const holiday = isHoliday(d);
    const isToday = toISO(d) === todayIso;
    let title = fmtPanjang(d);
    if(!working){
      if(holiday) title += ' \u2014 Libur: ' + (holidayName(d) || 'hari libur');
      else title += ' \u2014 Akhir pekan (bukan hari kerja)';
    }
    cells.push('<div class="day' + (working ? '' : ' we') +
      (holiday ? ' holiday' : '') + (isToday ? ' today' : '') +
      '" style="width:' + COL_W + 'px" title="' + escapeHtml(title) +
      '"><span class="dnum">' + d.getDate() + '</span><span class="dw">' + HARI_PENDEK[d.getDay()] + '</span></div>');
  }
  $('ganttHead').innerHTML = '<div class="months">' + months.join('') + '</div><div class="days">' + cells.join('') + '</div>';
}

function renderRows(){
  const html = state.flat.map(function(row){
    const t = row.task;
    const g = barGeometry(t, state.range);
    const color = sanitizeColor(t.color);
    const title = t.name + ' \u2014 ' + fmtTanggal(g.start) + ' s.d. ' + fmtTanggal(g.end) +
      ' (' + t.duration + ' hari kerja)';
    const label = (g.span * COL_W >= 92)
      ? '<span class="bar-label">' + t.duration + ' hari</span>' : '';
    return '<div class="gantt-row" style="height:' + ROW_H + 'px">' +
      '<div class="bar' + (row.hasChildren ? ' bar-parent' : '') +
      (state.criticalIds.has(t.id) ? ' critical' : '') +
      '" data-action="edit" data-id="' + t.id +
      '" role="button" tabindex="0" aria-label="Ubah ' + escapeHtml(t.name) + '" title="' + escapeHtml(title) +
      '" style="left:' + g.left + 'px;width:' + g.width + 'px;background-color:' + color + '">' + label + '</div></div>';
  }).join('');

  state.rowIndexById = new Map();
  state.flat.forEach(function(row, i){ state.rowIndexById.set(row.task.id, i); });
  $('ganttRows').innerHTML = html + renderNonWorkingColumns() + renderLinks();
}

/* Kolom hari non-kerja (akhir pekan + hari libur) sebagai overlay transparan. */
function renderNonWorkingColumns(){
  const range = state.range;
  const out = [];
  for(let k = 0; k < range.days; k++){
    const d = addDays(range.min, k);
    if(isWorkingDay(d)) continue;
    out.push('<div class="nc-col' + (isHoliday(d) ? ' holiday' : '') +
      '" style="left:' + (k * COL_W) + 'px"></div>');
  }
  return out.join('');
}

/* Garis penghubung predecessor: FS dari ujung selesai, SS dari awal mulai. */
function renderLinks(){
  const flat = state.flat;
  if(flat.length < 2) return '';
  const paths = [];
  flat.forEach(function(row, i){
    const t = row.task;
    (t.predecessors || []).forEach(function(p){
      const j = state.rowIndexById.get(p.taskId);
      if(j === undefined || j === i) return;
      const pred = flat[j];
      if(!pred) return;
      const gS = barGeometry(t, state.range);
      const gP = barGeometry(pred.task, state.range);
      const y1 = j * ROW_H + ROW_H / 2;
      const y2 = i * ROW_H + ROW_H / 2;
      const x1 = (p.type === 'SS') ? gP.left : gP.left + gP.width;
      const x2 = gS.left - 3;
      const midX = x1 + (x2 >= x1 ? 12 : -12);
      paths.push('<path class="link' + (p.type === 'SS' ? ' ss' : '') + '" d="M' + x1 + ' ' + y1 +
        ' H' + midX + ' V' + y2 + ' H' + x2 + '" marker-end="url(#' +
        (p.type === 'SS' ? 'arw-ss' : 'arw') + ')"><title>' +
        escapeHtml(pred.task.name + ' \u2192 ' + t.name + ' (' + p.type +
          (p.delay ? ', jeda ' + p.delay + ' hr' : '') + ')') + '</title></path>');
    });
  });
  if(!paths.length) return '';
  const w = state.range.days * COL_W;
  const h = flat.length * ROW_H;
  return '<svg class="link-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h +
    '" aria-hidden="true"><defs>' +
    '<marker id="arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">' +
      '<path class="arw-head" d="M0 0 L10 5 L0 10 z"/></marker>' +
    '<marker id="arw-ss" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">' +
      '<path class="arw-head ss" d="M0 0 L10 5 L0 10 z"/></marker>' +
    '</defs>' + paths.join('') + '</svg>';
}

function renderLeft(){
  const html = state.flat.map(function(row){
    const t = row.task;
    const color = sanitizeColor(t.color);
    const prio = PRIORITY[t.priority] || PRIORITY.sedang;
    const start = parseISO(t.startDate);
    const end = calcEndDate(t.startDate, t.duration);
    let title = t.name + ' \u2014 mulai ' + fmtTanggal(start) + ', selesai ' + fmtTanggal(end) +
      ' (' + t.duration + ' hari kerja)';
    if(t.predecessors && t.predecessors.length){
      const names = t.predecessors.map(function(p){
        const pt = findTask(p.taskId);
        if(!pt) return '?';
        return pt.name + ' [' + p.type + (p.delay ? ' +' + p.delay : '') + ']';
      });
      title += ' \u00b7 Pendahulu: ' + names.join(', ');
    }
    if(t.resources && t.resources.length){
      const names = t.resources.map(function(id){
        const m = memberById(id);
        return m ? m.name : '?';
      });
      title += ' \u00b7 Anggota: ' + names.join(', ');
    }
    const toggle = row.hasChildren
      ? '<button type="button" class="toggle" data-action="toggle" data-id="' + t.id +
        '" aria-expanded="' + (row.isOpen ? 'true' : 'false') +
        '" title="' + (row.isOpen ? 'Ciutkan' : 'Perluas') + '">' + ICON.chevron + '</button>'
      : '<span class="toggle-spacer"></span>';
    return '<div class="task-row' + (row.hasChildren ? ' parent' : '') + '" style="height:' + ROW_H + 'px">' +
      toggle +
      '<span class="indent" style="width:' + (row.depth * 16) + 'px"></span>' +
      '<span class="dot" style="background:' + color + '"></span>' +
      '<span class="task-name" data-action="edit" data-id="' + t.id + '" role="button" tabindex="0" title="' +
        escapeHtml(title) + '">' + escapeHtml(t.name) + '</span>' +
      '<span class="badge ' + t.priority + '">' + prio.label + '</span>' +
      '<span class="meta meta-dur">' + t.duration + ' hr</span>' +
      '<span class="meta meta-date">' + pad2(start.getDate()) + '/' + pad2(start.getMonth() + 1) + '</span>' +
      '<div class="row-actions">' +
        '<button type="button" data-action="add-child" data-id="' + t.id + '" title="Tambah sub-tugas" aria-label="Tambah sub-tugas untuk ' + escapeHtml(t.name) + '">' + ICON.plus + '</button>' +
        '<button type="button" data-action="edit" data-id="' + t.id + '" title="Ubah tugas" aria-label="Ubah ' + escapeHtml(t.name) + '">' + ICON.edit + '</button>' +
        '<button type="button" class="del" data-action="delete" data-id="' + t.id + '" title="Hapus tugas" aria-label="Hapus ' + escapeHtml(t.name) + '">' + ICON.trash + '</button>' +
      '</div></div>';
  }).join('');
  $('leftBody').innerHTML = html;
}

function positionToday(){
  const line = $('todayLine');
  const idx = dayDiff(state.range.min, startOfToday());
  if(idx < 0 || idx >= state.range.days || state.flat.length === 0){
    line.hidden = true;
    return;
  }
  line.hidden = false;
  line.style.top = HEAD_H + 'px';
  line.style.height = (state.flat.length * ROW_H) + 'px';
  line.style.left = (idx * COL_W + Math.floor(COL_W / 2) - 1) + 'px';
}

function renderStats(){
  const total = state.tasks.length;
  const sub = state.tasks.filter(function(t){ return !!t.parentId; }).length;
  const utama = total - sub;
  const info = $('statsInfo');
  if(total === 0){
    info.innerHTML = 'Belum ada tugas. Klik <strong>Tambah Tugas</strong> atau muat contoh data untuk memulai.';
  }else{
    let min = null;
    let max = null;
    state.tasks.forEach(function(t){
      if(!isValidISO(t.startDate)) return;
      const s = parseISO(t.startDate);
      const e = calcEndDate(t.startDate, t.duration);
      if(!min || s < min) min = s;
      if(!max || e > max) max = e;
    });
    info.innerHTML = '<strong>' + total + '</strong> tugas (' + utama + ' utama \u00b7 ' + sub +
      ' sub-tugas) \u00b7 Rentang proyek <strong>' + fmtTanggal(min) + ' \u2013 ' + fmtTanggal(max) + '</strong>';
  }
  $('leftCount').textContent = total ? total + ' baris' : '';
  $('btnClear').hidden = total === 0;
  $('emptyOverlay').hidden = total !== 0;
}

function render(){
  state.range = computeRange(state.tasks);
  state.criticalIds = computeAnalysis().critical;
  const tree = buildTree(state.tasks);
  state.flat = flatten(tree, 0, [], false);
  $('ganttInner').style.width = (state.range.days * COL_W) + 'px';
  renderHead();
  renderRows();
  renderLeft();
  renderStats();
  positionToday();
  $('leftBody').scrollTop = $('rightPane').scrollTop;
}

/* ---------------- Panel Analisis Proyek ---------------- */
function buildPertSvg(a){
  const tasks = state.tasks.filter(function(t){ return a.es.has(t.id); });
  if(!tasks.length) return '<p class="hint-text">Belum ada tugas untuk dianalisis.</p>';
  const NW = 176, NH = 58, GX = 100, GY = 26, PAD = GX / 2 + 8;

  const groups = new Map();
  tasks.forEach(function(t){
    const r = a.ranks.has(t.id) ? a.ranks.get(t.id) : 0;
    if(!groups.has(r)) groups.set(r, []);
    groups.get(r).push(t);
  });
  const rankKeys = Array.from(groups.keys()).sort(function(x, y){ return x - y; });
  const pos = new Map();
  let maxSlot = 0;
  let maxRank = 0;
  rankKeys.forEach(function(r){
    const arr = groups.get(r).sort(function(x, y){ return a.es.get(x.id) - a.es.get(y.id); });
    arr.forEach(function(t, i){
      pos.set(t.id, { x: PAD + r * (NW + GX), y: PAD + i * (NH + GY) });
      if(i > maxSlot) maxSlot = i;
      if(r > maxRank) maxRank = r;
    });
  });
  const width = PAD * 2 + (maxRank + 1) * NW + maxRank * GX;
  const height = PAD * 2 + (maxSlot + 1) * NH + maxSlot * GY;

  const edges = [];
  tasks.forEach(function(t){
    const to = pos.get(t.id);
    (t.predecessors || []).forEach(function(p){
      const from = pos.get(p.taskId);
      if(!from) return;
      const isSS = p.type === 'SS';
      const y1 = from.y + NH / 2;
      const y2 = to.y + NH / 2;
      let d;
      let lx;
      if(isSS){
        const midX = from.x - GX / 2;
        d = 'M' + from.x + ' ' + y1 + ' H' + midX + ' V' + y2 + ' H' + to.x;
        lx = midX;
      }else{
        const midX = from.x + NW + GX / 2;
        d = 'M' + (from.x + NW) + ' ' + y1 + ' H' + midX + ' V' + y2 + ' H' + to.x;
        lx = midX;
      }
      const lbl = p.type + (p.delay ? '+' + p.delay : '');
      edges.push('<path class="pert-edge' + (isSS ? ' ss' : '') + '" d="' + d +
        '" marker-end="url(#pert-arw)"/><text class="pert-edge-label" x="' + lx +
        '" y="' + ((y1 + y2) / 2 - 5) + '" text-anchor="middle">' + lbl + '</text>');
    });
  });

  const nodes = tasks.map(function(t){
    const p = pos.get(t.id);
    const crit = a.critical.has(t.id);
    const sIso = a.workList[a.es.get(t.id)];
    const eIso = a.workList[a.ef.get(t.id)];
    const label = t.name.length > 25 ? t.name.slice(0, 24) + '\u2026' : t.name;
    return '<g class="pert-node' + (crit ? ' crit' : '') + '">' +
      '<rect x="' + p.x + '" y="' + p.y + '" width="' + NW + '" height="' + NH + '" rx="9"/>' +
      '<text class="pn-name" x="' + (p.x + 10) + '" y="' + (p.y + 21) + '">' + escapeHtml(label) + '</text>' +
      '<text class="pn-meta" x="' + (p.x + 10) + '" y="' + (p.y + 39) + '">' + t.duration + ' hr \u00b7 ' +
        (sIso ? fmtPendek(parseISO(sIso)) : '-') + ' \u2192 ' + (eIso ? fmtPendek(parseISO(eIso)) : '-') + '</text>' +
      '<text class="pn-float' + (crit ? ' crit' : '') + '" x="' + (p.x + 10) + '" y="' + (p.y + 53) + '">' +
        (crit ? 'KRITIS \u00b7 float 0 hr' : 'float ' + (a.float.get(t.id) || 0) + ' hr') + '</text>' +
    '</g>';
  });

  return '<svg class="pert-svg" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + width + ' ' + height + '">' +
    '<defs><marker id="pert-arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">' +
    '<path class="pert-arw-head" d="M0 0 L10 5 L0 10 z"/></marker></defs>' +
    edges.join('') + nodes.join('') + '</svg>';
}

function renderAnalysis(){
  const a = computeAnalysis();
  state.criticalIds = a.critical;
  const critList = state.tasks
    .filter(function(t){ return a.critical.has(t.id); })
    .sort(function(x, y){ return a.es.get(x.id) - a.es.get(y.id); });
  const dialokasikan = state.tasks.filter(function(t){ return (t.resources || []).length; }).length;
  const kosong = a.total === 0;

  const chips = [
    ['Durasi proyek', kosong ? '\u2014' : a.duration + ' hari kerja'],
    ['Mulai', (!kosong && a.workList[a.projectStart]) ? fmtTanggal(parseISO(a.workList[a.projectStart])) : '\u2014'],
    ['Selesai', (!kosong && a.workList[a.projectEnd]) ? fmtTanggal(parseISO(a.workList[a.projectEnd])) : '\u2014'],
    ['Tugas kritis', critList.length + ' dari ' + state.tasks.length],
    ['Anggota tim', state.members.length + ' orang'],
    ['Tugas teralokasi', dialokasikan + ' dari ' + state.tasks.length]
  ];
  $('analysisSummary').innerHTML = chips.map(function(c){
    return '<div class="chip"><span class="chip-label">' + c[0] +
      '</span><span class="chip-value">' + escapeHtml(c[1]) + '</span></div>';
  }).join('');

  const body = $('criticalBody');
  if(!critList.length){
    body.innerHTML = '<tr><td colspan="5" class="empty-cell">Belum ada tugas kritis (belum ada tugas, atau semua tugas punya waktu longgar).</td></tr>';
  }else{
    body.innerHTML = critList.map(function(t){
      const s = a.workList[a.es.get(t.id)];
      const e = a.workList[a.ef.get(t.id)];
      return '<tr>' +
        '<td><span class="dot" style="background:' + sanitizeColor(t.color) + '"></span>' + escapeHtml(t.name) + '</td>' +
        '<td>' + (s ? fmtTanggal(parseISO(s)) : '\u2014') + '</td>' +
        '<td>' + (e ? fmtTanggal(parseISO(e)) : '\u2014') + '</td>' +
        '<td>' + t.duration + ' hr</td>' +
        '<td><span class="badge tinggi">0 hr</span></td>' +
      '</tr>';
    }).join('');
  }
  $('pertBox').innerHTML = buildPertSvg(a);
  $('analysisOverlay').hidden = false;
}

/* ---------------- Toast ---------------- */
let toastTimer = null;
function toast(msg, isError){
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ el.hidden = true; }, 2800);
}

/* ---------------- Penyimpanan ---------------- */
function saveState(){
  saveUI();
  if(!storageAvailable()) return;
  if(!writeTasks(state.tasks)){
    toast('Gagal menyimpan data (localStorage penuh atau diblokir)', true);
  }
}

/* ---------------- Modal tugas ---------------- */
function setError(id, msg){
  const el = $(id);
  el.textContent = msg || '';
  el.hidden = !msg;
}

function clearErrors(){
  setError('errName', null);
  setError('errStart', null);
  setError('errDuration', null);
  setError('errPred', null);
}

function setActiveSwatch(color){
  const c = String(color || '').toLowerCase();
  document.querySelectorAll('#swatches .swatch').forEach(function(b){
    b.classList.toggle('active', b.dataset.color.toLowerCase() === c);
  });
}

function renderSwatches(){
  $('swatches').innerHTML = PALETTE.map(function(c){
    return '<button type="button" class="swatch" data-color="' + c + '" style="background:' + c +
      '" title="Pilih warna ' + c + '" aria-label="Pilih warna ' + c + '"></button>';
  }).join('');
}

function fillParentOptions(selectedId, excludeId){
  const tree = buildTree(state.tasks);
  const all = flatten(tree, 0, [], true);
  const exclude = new Set();
  if(excludeId){
    exclude.add(excludeId);
    descendantsOf(excludeId).forEach(function(t){ exclude.add(t.id); });
  }
  let html = '<option value="">&#8212; Tugas utama (tanpa induk) &#8212;</option>';
  all.forEach(function(row){
    if(exclude.has(row.task.id)) return;
    const pad = '\u00A0'.repeat(row.depth * 3);
    const prefix = pad + (row.depth > 0 ? '\u21B3 ' : '');
    const sel = row.task.id === selectedId ? ' selected' : '';
    html += '<option value="' + row.task.id + '"' + sel + '>' + escapeHtml(prefix + row.task.name) + '</option>';
  });
  $('fParent').innerHTML = html;
}

function updatePreview(){
  const raw = $('fStart').value;
  const dur = parseInt($('fDuration').value, 10);
  const box = $('datePreview');
  if(!isValidISO(raw) || !Number.isFinite(dur) || dur < 1){
    box.textContent = 'Pilih tanggal mulai dan durasi untuk melihat perkiraan tanggal selesai.';
    return;
  }
  const rs = resolveStart(raw);
  const end = calcEndDate(rs.iso, dur);
  let html = '';
  if(rs.adjusted){
    html += '<span class="warn">Tanggal mulai bukan hari kerja, digeser ke ' + fmtPanjang(rs.date) + '.</span> ';
  }
  html += 'Perkiraan selesai: <strong>' + fmtPanjang(end) + '</strong> (' + dur + ' hari kerja)';
  box.innerHTML = html;
}

/* Daftar predecessor pada form dijaga sinkron lewat variabel ini. */
let modalPreds = [];

/* Kandidat pendahulu: semua tugas kecuali dirinya sendiri dan tugas yang
   secara transitif sudah bergantung padanya (mencegah siklus). */
function predOptionsHtml(selfId, selectedId){
  const excluded = new Set();
  if(selfId){
    excluded.add(selfId);
    transitiveDependents(selfId).forEach(function(id){ excluded.add(id); });
  }
  const tree = buildTree(state.tasks);
  const all = flatten(tree, 0, [], true);
  let html = '<option value="">\u2014 Pilih tugas \u2014</option>';
  all.forEach(function(row){
    if(excluded.has(row.task.id)) return;
    const pad = '\u00A0'.repeat(row.depth * 3) + (row.depth > 0 ? '\u21B3 ' : '');
    const sel = row.task.id === selectedId ? ' selected' : '';
    html += '<option value="' + row.task.id + '"' + sel + '>' +
      escapeHtml(pad + row.task.name) + '</option>';
  });
  return html;
}

function renderPredRows(){
  const box = $('predList');
  if(!modalPreds.length){
    box.innerHTML = '<p class="hint-text">Belum ada predecessor. Tugas dapat berdiri sendiri.</p>';
    return;
  }
  box.innerHTML = modalPreds.map(function(p, i){
    return '<div class="pred-row" data-i="' + i + '">' +
      '<select class="pred-task" data-i="' + i + '" aria-label="Tugas pendahulu">' +
        predOptionsHtml(state.editingId, p.taskId) + '</select>' +
      '<select class="pred-type" data-i="' + i + '" aria-label="Jenis hubungan">' +
        '<option value="FS"' + (p.type === 'FS' ? ' selected' : '') + '>FS</option>' +
        '<option value="SS"' + (p.type === 'SS' ? ' selected' : '') + '>SS</option>' +
      '</select>' +
      '<input type="number" class="pred-delay" data-i="' + i + '" min="0" max="365" step="1"' +
        ' value="' + p.delay + '" title="Jeda (hari kerja)" aria-label="Jeda hari kerja">' +
      '<button type="button" class="pred-del" data-i="' + i + '" aria-label="Hapus predecessor">\u00d7</button>' +
    '</div>';
  }).join('');
}

function validModalPreds(){
  const out = [];
  for(let i = 0; i < modalPreds.length; i++){
    const p = modalPreds[i];
    if(!p.taskId) return null;
    const dup = out.some(function(x){ return x.taskId === p.taskId; });
    if(dup) continue;
    out.push({
      taskId: p.taskId,
      type: p.type === 'SS' ? 'SS' : 'FS',
      delay: Math.max(0, Math.min(365, Number(p.delay) || 0))
    });
  }
  return out;
}

function openModal(task, presetParent){
  state.editingId = task ? task.id : null;
  modalPreds = task
    ? (task.predecessors || []).map(function(p){ return { taskId: p.taskId, type: p.type, delay: p.delay }; })
    : [];
  modalResources = task ? (task.resources || []).slice() : [];
  $('modalTitle').textContent = task ? 'Ubah Tugas' : 'Tambah Tugas';
  $('fName').value = task ? task.name : '';
  $('fStart').value = task ? task.startDate : toISO(startOfToday());
  $('fDuration').value = task ? task.duration : 3;
  $('fPriority').value = task ? task.priority : 'sedang';
  const color = task ? sanitizeColor(task.color) : PALETTE[state.tasks.length % PALETTE.length];
  $('fColor').value = color;
  setActiveSwatch(color);
  const parentSel = (presetParent !== undefined && presetParent !== null)
    ? presetParent
    : (task ? task.parentId : null);
  fillParentOptions(parentSel, task ? task.id : null);
  clearErrors();
  renderPredRows();
  renderResourceChips();
  updatePreview();
  $('modalOverlay').hidden = false;
  setTimeout(function(){
    $('fName').focus();
    $('fName').select();
  }, 0);
}

function closeModal(){
  $('modalOverlay').hidden = true;
  state.editingId = null;
}

function onSubmit(e){
  e.preventDefault();
  const name = $('fName').value.trim().slice(0, 120);
  const startRaw = $('fStart').value;
  const dur = parseInt($('fDuration').value, 10);
  let ok = true;
  if(!name){ setError('errName', 'Nama tugas wajib diisi.'); ok = false; } else setError('errName', null);
  if(!isValidISO(startRaw)){ setError('errStart', 'Tanggal mulai harus dipilih.'); ok = false; } else setError('errStart', null);
  if(!Number.isFinite(dur) || dur < 1 || dur > 365){
    setError('errDuration', 'Durasi harus angka 1\u2013365 hari kerja.');
    ok = false;
  }else{
    setError('errDuration', null);
  }
  if(!ok) return;

  const preds = validModalPreds();
  if(preds === null){
    setError('errPred', 'Pilih tugas pendahulu pada setiap baris, atau hapus baris kosongnya.');
    return;
  }
  const rs = resolveStart(startRaw);
  const newParent = $('fParent').value || null;
  const priority = Object.prototype.hasOwnProperty.call(PRIORITY, $('fPriority').value)
    ? $('fPriority').value : 'sedang';
  const color = sanitizeColor($('fColor').value);
  const wasEditing = !!state.editingId;
  const resources = modalResources.filter(function(id){ return !!memberById(id); }).slice(0, 12);

  if(wasEditing){
    const t = findTask(state.editingId);
    if(!t){ closeModal(); return; }
    if((t.parentId || null) !== newParent){
      t.parentId = newParent;
      t.order = nextOrder(newParent);
    }
    t.name = name;
    t.startDate = rs.iso;
    t.duration = dur;
    t.priority = priority;
    t.color = color;
    t.predecessors = preds;
    t.resources = resources;
  }else{
    state.tasks.push({
      id: uid(),
      name: name,
      startDate: rs.iso,
      duration: dur,
      priority: priority,
      color: color,
      parentId: newParent,
      predecessors: preds,
      resources: resources,
      order: nextOrder(newParent),
      createdAt: Date.now()
    });
  }
  closeModal();
  const adjusted = applyScheduling();
  saveState();
  render();
  const baseMsg = wasEditing ? 'Perubahan tersimpan' : 'Tugas ditambahkan';
  toast(adjusted > 0 ? baseMsg + ' (' + adjusted + ' tanggal disesuaikan)' : baseMsg);
}

/* ---------------- Aksi pada tugas ---------------- */
function toggleCollapse(id){
  if(state.collapsed.has(id)) state.collapsed.delete(id);
  else state.collapsed.add(id);
  saveUI();
  render();
}

function editTask(id){
  const t = findTask(id);
  if(t) openModal(t);
}

function deleteTask(id){
  const t = findTask(id);
  if(!t) return;
  const kids = descendantsOf(id);
  const msg = kids.length
    ? 'Hapus "' + t.name + '" beserta ' + kids.length + ' sub-tugasnya?'
    : 'Hapus tugas "' + t.name + '"?';
  if(!window.confirm(msg)) return;
  const remove = new Set([id].concat(kids.map(function(k){ return k.id; })));
  state.tasks = state.tasks.filter(function(x){ return !remove.has(x.id); });
  remove.forEach(function(x){ state.collapsed.delete(x); });
  // lepaskan rujukan predecessor yang mengarah ke tugas terhapus
  state.tasks.forEach(function(t){
    if(!t.predecessors || !t.predecessors.length) return;
    t.predecessors = t.predecessors.filter(function(p){ return !remove.has(p.taskId); });
  });
  applyScheduling();
  saveState();
  render();
  toast('Tugas dihapus');
}

function clearAll(){
  if(!state.tasks.length) return;
  if(!window.confirm('Hapus SEMUA tugas? Tindakan ini tidak bisa dibatalkan.')) return;
  state.tasks = [];
  state.collapsed = new Set();
  saveState();
  render();
  toast('Semua tugas dihapus');
}

function loadSample(){
  const spec = [
    { key:'A',  name:'Perencanaan Proyek',     start:-12, dur:6,  prio:'sedang', color:'#3b82f6', parent:null, preds:[] },
    { key:'A1', name:'Riset kebutuhan',        start:-12, dur:2,  prio:'tinggi', color:'#ef4444', parent:'A',   preds:[] },
    { key:'A2', name:'Penentuan lingkup kerja',start:-10, dur:2,  prio:'sedang', color:'#f59e0b', parent:'A',   preds:[['A1','FS',0]] },
    { key:'A3', name:'Penandatanganan kontrak',start:-7,  dur:3,  prio:'rendah', color:'#22c55e', parent:'A',   preds:[['A2','FS',0]] },
    { key:'B',  name:'Desain dan Pengembangan',start:-4,  dur:12, prio:'sedang', color:'#8b5cf6', parent:null, preds:[['A','FS',0]] },
    { key:'B1', name:'Wireframe aplikasi',     start:-4,  dur:3,  prio:'tinggi', color:'#f97316', parent:'B',   preds:[['B','SS',0]] },
    { key:'B2', name:'Desain antarmuka UI',    start:-1,  dur:5,  prio:'sedang', color:'#ec4899', parent:'B',   preds:[['B1','SS',1]] },
    { key:'B2a',name:'Halaman dasbor',         start:-1,  dur:2,  prio:'tinggi', color:'#ef4444', parent:'B2',  preds:[['B2','SS',0]] },
    { key:'B2b',name:'Halaman laporan',        start:1,   dur:3,  prio:'rendah', color:'#06b6d4', parent:'B2',  preds:[['B2a','FS',0]] },
    { key:'B3', name:'Implementasi inti',      start:3,   dur:6,  prio:'tinggi', color:'#14b8a6', parent:'B',   preds:[['B2','FS',1]] },
    { key:'C',  name:'Pengujian dan Peluncuran',start:8,  dur:6,  prio:'tinggi', color:'#64748b', parent:null, preds:[['B3','FS',0]] },
    { key:'C1', name:'Pengujian fungsional',   start:8,   dur:3,  prio:'sedang', color:'#f59e0b', parent:'C',   preds:[['C','SS',0]] },
    { key:'C2', name:'Peluncuran rilis',       start:11,  dur:2,  prio:'tinggi', color:'#ef4444', parent:'C',   preds:[['C1','FS',0]] }
  ];
  const ids = {};
  spec.forEach(function(s){ ids[s.key] = uid(); });
  const now = Date.now();
  state.tasks = spec.map(function(s, i){
    return {
      id: ids[s.key],
      name: s.name,
      startDate: toISO(addDays(startOfToday(), s.start)),
      duration: s.dur,
      priority: s.prio,
      color: s.color,
      parentId: s.parent ? ids[s.parent] : null,
      predecessors: (s.preds || []).map(function(pk){
        return { taskId: ids[pk[0]], type: pk[1], delay: pk[2] };
      }),
      resources: [],
      order: i,
      createdAt: now + i
    };
  });
  state.collapsed = new Set();
  applyScheduling();
  saveState();
  render();
  initialScroll();
  toast('Contoh data dimuat');
}

/* ---------------- Navigasi timeline ---------------- */
function scrollToToday(smooth){
  const pane = $('rightPane');
  const idx = dayDiff(state.range.min, startOfToday());
  const target = Math.max(0, idx * COL_W - pane.clientWidth * 0.35);
  if(smooth && pane.scrollTo){
    pane.scrollTo({ left: target, behavior: 'smooth' });
  }else{
    pane.scrollLeft = target;
  }
}

function initialScroll(){
  const pane = $('rightPane');
  let idx;
  if(state.tasks.length){
    let min = null;
    state.tasks.forEach(function(t){
      if(!isValidISO(t.startDate)) return;
      const s = parseISO(t.startDate);
      if(!min || s < min) min = s;
    });
    idx = min ? dayDiff(state.range.min, min) : 0;
  }else{
    idx = dayDiff(state.range.min, startOfToday());
  }
  pane.scrollLeft = Math.max(0, idx * COL_W - 48);
  $('leftBody').scrollTop = pane.scrollTop;
}

function syncVertical(){
  $('leftBody').scrollTop = $('rightPane').scrollTop;
}

/* Roda mouse di panel kiri digulirkan ke timeline agar sejajar. */
function onLeftWheel(e){
  if(e.ctrlKey) return;
  const pane = $('rightPane');
  if(Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  if(pane.scrollHeight <= pane.clientHeight + 1) return;
  pane.scrollTop += e.deltaY;
  e.preventDefault();
}

/* ---------------- Event panel kiri ---------------- */
function onLeftClick(e){
  const el = e.target.closest('[data-action]');
  if(!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;
  if(action === 'toggle') toggleCollapse(id);
  else if(action === 'edit') editTask(id);
  else if(action === 'delete') deleteTask(id);
  else if(action === 'add-child') openModal(null, id);
}

function onRowKey(e){
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target;
  if(!el.matches || !el.matches('[data-action]')) return;
  if(el.tagName === 'BUTTON') return; // biarkan perilaku bawaan tombol
  e.preventDefault();
  el.click();
}

/* ---------------- Kalender Proyek (UI) ---------------- */
const NAMA_HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const URUTAN_HARI = [1, 2, 3, 4, 5, 6, 0]; // Senin..Minggu

function renderCalendar(){
  $('weekendGrid').innerHTML = URUTAN_HARI.map(function(d){
    const on = state.calendar.weekendDays.indexOf(d) !== -1;
    return '<label class="wd-chip' + (on ? ' on' : '') + '">' +
      '<input type="checkbox" data-day="' + d + '"' + (on ? ' checked' : '') + '>' +
      '<span>' + NAMA_HARI[d] + '</span></label>';
  }).join('');

  const working = URUTAN_HARI
    .filter(function(d){ return state.calendar.weekendDays.indexOf(d) === -1; })
    .map(function(d){ return NAMA_HARI[d]; });
  $('workdaySummary').textContent = working.length ? working.join(', ') : 'tidak ada';

  const list = $('holidayList');
  if(!state.calendar.holidays.length){
    list.innerHTML = '<li class="empty">Belum ada hari libur.</li>';
  }else{
    list.innerHTML = state.calendar.holidays.map(function(h){
      return '<li><span class="hol-date">' + escapeHtml(fmtTanggal(parseISO(h.date))) + '</span>' +
        '<span class="hol-name">' + escapeHtml(h.name || 'Hari libur') + '</span>' +
        '<button type="button" class="hol-del" data-date="' + h.date +
        '" aria-label="Hapus hari libur ' + escapeHtml(fmtTanggal(parseISO(h.date))) + '">&times;</button></li>';
    }).join('');
  }
}

function openCalendar(){
  renderCalendar();
  $('calOverlay').hidden = false;
}

function closeCalendar(){
  $('calOverlay').hidden = true;
}

/* Simpan kalender + jadwalkan ulang + render. */
function calendarChanged(msg){
  saveCalendar();
  const adjusted = applyScheduling();
  saveState();
  renderCalendar();
  render();
  toast(adjusted > 0 ? msg + ' (' + adjusted + ' tanggal disesuaikan)' : msg);
}

/* ---------------- Tim Proyek (UI) ---------------- */
let editingMemberId = null;

function clearMemberErrors(){
  setError('errMemberName', null);
  setError('errMemberEmail', null);
  setError('errMemberSalary', null);
}

function renderTeamList(){
  const box = $('memberList');
  $('memberCount').textContent = String(state.members.length);
  if(!state.members.length){
    box.innerHTML = '<li class="empty">Belum ada anggota. Daftarkan anggota pertama lewat form di atas.</li>';
    return;
  }
  box.innerHTML = state.members.map(function(m){
    const alokasi = state.tasks.filter(function(t){
      return (t.resources || []).indexOf(m.id) !== -1;
    }).length;
    return '<li class="member-item">' +
      '<div class="member-main">' +
        '<span class="member-name">' + escapeHtml(m.name) + '</span>' +
        '<span class="member-role">' + escapeHtml(m.role) + '</span>' +
        '<span class="member-email">' + escapeHtml(m.email || '\u2014') + '</span>' +
      '</div>' +
      '<div class="member-side">' +
        '<span class="member-salary">' + formatRupiah(m.salary) + '<small>/bulan</small></span>' +
        '<span class="member-alloc">' + alokasi + ' tugas dialokasikan</span>' +
      '</div>' +
      '<div class="row-actions member-actions">' +
        '<button type="button" data-act="edit" data-id="' + m.id + '" title="Ubah anggota" aria-label="Ubah ' + escapeHtml(m.name) + '">' + ICON.edit + '</button>' +
        '<button type="button" class="del" data-act="delete" data-id="' + m.id + '" title="Hapus anggota" aria-label="Hapus ' + escapeHtml(m.name) + '">' + ICON.trash + '</button>' +
      '</div>' +
    '</li>';
  }).join('');
}

function resetMemberForm(){
  editingMemberId = null;
  $('fMemberName').value = '';
  $('fMemberEmail').value = '';
  $('fMemberRole').value = '';
  $('fMemberSalary').value = '';
  $('btnMemberSave').textContent = 'Tambah Anggota';
  $('btnMemberCancel').hidden = true;
  clearMemberErrors();
}

function openTeam(){
  resetMemberForm();
  renderTeamList();
  $('teamOverlay').hidden = false;
  setTimeout(function(){ $('fMemberName').focus(); }, 0);
}

function closeTeam(){
  $('teamOverlay').hidden = true;
  resetMemberForm();
}

function submitMember(){
  const name = $('fMemberName').value.trim().slice(0, 80);
  const email = $('fMemberEmail').value.trim().slice(0, 120);
  const role = $('fMemberRole').value.trim().slice(0, 60) || 'Anggota';
  const salaryRaw = $('fMemberSalary').value.trim();
  const salary = salaryRaw === '' ? 0 : Number(salaryRaw);
  let ok = true;
  if(!name){ setError('errMemberName', 'Nama anggota wajib diisi.'); ok = false; }
  else setError('errMemberName', null);
  if(email && !EMAIL_RE.test(email)){ setError('errMemberEmail', 'Format email tidak valid.'); ok = false; }
  else setError('errMemberEmail', null);
  if(!Number.isFinite(salary) || salary < 0){ setError('errMemberSalary', 'Gaji harus angka nol atau lebih.'); ok = false; }
  else setError('errMemberSalary', null);
  if(!ok) return;

  const gaji = Math.min(1e12, Math.round(salary));
  if(editingMemberId){
    const m = memberById(editingMemberId);
    if(m){
      m.name = name; m.email = email; m.role = role; m.salary = gaji;
      toast('Anggota diperbarui');
    }
    resetMemberForm();
  }else{
    state.members.push({ id: uid(), name: name, email: email, role: role, salary: gaji, createdAt: Date.now() });
    toast('Anggota ditambahkan');
  }
  saveTeam();
  renderTeamList();
  refreshResourceChips();
}

function editMember(id){
  const m = memberById(id);
  if(!m) return;
  editingMemberId = id;
  $('fMemberName').value = m.name;
  $('fMemberEmail').value = m.email;
  $('fMemberRole').value = m.role;
  $('fMemberSalary').value = String(m.salary);
  $('btnMemberSave').textContent = 'Simpan Perubahan';
  $('btnMemberCancel').hidden = false;
  clearMemberErrors();
  $('fMemberName').focus();
}

function deleteMember(id){
  const m = memberById(id);
  if(!m) return;
  const used = state.tasks.filter(function(t){ return (t.resources || []).indexOf(id) !== -1; }).length;
  const msg = used
    ? 'Hapus anggota "' + m.name + '" beserta alokasi di ' + used + ' tugas?'
    : 'Hapus anggota "' + m.name + '"?';
  if(!window.confirm(msg)) return;
  state.members = state.members.filter(function(x){ return x.id !== id; });
  if(used){
    state.tasks.forEach(function(t){
      t.resources = (t.resources || []).filter(function(r){ return r !== id; });
    });
    saveState();
    render();
  }
  saveTeam();
  if(editingMemberId === id) resetMemberForm();
  renderTeamList();
  refreshResourceChips();
  toast('Anggota dihapus');
}

/* ---------------- Alokasi anggota pada form tugas ---------------- */
let modalResources = [];

function renderResourceChips(){
  const box = $('resourceList');
  if(!state.members.length){
    box.innerHTML = '<p class="hint-text">Belum ada anggota tim. Buka <b>Tim Proyek</b> untuk mendaftarkan anggota, lalu buka kembali form ini.</p>';
    return;
  }
  box.innerHTML = state.members.map(function(m){
    const on = modalResources.indexOf(m.id) !== -1;
    return '<label class="res-chip' + (on ? ' on' : '') + '">' +
      '<input type="checkbox" data-id="' + m.id + '"' + (on ? ' checked' : '') + '>' +
      '<span class="res-name">' + escapeHtml(m.name) + '</span>' +
      '<span class="res-role">' + escapeHtml(m.role) + '</span></label>';
  }).join('');
}

function refreshResourceChips(){
  if($('modalOverlay') && !$('modalOverlay').hidden) renderResourceChips();
}

/* ---------------- Pengikatan event ---------------- */
function bindEvents(){
  $('btnAdd').addEventListener('click', function(){ openModal(null, null); });
  $('btnEmptyAdd').addEventListener('click', function(){ openModal(null, null); });
  $('btnToday').addEventListener('click', function(){ scrollToToday(true); });
  $('btnSample').addEventListener('click', loadSample);
  $('btnClear').addEventListener('click', clearAll);
  $('btnCancel').addEventListener('click', closeModal);
  $('btnClose').addEventListener('click', closeModal);
  $('modalOverlay').addEventListener('click', function(e){
    if(e.target === $('modalOverlay')) closeModal();
  });
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape') return;
    if(!$('modalOverlay').hidden) closeModal();
    else if(!$('calOverlay').hidden) closeCalendar();
    else if(!$('teamOverlay').hidden) closeTeam();
    else if(!$('analysisOverlay').hidden) $('analysisOverlay').hidden = true;
  });

  ['fName', 'fStart', 'fDuration'].forEach(function(id){
    $(id).addEventListener('input', updatePreview);
    $(id).addEventListener('change', updatePreview);
  });
  $('fColor').addEventListener('input', function(){ setActiveSwatch($('fColor').value); });
  $('swatches').addEventListener('click', function(e){
    const b = e.target.closest('button[data-color]');
    if(!b) return;
    $('fColor').value = b.dataset.color;
    setActiveSwatch(b.dataset.color);
  });
  $('taskForm').addEventListener('submit', onSubmit);

  $('leftBody').addEventListener('click', onLeftClick);
  $('leftBody').addEventListener('keydown', onRowKey);

  $('ganttRows').addEventListener('click', function(e){
    const el = e.target.closest('[data-action="edit"]');
    if(el) editTask(el.dataset.id);
  });
  $('ganttRows').addEventListener('keydown', onRowKey);

  $('rightPane').addEventListener('scroll', syncVertical);
  $('ganttLeft').addEventListener('wheel', onLeftWheel, { passive: false });

  /* ---- Daftar predecessor pada form ---- */
  $('btnAddPred').addEventListener('click', function(){
    if(modalPreds.length >= 8){ toast('Maksimal 8 predecessor per tugas'); return; }
    modalPreds.push({ taskId: '', type: 'FS', delay: 0 });
    renderPredRows();
    const rows = $('predList').querySelectorAll('.pred-task');
    if(rows.length) rows[rows.length - 1].focus();
  });
  $('predList').addEventListener('change', function(e){
    const el = e.target;
    const i = Number(el.dataset ? el.dataset.i : NaN);
    if(!Number.isInteger(i) || !modalPreds[i]) return;
    if(el.classList.contains('pred-task')) modalPreds[i].taskId = el.value;
    else if(el.classList.contains('pred-type')) modalPreds[i].type = el.value === 'SS' ? 'SS' : 'FS';
    else if(el.classList.contains('pred-delay')){
      const v = parseInt(el.value, 10);
      modalPreds[i].delay = Number.isFinite(v) ? Math.max(0, Math.min(365, v)) : 0;
    }
    setError('errPred', null);
  });
  $('predList').addEventListener('click', function(e){
    const btn = e.target.closest('.pred-del');
    if(!btn) return;
    const i = Number(btn.dataset.i);
    if(!Number.isInteger(i)) return;
    modalPreds.splice(i, 1);
    renderPredRows();
    setError('errPred', null);
  });

  /* ---- Kalender Proyek ---- */
  $('btnCalendar').addEventListener('click', openCalendar);
  $('btnCalClose').addEventListener('click', closeCalendar);
  $('btnCalDone').addEventListener('click', closeCalendar);
  $('calOverlay').addEventListener('click', function(e){
    if(e.target === $('calOverlay')) closeCalendar();
  });
  $('weekendGrid').addEventListener('change', function(e){
    const cb = e.target;
    if(!cb.dataset || cb.dataset.day === undefined) return;
    const day = Number(cb.dataset.day);
    const days = state.calendar.weekendDays.slice();
    const idx = days.indexOf(day);
    if(idx === -1) days.push(day); else days.splice(idx, 1);
    if(days.length >= 7){
      cb.checked = false;
      toast('Minimal satu hari harus tetap menjadi hari kerja', true);
      return;
    }
    state.calendar.weekendDays = days.sort(function(a, b){ return a - b; });
    calendarChanged('Hari akhir pekan diperbarui');
  });
  $('btnAddHoliday').addEventListener('click', function(){
    const date = $('fHolidayDate').value;
    const name = $('fHolidayName').value.trim().slice(0, 60);
    if(!isValidISO(date)){ setError('errHoliday', 'Pilih tanggal libur terlebih dahulu.'); return; }
    const dup = state.calendar.holidays.some(function(h){ return h.date === date; });
    if(dup){ setError('errHoliday', 'Tanggal tersebut sudah terdaftar sebagai hari libur.'); return; }
    setError('errHoliday', null);
    state.calendar.holidays.push({ date: date, name: name });
    state.calendar.holidays.sort(function(a, b){ return a.date < b.date ? -1 : 1; });
    $('fHolidayDate').value = '';
    $('fHolidayName').value = '';
    calendarChanged('Hari libur ditambahkan');
  });
  $('fHolidayName').addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); $('btnAddHoliday').click(); }
  });
  $('holidayList').addEventListener('click', function(e){
    const btn = e.target.closest('.hol-del');
    if(!btn) return;
    state.calendar.holidays = state.calendar.holidays.filter(function(h){ return h.date !== btn.dataset.date; });
    calendarChanged('Hari libur dihapus');
  });

  /* ---- Tim Proyek ---- */
  $('btnTeam').addEventListener('click', openTeam);
  $('btnTeamClose').addEventListener('click', closeTeam);
  $('btnTeamDone').addEventListener('click', closeTeam);
  $('teamOverlay').addEventListener('click', function(e){
    if(e.target === $('teamOverlay')) closeTeam();
  });
  $('btnMemberSave').addEventListener('click', submitMember);
  $('btnMemberCancel').addEventListener('click', resetMemberForm);
  ['fMemberName', 'fMemberEmail', 'fMemberRole', 'fMemberSalary'].forEach(function(id){
    $(id).addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); submitMember(); }
    });
  });
  $('memberList').addEventListener('click', function(e){
    const btn = e.target.closest('button[data-act]');
    if(!btn) return;
    if(btn.dataset.act === 'edit') editMember(btn.dataset.id);
    else deleteMember(btn.dataset.id);
  });

  /* ---- Alokasi anggota pada form tugas ---- */
  $('resourceList').addEventListener('change', function(e){
    const cb = e.target;
    if(!cb.dataset || !cb.dataset.id) return;
    const id = cb.dataset.id;
    const i = modalResources.indexOf(id);
    if(cb.checked){
      if(i === -1) modalResources.push(id);
    }else if(i !== -1){
      modalResources.splice(i, 1);
    }
    const chip = cb.closest('.res-chip');
    if(chip) chip.classList.toggle('on', cb.checked);
  });

  /* ---- Analisis Proyek ---- */
  $('btnAnalysis').addEventListener('click', renderAnalysis);
  $('btnAnalysisClose').addEventListener('click', function(){ $('analysisOverlay').hidden = true; });
  $('btnAnalysisDone').addEventListener('click', function(){ $('analysisOverlay').hidden = true; });
  $('analysisOverlay').addEventListener('click', function(e){
    if(e.target === $('analysisOverlay')) $('analysisOverlay').hidden = true;
  });
}

/* ---------------- Mulai ---------------- */
function init(){
  // Halaman uji (uji.html) tidak memiliki elemen #gantt
  if(!$('gantt')) return;

  document.documentElement.style.setProperty('--col-w', COL_W + 'px');
  document.documentElement.style.setProperty('--week-w', (COL_W * 7) + 'px');

  if(!storageAvailable()) $('storageNotice').hidden = false;
  state.tasks = readTasks(STORAGE_KEY) || [];
  loadTeam();
  loadCalendar();
  if(pruneResources()) writeTasks(state.tasks);
  if(applyScheduling() > 0) writeTasks(state.tasks);
  loadUI();

  renderSwatches();
  bindEvents();
  render();
  initialScroll();
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
}else{
  init();
}
