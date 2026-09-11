# Fitur — Hajat Manager

Dokumen ini merinci fitur MVP (Fase 1-6) dan rencana Fase 7, beserta user story & alur.

## 1. Ringkasan Fitur

| Kategori | Fitur MVP | Fase 7 (Offline) |
|---|---|---|
| Acara | Buat/edit/hapus acara, multi-admin tak terbatas | - |
| Anggota | Search user & add sebagai OWNER/ADMIN/VIEWER, hapus/ganti role | - |
| Buku Tamu | Input manual, import Excel, hapus/edit | - |
| Pemberian | Input satset dengan suggest + chips, edit/hapus, search/sort | Queue offline + Push manual |
| Rekap | Total tamu, total Rp, per alamat, per metode, filter | - |
| Export | Excel & PDF dengan opsi urutan + group by alamat | Export tetap bisa offline |
| Audit | Log siapa input/edit/hapus | Log push sync |
| Auth | Daftar/login Google & Email, semua user = User | - |

## 2. User Story

### Sebagai User Baru
- Saya bisa **daftar** via Google atau Email/Password (pilih salah satu) agar cepat masuk.
- Saya bisa **login** dan melihat dashboard "Acara Saya" (acara yang saya buat atau saya diundang).

### Sebagai Pembuat Acara (otomatis OWNER)
- Saya buat acara: isi `namaAcara, tanggal, lokasi, catatan` → saya otomatis jadi OWNER.
- Di **Setting → Kelola Anggota**, saya search user lain by `nama/email` → add sebagai `ADMIN` (bisa input) atau `OWNER`/`VIEWER` (bisa lihat rekap). Jumlah tak terbatas.
- Saya bisa hapus/ganti role anggota (hanya OWNER bisa).
- Saya bisa atur **preset nominal** (ex: 20000, 50000, 100000) untuk chips; jika kosong, sistem pakai Top 4 nominal paling sering.

### Sebagai Panitia (ADMIN di acara)
- Saya buka acara → tab **Buku Tamu** → input `nama + alamat` satu per satu atau **import Excel** (kolom Nama, Alamat). Ini jadi master suggest.
- Saya pindah tab **Pemberian** → form di atas:
  - Ketik `nama` 2 huruf → muncul suggest 5 nama **dari Buku Tamu yang BELUM tercatat** (filter tidak tampil yang sudah tercatat) → pilih → `alamat` auto-fill.
  - Di atas form ada **4 chip alamat Top** (desa paling sering di acara ini) → klik langsung isi alamat.
  - **4 chip nominal** → klik langsung isi nominal.
  - Pilih `metode`: default `AMPLOP` (atau `CASH`), opsi `QRIS, TRANSFER, BARANG`.
  - Isi `catatan` opsional (ex: "titip salam"). **Jika duplicate `nama+alamat` sudah ada, wajib isi catatan/penanda** (contoh: "Krajan Lor", "anak Pak RT") — modal akan paksa isi sebelum simpan.
  - Tekan Simpan → data masuk tabel bawah + audit log "ADMIN X input SUTRISNO 100rb".
- Saya bisa **search** tamu (nama/alamat), **sort** klik header (Nama A-Z, Alamat, Nominal, Waktu), **edit/hapus** (tercatat di log).
- Saya lihat **Rekap** → total tamu, total Rp, tabel per alamat & per metode.

### Sebagai Tuan Rumah (OWNER/VIEWER)
- Saya login → dashboard hanya lihat acara saya diundang.
- Saya buka acara → **tidak bisa edit** (VIEWER) atau **bisa edit** (jika OWNER) — tergantung role yang diberikan.
- Saya bisa **search/filter** tamu, lihat rekap, dan **export Excel/PDF** sendiri tanpa minta panitia.
- Saat export, saya pilih **urutan**: `Nama A-Z`, `Nama Z-A`, `Alamat A-Z lalu Nama`, `Nominal terbesar`, `Waktu input`. Opsi centang `Group by alamat (subtotal per desa)`.

## 3. Alur Satset (Detail)

```
1. Panitia buka /events/[id]/pemberian di HP
2. Form auto-focus di field Nama
3. Ketik "Su" → dropdown: [Sutrisno - Krajan, Susi - Krakan] (dari GuestBook)
4. Tap Sutrisno → field Alamat terisi "Krajan" otomatis
   → Jika tidak ada di suggest, panitia ketik manual alamat
   → Chip alamat Top 4 di atas form bisa di-tap untuk ganti
5. Tap chip nominal "100.000" → field nominal terisi 100000 (format Rp 100.000)
6. Metode default AMPLOP → jika QRIS, ubah select
7. Catatan kosongkan jika tidak perlu
8. Tap Simpan (atau Enter) → toast "Tersimpan" → form reset, fokus balik ke Nama
9. Tabel bawah update realtime, total di header naik
10. Jika salah input → tap Edit di baris → ubah → simpan → audit log tercatat
```

**Kenapa cepat:** Tidak perlu ketik alamat lengkap tiap kali, cukup tap chip atau pilih suggest.

## 4. Aturan Validasi

- `nama` wajib, minimal 2 huruf
- `alamat` wajib
- `nominal` wajib, angka bulat Rupiah > 0 (tidak ada sen)
- `metode` wajib, default AMPLOP
- `catatan` opsional, maks 200 karakter — **wajib jika `nama+alamat` sudah ada (duplicate A, case-insensitive)**
- `GuestBook` `nama+alamat` wajib
- **Duplicate:** `nama+alamat` persis (insensitive) untuk `eventId` sama dianggap orang yang sama. Suggest filter tidak tampil yang sudah tercatat. API `POST /guests` return `409 DUPLICATE_NEED_NOTE` jika tanpa catatan; `GET /guests/check?nama=&alamat=` untuk live warning (banner kuning di form).

## 5. Rekap & Export

**Rekap yang tampil di UI:**
- Header: Total Tamu, Total Rp (format Rp 12.345.000)
- Tabel per Alamat: Alamat | Jumlah Tamu | Total Rp (urut total terbesar)
- Tabel per Metode: Metode | Jumlah | Total

**Export:**
- Modal sebelum export: pilih Urutan + checkbox Group by Alamat.
- Excel/CSV & PDF **selalu semua data di DB (abaikan filter tabel)** + **footer TOTAL selalu ada** (Rp + jumlah tamu + nominal mentah).
- Excel: Sheet 1 = Daftar Tamu (No, Nama, Alamat, Nominal, Metode, Catatan, Petugas, Waktu) + footer `TOTAL,,,26600000`, Sheet 2 = Rekap Per Alamat + footer TOTAL.
- PDF: Kop "Laporan Pemberian - Nama Acara - Tanggal", tabel + `<tfoot>TOTAL Rp... (N tamu)</tfoot>` + div `TOTAL KESELURUHAN` di bawah.

## 6. Audit Log

- Setiap `CREATE_GUEST, UPDATE_GUEST, DELETE_GUEST, ADD_MEMBER, REMOVE_MEMBER, UPDATE_MEMBER_ROLE` dicatat.
- Tampilkan di `Setting → Log Aktivitas`: `Jam | User | Aksi | Target | Detail (before→after)`.
- Filter by user & tanggal.

## 7. Batasan MVP

- Tidak ada foto bukti amplop (skip sesuai request).
- Tidak ada reminder WA/email.
- 1 acara = 1 laporan (tidak ada gabung acara).
- Offline belum ada di MVP (Fase 7).

## 8. Fase 7 — Offline + Push (Rencana)

- Panitia input saat offline → data simpan di Dexie + masuk `syncQueue`.
- Indikator "Belum di-push: 12 data".
- Tombol `Push ke Server` → kirim batch → server upsert → tampil sukses/gagal per baris.
- Jika konflik (edit offline & online bersamaan) → tampil dialog pilih versi.

## 9. Kriteria Selesai (Definition of Done) per Fitur

- [ ] Buku Tamu bisa import Excel 100 baris tanpa error
- [ ] Pemberian suggest muncul <300ms setelah ketik 2 huruf
- [ ] Chip alamat Top 4 update setelah 5 input baru
- [ ] Search tamu filter realtime tanpa reload
- [ ] Export Excel dengan group by alamat menghasilkan subtotal benar
- [ ] Audit log tercatat untuk semua aksi panitia
- [ ] Owner VIEWER tidak bisa edit (tombol edit hidden)
- [ ] Login Google berhasil di homelab dengan HTTPS
