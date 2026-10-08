# Riwayat Chat — Aplikasi Manajemen Proyek (Gantt Chart)

Dokumen ini merangkum percakapan dan perkembangan proyek dari Tahap 1 sampai Tahap 3.

---

## Ringkasan Proyek

- **Jenis:** Website statis (HTML + CSS + JavaScript murni, tanpa framework/backend)
- **Penyimpanan data:** `localStorage`
- **Bahasa UI:** Bahasa Indonesia
- **Cara menjalankan:** klik ganda `index.html` langsung di browser
- **File utama:** `index.html`, `styles.css`, `app.js`
- **File pengujian:** `uji.html` + `uji.js` (45 uji, berjalan di browser)

---

## Tahap 1 — CRUD Tugas & Tampilan Gantt (selesai)

**Fitur:**
- Modal form tugas: nama, durasi (hari kerja), tanggal mulai, prioritas, warna indikator
- Sub-tugas bertingkat (parent-child) dengan pilihan parent di dropdown
- Tree flatten + collapse/expand (state disimpan di `UI_KEY` = `manajemenProyek.ui.v1`)
- Tampilan Gantt Chart: kolom hari (36px), header bulan + hari, garis hari ini, shading akhir pekan (`.nc-col`)
- Data contoh 13 tugas, tombol Hapus Semua, toast, hint bar

---

## Tahap 2 — Predecessor & Kalender Proyek (selesai)

**Fitur:**
- Field predecessors: maks 8, tipe **FS/SS**, delay (jeda) hari kerja, validasi `errPred`
- `applyScheduling()`: penjadwalan otomatis topologi — ES snap ke hari kerja; FS → `nextWorkingDay(pEnd) + delay`; SS → `pStart + delay`; hanya memajukan tanggal; dijalankan saat init, simpan/edit, hapus, ganti kalender, loadSample; toast jumlah tanggal yang disesuaikan
- Anti-siklus: `topoOrder`, `breakPredecessorCycles`, `transitiveDependents`
- Link antar bar: overlay SVG dengan marker `arw` (FS) & `arw-ss` (SS), label + `<title>` di dalam `<path>`
- **Kalender Proyek:** 7 checkbox akhir pekan + daftar hari libur khusus (`CAL_KEY` = `manajemenProyek.kalender.v1`), header libur oranye
- Semua perhitungan tanggal mengikuti hari kerja kalender; tanggal mulai non-kerja digeser maju

---

## Tahap 3 — Resource Management & Analisis Proyek (selesai)

**Fitur:**
- **Tim Proyek** (`TEAM_KEY` = `manajemenProyek.tim.v1`): CRUD anggota (nama, email valid via `EMAIL_RE`, peran, gaji `formatRupiah`)
- Alokasi anggota ke tugas (chips `resources`), validasi `errMember`, `pruneResources()` membuang alokasi yang tak terdaftar
- **Analisis Proyek:** chip ringkasan, **Critical Path** (CPM forward/backward pass → `state.criticalIds`, bar kritis class `.critical`), tabel `criticalBody`, **diagram PERT** (`buildPertSvg`, node + panah berlabel FS/SS + delay)
- Tooltip bar: "· Anggota: …"; `loadSample` menyertakan `resources`

---

## Daftar Bug yang Diperbaiki (selama review)

| # | Bug | Perbaikan |
|---|-----|-----------|
| 1 | Padding rentang timeline salah saat < 3 minggu | atur −7/+14 |
| 2 | Tinggi area Gantt tidak pas | `100vh − 150px` |
| 3 | Selisih scroll kiri/kanan 12px | `padding-bottom: 12px` |
| 4 | `<title>` SVG di luar `<path>` (tooltip tidak muncul) | dipindahkan ke dalam `<path>` |
| 5 | Selektor CSS mati `.link.ss + …` | diganti marker SVG terpisah (`arw-ss`) |
| 6 | Fungsi `snapWorkingDay` tak terpakai | dihapus |
| 7 | Pesan error menyebut "akhir pekan" padahal semua hari non-kerja | diganti "bukan hari kerja" |
| 8 | Filter `resources` salah saat normalisasi | diganti `pruneResources()` |
| 9 | `pruneResources` tertanam di dalam `normalizeTasks` | disusun ulang jadi fungsi terpisah |
| 10 | Ringkasan analisis kosong menampilkan angka salah | diperbaiki (tampil "—" saat kosong) |
| 11 | `loadSample` tidak mengisi `resources` | ditambahkan |

---

## Pengujian

- **`uji.html`** — runner uji browser: memuat `app.js` lalu `uji.js`, helper `catat(nama, fn)` + `assert(cond, pesan)`, hasil dirender ke `#summary` / `#results`
- **Total 45 uji:** Tahap 1 = 23, Tahap 2 = +14, Tahap 3 = +8
- Verifikasi yang sudah dilakukan: **statis** (pencocokan ID `index.html` ↔ `app.js` — 25 ID Tahap 3 cocok, 17 fungsi Tahap 3 terdefinisi, pembacaan ulang seams kode)

### Keterbatasan (penting)

> Terminal di lingkungan ini tidak dapat dijalankan (error: *"Bash is required but was not found on this Windows system"* — butuh Git for Windows / `CODEBUFF_GIT_BASH_PATH`). Karena itu **45 uji belum pernah dijalankan secara runtime**, dan perilaku render/klik/modal/persistensi belum diverifikasi di browser.
>
> **Untuk verifikasi: buka `uji.html` di browser** dan lihat hasil GAGAL/PASS-nya. Jika ada error konsol atau uji GAGAL, laporkan pesannya untuk diperbaiki.

---

## Status Akhir

- [x] Tahap 1 — CRUD tugas, sub-tugas, tampilan Gantt
- [x] Tahap 2 — Predecessor FS/SS + delay, Kalender Proyek
- [x] Tahap 3 — Resource Management, Critical Path + PERT
- [x] Review statis & perbaikan bug
- [ ] Verifikasi runtime (`uji.html` di browser) — menunggu user
