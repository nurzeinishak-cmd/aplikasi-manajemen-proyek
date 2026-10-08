/* Pengujian otomatis logika inti aplikasi Manajemen Proyek - Gantt */
'use strict';

const hasil = [];

function catat(nama, fn){
  try{
    const r = fn();
    hasil.push({ nama: nama, ok: r !== false, ket: (r === true || r === undefined) ? '' : String(r) });
  }catch(err){
    hasil.push({ nama: nama, ok: false, ket: err.message });
  }
}

function assert(cond, pesan){
  if(!cond) throw new Error(pesan || 'asersi gagal');
}

/* ---------- Tanggal & hari kerja ---------- */
catat('parseISO/toISO bolak-balik', function(){
  assert(toISO(parseISO('2025-10-06')) === '2025-10-06');
});

catat('isValidISO menolak tanggal tidak valid', function(){
  assert(isValidISO('2025-02-31') === false, '2025-02-31 harus ditolak');
  assert(isValidISO('06/10/2025') === false, 'format salah harus ditolak');
  assert(isValidISO('2025-02-28') === true, '2025-02-28 harus diterima');
});

catat('Senin + 5 hari kerja = Jumat', function(){
  assert(toISO(calcEndDate('2025-10-06', 5)) === '2025-10-10');
});

catat('Jumat + 1 hari kerja = Jumat yang sama', function(){
  assert(toISO(calcEndDate('2025-10-10', 1)) === '2025-10-10');
});

catat('Jumat + 2 hari kerja = Senin berikutnya', function(){
  assert(toISO(calcEndDate('2025-10-10', 2)) === '2025-10-13');
});

catat('durasi melewati batas bulan', function(){
  assert(toISO(calcEndDate('2025-10-30', 3)) === '2025-11-03', 'hasil: ' + toISO(calcEndDate('2025-10-30', 3)));
});

catat('tanggal mulai akhir pekan digeser ke Senin', function(){
  const r = resolveStart('2025-10-04'); // Sabtu
  assert(r.iso === '2025-10-06', 'hasil: ' + r.iso);
  assert(r.adjusted === true, 'flag adjusted harus true');
});

catat('tanggal mulai hari kerja tidak digeser', function(){
  const r = resolveStart('2025-10-06');
  assert(r.iso === '2025-10-06' && r.adjusted === false);
});

catat('dayDiff antar tanggal', function(){
  assert(dayDiff(parseISO('2025-10-06'), parseISO('2025-10-13')) === 7);
});

catat('startOfWeek = Senin, endOfWeek = Minggu', function(){
  assert(startOfWeek(parseISO('2025-10-08')).getDay() === 1);
  assert(endOfWeek(parseISO('2025-10-08')).getDay() === 0);
});

/* ---------- Normalisasi data ---------- */
catat('nama kosong ditolak', function(){
  assert(normalizeTask({ name: '   ', startDate: '2025-10-06', duration: 5 }) === null);
});

catat('durasi dibatasi 1..365', function(){
  assert(normalizeTask({ name: 'A', startDate: '2025-10-06', duration: 0 }).duration === 1);
  assert(normalizeTask({ name: 'A', startDate: '2025-10-06', duration: 9999 }).duration === 365);
});

catat('prioritas & warna tidak sah dikembalikan ke default', function(){
  const t = normalizeTask({ name: 'A', startDate: '2025-10-06', duration: 3, priority: 'darurat', color: 'biru' });
  assert(t.priority === 'sedang', 'prioritas: ' + t.priority);
  assert(t.color === PALETTE[0], 'warna: ' + t.color);
});

catat('induk yatim dibersihkan & id ganda dipisah', function(){
  const list = normalizeTasks([
    { id: 'x', name: 'Anak', startDate: '2025-10-06', duration: 1, parentId: 'hilang' },
    { id: 'y', name: 'Satu', startDate: '2025-10-06', duration: 1 },
    { id: 'y', name: 'Dua', startDate: '2025-10-06', duration: 1 }
  ]);
  assert(list[0].parentId === null, 'induk yatim harus dibersihkan');
  assert(list[1].id !== list[2].id, 'id harus unik');
});

/* ---------- Pohon tugas ---------- */
state.tasks = [
  { id: 'A', name: 'A', startDate: '2025-10-06', duration: 1, priority: 'sedang', color: PALETTE[0], parentId: null, order: 0, createdAt: 1 },
  { id: 'B', name: 'B', startDate: '2025-10-06', duration: 1, priority: 'sedang', color: PALETTE[0], parentId: 'A', order: 0, createdAt: 2 },
  { id: 'C', name: 'C', startDate: '2025-10-06', duration: 1, priority: 'sedang', color: PALETTE[0], parentId: 'B', order: 0, createdAt: 3 }
];
state.collapsed = new Set();

catat('flatten menghasilkan hierarki bertingkat', function(){
  const rows = flatten(buildTree(state.tasks));
  assert(rows.length === 3, 'jumlah baris: ' + rows.length);
  assert(rows[0].depth === 0 && rows[1].depth === 1 && rows[2].depth === 2,
    'kedalaman: ' + rows.map(function(r){ return r.depth; }).join(','));
});

catat('menyembunyikan induk menyembunyikan keturunannya', function(){
  state.collapsed = new Set(['A']);
  const rows = flatten(buildTree(state.tasks));
  assert(rows.length === 1 && rows[0].task.id === 'A', 'jumlah baris: ' + rows.length);
  const all = flatten(buildTree(state.tasks), 0, [], true);
  assert(all.length === 3, 'skipCollapse harus tetap 3: ' + all.length);
  state.collapsed = new Set();
});

catat('descendantsOf mengambil semua keturunan', function(){
  const d = descendantsOf('A');
  assert(d.length === 2, 'jumlah: ' + d.length);
});

catat('nextOrder menempatkan sub-tugas di akhir', function(){
  assert(nextOrder('A') === 1, 'hasil: ' + nextOrder('A'));
  assert(nextOrder(null) === 1, 'akar baru seharusnya order 1');
});

/* ---------- Rentang timeline & batang ---------- */
catat('rentang timeline selalu berisi hari ini dan rata Senin-Minggu', function(){
  const r = computeRange([]);
  assert(r.days >= 21, 'minimal 21 hari: ' + r.days);
  assert(r.min.getDay() === 1, 'harus Senin');
  assert(r.max.getDay() === 0, 'harus Minggu');
  const today = startOfToday();
  assert(r.min <= today && today <= r.max, 'hari ini di dalam rentang');
});

catat('posisi batang Gantt sesuai kolom', function(){
  const range = { min: parseISO('2025-10-06'), max: parseISO('2025-11-02'), days: 28 };
  const g = barGeometry({ startDate: '2025-10-06', duration: 5 }, range);
  assert(g.idx === 0 && g.span === 5, 'idx=' + g.idx + ' span=' + g.span);
  assert(g.left === 2, 'left: ' + g.left);
  assert(g.width === 5 * COL_W - 4, 'width: ' + g.width);
  const g2 = barGeometry({ startDate: '2025-10-13', duration: 1 }, range);
  assert(g2.idx === 7 && g2.left === 7 * COL_W + 2, 'idx=' + g2.idx);
});

/* ---------- Penyimpanan ---------- */
catat('penyimpanan localStorage bolak-balik', function(){
  const data = [{ id: 'z', name: 'Tes Simpan', startDate: '2025-10-06', duration: 4, priority: 'tinggi', color: '#123456', parentId: null, order: 0, createdAt: 1 }];
  const ok = writeTasks(data, TEST_KEY);
  if(!ok) return 'localStorage tidak tersedia - dilewati';
  const back = readTasks(TEST_KEY);
  localStorage.removeItem(TEST_KEY);
  assert(back && back.length === 1, 'data tidak kembali utuh');
  assert(back[0].name === 'Tes Simpan' && back[0].duration === 4, 'isi berubah');
  return true;
});

catat('escapeHtml menetralkan karakter HTML', function(){
  assert(escapeHtml('<b>&"x"</b>') === '&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;', escapeHtml('<b>&"x"</b>'));
});

catat('uid unik', function(){
  assert(uid() !== uid());
});

/* ---------- Kalender Proyek ---------- */
catat('hari kerja default: Sabtu & Minggu libur', function(){
  assert(isWorkingDay(parseISO('2025-10-06')) === true, 'Senin harus hari kerja');
  assert(isWorkingDay(parseISO('2025-10-04')) === false, 'Sabtu harus libur');
  assert(isWorkingDay(parseISO('2025-10-05')) === false, 'Minggu harus libur');
});

catat('hari libur khusus tidak dihitung sebagai hari kerja', function(){
  state.calendar.holidays = [{ date: '2025-10-08', name: 'Uji' }]; // Rabu
  assert(isWorkingDay(parseISO('2025-10-08')) === false, 'hari libur harus libur');
  // Senin + 5 hari kerja melewati libur Rabu -> Senin berikutnya
  assert(toISO(calcEndDate('2025-10-06', 5)) === '2025-10-13',
    'hasil: ' + toISO(calcEndDate('2025-10-06', 5)));
  state.calendar.holidays = [];
});

catat('akhir pekan dapat diubah lewat kalender', function(){
  state.calendar.weekendDays = [5, 6]; // Jumat & Sabtu
  assert(isWorkingDay(parseISO('2025-10-12')) === true, 'Minggu harus jadi hari kerja');
  assert(isWorkingDay(parseISO('2025-10-10')) === false, 'Jumat harus jadi akhir pekan');
  // Kamis + 2 hari kerja -> Minggu (Jumat & Sabtu libur)
  assert(toISO(calcEndDate('2025-10-09', 2)) === '2025-10-12',
    'hasil: ' + toISO(calcEndDate('2025-10-09', 2)));
  state.calendar.weekendDays = [0, 6];
});

catat('tanggal mulai di hari libur digeser ke hari kerja', function(){
  state.calendar.holidays = [{ date: '2025-10-06', name: 'Uji' }]; // Senin
  const r = resolveStart('2025-10-06');
  assert(r.iso === '2025-10-07' && r.adjusted === true, 'hasil: ' + r.iso);
  state.calendar.holidays = [];
});

catat('nextWorkingDay melompati akhir pekan & libur', function(){
  assert(toISO(nextWorkingDay(parseISO('2025-10-04'))) === '2025-10-06');
  state.calendar.holidays = [{ date: '2025-10-06', name: 'Uji' }];
  assert(toISO(nextWorkingDay(parseISO('2025-10-04'))) === '2025-10-07');
  state.calendar.holidays = [];
});

catat('normalizeCalendar menolak kalender tanpa hari kerja', function(){
  const cal = normalizeCalendar({ weekendDays: [0, 1, 2, 3, 4, 5, 6], holidays: [] });
  assert(cal.weekendDays.length < 7, 'harus tersisa minimal satu hari kerja');
});

/* ---------- Penjadwalan predecessor ---------- */
function buatTugas(id, start, dur, preds){
  return {
    id: id, name: id, startDate: start, duration: dur,
    priority: 'sedang', color: PALETTE[0], parentId: null,
    predecessors: preds || [], order: 0, createdAt: 1
  };
}

catat('FS mendorong tanggal mulai setelah pendahulu selesai', function(){
  state.tasks = [
    buatTugas('P', '2025-10-06', 5), // Senin..Jumat
    buatTugas('S', '2025-10-06', 2, [{ taskId: 'P', type: 'FS', delay: 0 }])
  ];
  const n = applyScheduling();
  assert(state.tasks[1].startDate === '2025-10-13', 'hasil: ' + state.tasks[1].startDate);
  assert(n >= 1, 'jumlah penyesuaian: ' + n);
});

catat('FS dengan jeda menambah hari kerja kosong', function(){
  state.tasks = [
    buatTugas('P', '2025-10-06', 5),
    buatTugas('S', '2025-10-06', 2, [{ taskId: 'P', type: 'FS', delay: 2 }])
  ];
  applyScheduling();
  assert(state.tasks[1].startDate === '2025-10-15', 'hasil: ' + state.tasks[1].startDate);
});

catat('SS tanpa jeda memakai tanggal mulai yang sama', function(){
  state.tasks = [
    buatTugas('P', '2025-10-06', 5),
    buatTugas('S', '2025-10-06', 2, [{ taskId: 'P', type: 'SS', delay: 0 }])
  ];
  const n = applyScheduling();
  assert(state.tasks[1].startDate === '2025-10-06', 'hasil: ' + state.tasks[1].startDate);
  assert(n === 0, 'seharusnya tidak ada penyesuaian, dapat: ' + n);
});

catat('SS dengan jeda 1 hari kerja', function(){
  state.tasks = [
    buatTugas('P', '2025-10-06', 5),
    buatTugas('S', '2025-10-06', 2, [{ taskId: 'P', type: 'SS', delay: 1 }])
  ];
  applyScheduling();
  assert(state.tasks[1].startDate === '2025-10-07', 'hasil: ' + state.tasks[1].startDate);
});

catat('penjadwalan berantai mengikuti urutan topologis', function(){
  state.tasks = [
    buatTugas('A', '2025-10-06', 1),
    buatTugas('B', '2025-10-06', 1, [{ taskId: 'A', type: 'FS', delay: 0 }]),
    buatTugas('C', '2025-10-06', 1, [{ taskId: 'B', type: 'FS', delay: 0 }])
  ];
  applyScheduling();
  assert(state.tasks[1].startDate === '2025-10-07', 'B: ' + state.tasks[1].startDate);
  assert(state.tasks[2].startDate === '2025-10-08', 'C: ' + state.tasks[2].startDate);
});

catat('siklus predecessor diputus saat memuat data', function(){
  const list = normalizeTasks([
    buatTugas('X', '2025-10-06', 1, [{ taskId: 'Y', type: 'FS', delay: 0 }]),
    buatTugas('Y', '2025-10-06', 1, [{ taskId: 'X', type: 'FS', delay: 0 }])
  ]);
  assert(topoOrder(list).hasCycle === false, 'siklus seharusnya sudah diputus');
  const total = list.reduce(function(a, t){ return a + t.predecessors.length; }, 0);
  assert(total <= 1, 'sisa edge: ' + total);
});

catat('predecessor diri sendiri & tak dikenal dibuang', function(){
  const list = normalizeTasks([
    buatTugas('A', '2025-10-06', 1, [
      { taskId: 'A', type: 'FS', delay: 0 },
      { taskId: 'hilang', type: 'SS', delay: 3 }
    ])
  ]);
  assert(list[0].predecessors.length === 0, 'sisa: ' + list[0].predecessors.length);
});

catat('tugas tanpa predecessor tidak digeser', function(){
  state.tasks = [ buatTugas('Bebas', '2025-10-06', 3) ];
  const n = applyScheduling();
  assert(n === 0 && state.tasks[0].startDate === '2025-10-06', 'n=' + n);
});

state.tasks = [];
state.collapsed = new Set();
state.calendar = { weekendDays: [0, 6], holidays: [] };

/* ---------- Resource Management (Tahap 3) ---------- */
catat('normalizeMember memvalidasi data anggota', function(){
  assert(normalizeMember({ name: '   ' }) === null, 'nama kosong harus ditolak');
  const m = normalizeMember({ name: ' Budi ', email: 'budi@x.com', role: '', salary: -5 });
  assert(m.name === 'Budi', 'nama: ' + m.name);
  assert(m.role === 'Anggota', 'peran default: ' + m.role);
  assert(m.salary === 0, 'gaji negatif harus jadi 0: ' + m.salary);
  const m2 = normalizeMember({ name: 'Sari', salary: '8500000' });
  assert(m2.salary === 8500000, 'gaji string: ' + m2.salary);
});

catat('normalizeMembers memisahkan id anggota ganda', function(){
  const list = normalizeMembers([
    { id: 'm', name: 'A' },
    { id: 'm', name: 'B' },
    { name: '   ' }
  ]);
  assert(list.length === 2, 'jumlah: ' + list.length);
  assert(list[0].id !== list[1].id, 'id harus unik');
});

catat('daftar alokasi dibersihkan dari duplikat', function(){
  const t = normalizeTask({ name: 'X', startDate: '2025-10-06', duration: 1, resources: ['a', 'a', 'b', ''] });
  assert(t.resources.join(',') === 'a,b', 'hasil: ' + t.resources.join(','));
});

catat('alokasi ke anggota tak dikenal dibuang', function(){
  state.members = [{ id: 'm1', name: 'A', email: '', role: 'Dev', salary: 0, createdAt: 1 }];
  state.tasks = [
    Object.assign(buatTugas('T', '2025-10-06', 2), { resources: ['m1', 'm-hilang', 'T'] })
  ];
  const changed = pruneResources();
  assert(changed === true, 'harus melaporkan perubahan');
  assert(state.tasks[0].resources.length === 1 && state.tasks[0].resources[0] === 'm1',
    'sisa: ' + JSON.stringify(state.tasks[0].resources));
  state.members = [];
  state.tasks = [];
});

/* ---------- Analisis Proyek: Critical Path & PERT (Tahap 3) ---------- */
catat('critical path menandai rantai dengan float 0', function(){
  state.tasks = [
    buatTugas('A', '2025-10-06', 5),
    buatTugas('B', '2025-10-13', 1, [{ taskId: 'A', type: 'FS', delay: 0 }]),
    buatTugas('D', '2025-10-06', 1)
  ];
  const a = computeAnalysis();
  assert(a.critical.has('A') && a.critical.has('B'), 'A dan B harus kritis');
  assert(!a.critical.has('D'), 'D seharusnya tidak kritis');
  assert(a.float.get('A') === 0, 'float A = ' + a.float.get('A'));
  assert(a.float.get('D') > 0, 'float D = ' + a.float.get('D'));
  assert(a.duration >= 6, 'durasi proyek: ' + a.duration);
});

catat('analisis memperhitungkan jeda SS', function(){
  state.tasks = [
    buatTugas('P', '2025-10-06', 5),
    buatTugas('S', '2025-10-07', 2, [{ taskId: 'P', type: 'SS', delay: 1 }])
  ];
  const a = computeAnalysis();
  assert(a.es.get('S') === a.es.get('P') + 1,
    'ES S = ' + a.es.get('S') + ', ES P = ' + a.es.get('P'));
});

catat('peringkat PERT: FS turun kolom, SS tetap kolom', function(){
  state.tasks = [
    buatTugas('A', '2025-10-06', 2),
    buatTugas('B', '2025-10-07', 2, [{ taskId: 'A', type: 'FS', delay: 0 }]),
    buatTugas('C', '2025-10-07', 2, [{ taskId: 'A', type: 'SS', delay: 1 }]),
    buatTugas('D', '2025-10-08', 2, [{ taskId: 'B', type: 'FS', delay: 0 }])
  ];
  const a = computeAnalysis();
  assert(a.ranks.get('A') === 0, 'A: ' + a.ranks.get('A'));
  assert(a.ranks.get('B') === 1, 'B: ' + a.ranks.get('B'));
  assert(a.ranks.get('C') === 0, 'C: ' + a.ranks.get('C'));
  assert(a.ranks.get('D') === 2, 'D: ' + a.ranks.get('D'));
});

catat('diagram PERT menghasilkan node dan panah', function(){
  state.tasks = [
    buatTugas('A', '2025-10-06', 2),
    buatTugas('B', '2025-10-08', 2, [{ taskId: 'A', type: 'FS', delay: 0 }])
  ];
  const svg = buildPertSvg(computeAnalysis());
  assert(svg.indexOf('<svg') === 0, 'harus berupa elemen svg');
  assert((svg.match(/class="pert-node/g) || []).length === 2, 'jumlah node harus 2');
  assert(svg.indexOf('pert-edge') !== -1, 'harus ada panah penghubung');
  assert(svg.indexOf('pert-arw') !== -1, 'harus ada marker panah');
});

state.tasks = [];
state.members = [];
state.collapsed = new Set();
state.calendar = { weekendDays: [0, 6], holidays: [] };

/* ---------- Hasil ---------- */
(function tampilkan(){
  const lulus = hasil.filter(function(h){ return h.ok; }).length;
  const gagal = hasil.length - lulus;
  const box = document.getElementById('summary');
  box.className = 'summary ' + (gagal ? 'fail' : 'ok');
  box.textContent = gagal
    ? gagal + ' dari ' + hasil.length + ' uji GAGAL'
    : 'Semua ' + hasil.length + ' uji lulus';
  document.getElementById('results').innerHTML = hasil.map(function(h){
    return '<li class="' + (h.ok ? 'pass' : 'fail') + '">' +
      '<span class="mark">' + (h.ok ? 'LULUS' : 'GAGAL') + '</span>' +
      '<span>' + escapeHtml(h.nama) + (h.ket ? ' <span class="ket">- ' + escapeHtml(h.ket) + '</span>' : '') + '</span></li>';
  }).join('');
})();
