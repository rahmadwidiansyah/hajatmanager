# E2E Test Checklist — Anti-Double Sync (localId)

Dokumen ini adalah checklist manual untuk memverifikasi bahwa mekanisme
`localId` bekerja benar di semua skenario. Jalankan setiap skenario setelah
deploy migration `20260920000000_add_local_id`.

---

## Setup Awal

- [ ] Jalankan `npx prisma migrate deploy` di server
- [ ] Build Flutter terbaru di semua platform target
- [ ] Bersihkan data lama: hapus acara test lama atau buat acara baru khusus test
- [ ] Siapkan minimal 2 device/emulator dengan akun ADMIN yang sama

---

## Skenario 1: Online Normal (Happy Path)

**Tujuan:** Verifikasi input saat online tidak menghasilkan dobel.

| # | Langkah | Expected |
|---|---------|----------|
| 1.1 | Buka app, pastikan koneksi aktif | Badge pending = 0 |
| 1.2 | Input pemberian "Budi / Kedungrejo / 100000 / AMPLOP" | Tampil di list langsung |
| 1.3 | Tunggu 2 detik | `pending = 0`, hanya 1 baris di list |
| 1.4 | Buka web, cek di halaman acara yang sama | Tepat 1 baris "Budi" |
| 1.5 | Di web, cek kolom `localId` di DB: `SELECT localId, id FROM "Guest" WHERE nama='Budi'` | `localId` terisi UUID, `id` berbeda (CUID server) |
| 1.6 | Restart app, buka layar acara | Tetap 1 baris, tidak dobel |

---

## Skenario 2: Offline → Online (Core Use Case)

**Tujuan:** Data yang diinput offline tetap 1 baris setelah sync.

| # | Langkah | Expected |
|---|---------|----------|
| 2.1 | Matikan WiFi/data di device | Indikator offline muncul |
| 2.2 | Input 3 pemberian berbeda | Tampil di list lokal, badge pending = 3 |
| 2.3 | Nyalakan kembali WiFi/data | — |
| 2.4 | Tunggu maks 30 detik (auto-sync) | Badge pending = 0 |
| 2.5 | Cek list pemberian di app | Tepat 3 baris baru, tidak dobel |
| 2.6 | Cek di web / DB | Tepat 3 baris baru, semua punya `localId` |
| 2.7 | Tunggu 30 detik lagi (sync kedua) | Tetap 3 baris, tidak bertambah |

---

## Skenario 3: Online → Offline → Online (Reconnect Mid-Session)

**Tujuan:** Data yang berhasil POST saat online tidak di-insert ulang saat flush outbox.

| # | Langkah | Expected |
|---|---------|----------|
| 3.1 | Input pemberian saat online | POST berhasil, outbox kosong |
| 3.2 | Matikan koneksi, input 2 pemberian lagi | Masuk outbox, badge pending = 2 |
| 3.3 | Nyalakan koneksi | Auto-sync |
| 3.4 | Cek list | Tepat 3 baris total (1 + 2), tidak dobel |
| 3.5 | DB: `SELECT COUNT(*) FROM "Guest" WHERE "eventId"='...'` | Count = jumlah yang diinput, tidak lebih |

---

## Skenario 4: Dua Device Bersamaan (Multi-Admin)

**Tujuan:** Dua admin input bersamaan tidak menghasilkan data dobel di server.

| # | Langkah | Expected |
|---|---------|----------|
| 4.1 | Device A: input "Siti / Kertosari / 150000 / QRIS" | Tampil di A |
| 4.2 | Device B (bersamaan): input "Siti / Kertosari / 150000 / QRIS" (sama persis) | Tampil di B |
| 4.3 | Tunggu kedua device sync (30 detik) | — |
| 4.4 | Cek list di Device A | Ada warning duplikat (DUPLICATE_NEED_NOTE) |
| 4.5 | Cek list di Device B | Sama — salah satu masuk antrian konflik |
| 4.6 | DB: `SELECT * FROM "Guest" WHERE nama='Siti'` | 1 baris (yang berhasil pertama), satu lagi pending konflik |
| 4.7 | Di app yang ada konflik: tambah catatan "Hajatan Joko" → simpan ulang | Tersync, total 2 baris berbeda (beda catatan) |

---

## Skenario 5: Retry (Double-tap / Network Blip)

**Tujuan:** POST yang dikirim 2x karena network blip tidak menghasilkan dobel.

| # | Langkah | Expected |
|---|---------|----------|
| 5.1 | Simulasi double-tap (tap Simpan 2x cepat) | Guard `_saveToken` mencegah request kedua |
| 5.2 | Matikan koneksi tepat setelah tap Simpan | Data masuk outbox, `localId` tersimpan |
| 5.3 | Nyalakan koneksi — POST gagal tadi di-retry via outbox flush | — |
| 5.4 | Cek list | 1 baris saja (server temukan `localId` sudah ada → return existing) |
| 5.5 | DB: `SELECT COUNT(*) FROM "Guest" WHERE "localId"='<uuid>'` | Count = 1 |

---

## Skenario 6: Buku Tamu (GuestBook) Anti-Double

**Tujuan:** Sama dengan skenario 2–3 tapi untuk buku tamu.

| # | Langkah | Expected |
|---|---------|----------|
| 6.1 | Offline, tambah buku tamu "Rini / Sumbersari" | Tampil di list lokal |
| 6.2 | Online, tunggu sync | 1 baris di list, 1 di DB |
| 6.3 | Sync kedua (30 detik) | Tetap 1 baris |
| 6.4 | DB: `SELECT localId, id FROM "GuestBook" WHERE nama='Rini'` | `localId` terisi, `id` = CUID server |

---

## Skenario 7: Update setelah Sync (id Rekonsiliasi Benar)

**Tujuan:** Setelah `localId → server-CUID` rekonsiliasi, operasi UPDATE/DELETE berjalan ke id yang benar.

| # | Langkah | Expected |
|---|---------|----------|
| 7.1 | Input pemberian offline | id lokal = UUID (localId) |
| 7.2 | Sync online | id lokal diganti server-CUID oleh `updateGuestServerId()` |
| 7.3 | Edit pemberian tersebut (ubah nominal) | PATCH ke `/api/guests/<server-CUID>` |
| 7.4 | Cek DB | Nominal terupdate di baris yang benar |
| 7.5 | Hapus pemberian tersebut | DELETE berhasil, baris hilang dari list dan DB |

---

## Skenario 8: List Acara + Log (Tidak Ada Flash Kosong)

**Tujuan:** UX — tidak ada flash kosong saat refetch.

| # | Langkah | Expected |
|---|---------|----------|
| 8.1 | Buka app dengan koneksi bagus | List acara muncul dari cache lokal <100ms |
| 8.2 | Sambil data lama tampil, pull server berjalan di BG | Spinner kecil di AppBar (bukan layar kosong) |
| 8.3 | Data baru tiba | List diupdate in-place, tidak flash kosong |
| 8.4 | Buka Log aktivitas | Spinner kecil di AppBar, data lama tetap tampil saat filter berubah |
| 8.5 | Ganti filter chip "CREATE_GUEST" | Data lama tetap saat load, lalu replaced dengan hasil filter |
| 8.6 | Matikan koneksi, buka Log | Error banner di atas list, list lama masih kelihatan |

---

## Skenario 9: Pertama Kali Install (Empty State + Skeleton)

**Tujuan:** Skeleton muncul dengan benar saat tidak ada data lokal.

| # | Langkah | Expected |
|---|---------|----------|
| 9.1 | Fresh install / clear data app | — |
| 9.2 | Login, buka daftar acara | Skeleton shimmer muncul selama fetch |
| 9.3 | Data tiba dari server | Skeleton diganti list acara |
| 9.4 | Buka salah satu acara | Skeleton muncul di tab Input/Buku Tamu |
| 9.5 | Data lokal tersedia | Skeleton hilang, data tampil |

---

## Verifikasi Database (Post-Test)

Jalankan query ini di PostgreSQL setelah semua skenario:

```sql
-- Tidak boleh ada guest dengan localId yang sama (duplikat terdeteksi)
SELECT localId, COUNT(*) FROM "Guest"
WHERE localId IS NOT NULL
GROUP BY localId HAVING COUNT(*) > 1;
-- Expected: 0 rows

-- Tidak boleh ada guestBook dengan localId yang sama
SELECT localId, COUNT(*) FROM "GuestBook"
WHERE localId IS NOT NULL
GROUP BY localId HAVING COUNT(*) > 1;
-- Expected: 0 rows

-- Semua guest dari native app (ada localId) harus punya server CUID yang berbeda dari localId
SELECT id, localId FROM "Guest"
WHERE localId IS NOT NULL AND id = localId;
-- Expected: 0 rows (id lokal sementara sudah ter-replace server id)
```

---

## Catatan

- Skenario 4 (konflik) adalah satu-satunya yang boleh menghasilkan warning — ini by design.
- Semua skenario lain: `0 rows` di query verifikasi = PASS.
- Jika ada skenario FAIL, cek `console.debug("[offline]", ...)` di web atau Logcat/DevTools di Flutter.
