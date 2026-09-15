# API — Hajat Manager

> Base URL lokal: `http://localhost:3000`  
> Semua endpoint butuh session login kecuali `/api/auth/*`. Cek `EventMember` untuk otorisasi per `eventId`.

## 1. Auth

Dikelola **Auth.js v5**. Endpoint otomatis:

| Method | Endpoint | Keterangan |
|---|---|---|
| POST | `/api/auth/signin` | Login (credentials/google) |
| POST | `/api/auth/signout` | Logout |
| GET | `/api/auth/session` | Cek session |
| GET/POST | `/api/auth/callback/google` | Callback Google OAuth |

**Contoh session:**
```json
{
  "user": { "id": "cuid123", "name": "Widi", "email": "widi@gmail.com", "image": "..." },
  "expires": "2026-10-09T00:00:00.000Z"
}
```

**Pendaftaran (custom):**
| Method | Endpoint | Body | Response |
|---|---|---|---|
| POST | `/api/register` | `{ name, email, password }` | `{ id, email }` |

**Login Google native (APK):**
| Method | Endpoint | Body | Response |
|---|---|---|---|
| GET | `/api/auth/mobile/config` | - | `{ googleServerClientId }` (null = Google nonaktif) |
| POST | `/api/auth/mobile/google` | `{ idToken }` | Set-Cookie session Auth.js + `{ ok, user }` |

Validasi Zod: `name min 2, email valid, password min 6`.

## 2. Event (Acara)

| Method | Endpoint | Auth | Body | Keterangan |
|---|---|---|---|---|
| GET | `/api/events` | Ya | - | List acara dimana user jadi member |
| POST | `/api/events` | Ya | `{ namaAcara, tanggal, lokasi?, catatan? }` | Buat acara, otomatis jadi OWNER |
| GET | `/api/events/[id]` | Member | - | Detail acara + rekap |
| PATCH | `/api/events/[id]` | OWNER | `{ namaAcara?, tanggal?, lokasi?, catatan? }` | Edit acara |
| DELETE | `/api/events/[id]` | OWNER | - | Hapus acara (cascade) |

**Contoh POST /api/events:**
```json
// Request
{ "namaAcara": "Pernikahan Budi & Ani", "tanggal": "2026-09-20T00:00:00Z", "lokasi": "Balai Desa Krajan" }

// Response 201
{ "id": "evt123", "namaAcara": "Pernikahan Budi & Ani", "tanggal": "...", "members": [{ "userId": "u1", "role": "OWNER" }] }
```

## 3. Event Member (Unlimited)

| Method | Endpoint | Auth | Body |
|---|---|---|---|
| GET | `/api/events/[id]/members` | Member | - |
| POST | `/api/events/[id]/members` | OWNER | `{ email, role: "ADMIN\|OWNER\|VIEWER" }` atau `{ userId, role }` |
| PATCH | `/api/events/[id]/members/[userId]` | OWNER | `{ role }` |
| DELETE | `/api/events/[id]/members/[userId]` | OWNER | - |
| GET | `/api/users/search?q=...` | Ya | - | Search user untuk add member |

**Contoh search:**
```
GET /api/users/search?q=budi
→ [{ "id": "u2", "name": "Budi", "email": "budi@gmail.com" }]
```

**Contoh add member:**
```json
POST /api/events/evt123/members
{ "email": "budi@gmail.com", "role": "VIEWER" }
→ 201 { "id": "em123", "role": "VIEWER" }
```

## 4. Buku Tamu (GuestBook)

| Method | Endpoint | Auth | Body |
|---|---|---|---|
| GET | `/api/events/[id]/guestbooks?q=...` | Member | - | List + search nama |
| POST | `/api/events/[id]/guestbooks` | ADMIN/OWNER | `{ nama, alamat }` atau `{ bulk: [{nama, alamat}] }` |
| POST | `/api/events/[id]/guestbooks/import` | ADMIN/OWNER | `FormData file Excel` |
| PATCH | `/api/guestbooks/[id]` | ADMIN/OWNER | `{ nama?, alamat? }` |
| DELETE | `/api/guestbooks/[id]` | ADMIN/OWNER | - |

## 5. Pemberian (Guest)

| Method | Endpoint | Auth | Body |
|---|---|---|---|
| GET | `/api/events/[id]/guests?q=&sort=&order=&metode=&page=&limit=` | Member | - |
| POST | `/api/events/[id]/guests` | ADMIN/OWNER | `{ nama, alamat, nominal, metode?, catatan?, guestBookId? }` — duplicate `nama+alamat` (insensitive) → `409 DUPLICATE_NEED_NOTE` jika `catatan` kosong, wajib isi catatan |
| PATCH | `/api/guests/[id]` | ADMIN/OWNER | `{ nama?, alamat?, nominal?, metode?, catatan? }` |
| DELETE | `/api/guests/[id]` | ADMIN/OWNER | - |
| GET | `/api/events/[id]/guests/suggest?q=...` | Member | - | Autocomplete nama **hanya buku tamu BELUM tercatat** (filter tidak tampil yang sudah tercatat) |
| GET | `/api/events/[id]/guests/check?nama=&alamat=` | Member | - | Live check duplicate `nama+alamat` → `{exists, existing}` |
| GET | `/api/events/[id]/guests/shortcuts` | Member | - | Top 4 alamat & nominal |

**Query param GET guests:**
- `q` = search nama/alamat (ILIKE)
- `sort` = `nama | alamat | nominal | createdAt`
- `order` = `asc | desc`
- `metode` = filter `AMPLOP,QRIS` (comma separated)
- `page, limit` = pagination (default 1, 50)

**Contoh POST guest:**
```json
// Request
{ "nama": "Sutrisno", "alamat": "Krajan", "nominal": 100000, "metode": "AMPLOP", "catatan": "titip salam" }

// Response 201
{ "id": "g123", "nama": "Sutrisno", "alamat": "Krajan", "nominal": 100000, "metode": "AMPLOP", "petugasId": "u1", "createdAt": "..." }
// + AuditLog CREATE_GUEST tercatat

// Jika duplicate tanpa catatan:
// Request { "nama":"Sutrisno","alamat":"Krajan","nominal":50000 }
// Response 409
{ "error":"DUPLICATE_NEED_NOTE", "message":"Nama dan alamat sudah tercatat. Tambahkan catatan/penanda...", "existing": { "id":"g123","nama":"Sutrisno","alamat":"Krajan","nominal":100000,"nominalFormatted":"Rp 100.000" } }
```

**Contoh GET check duplicate:**
```json
GET /api/events/evt123/guests/check?nama=Sutrisno&alamat=Krajan
→ { "exists": true, "existing": { "id":"g123","nama":"Sutrisno","alamat":"Krajan","nominal":100000,"nominalFormatted":"Rp 100.000","metode":"AMPLOP" } }
```

**Contoh GET shortcuts:**
```json
GET /api/events/evt123/guests/shortcuts
→ { "alamatTop": [{ "alamat": "Krajan", "jumlah": 45 }, ...], "nominalTop": [{ "nominal": 50000, "jumlah": 30 }, ...] }
```

## 6. Rekap

| Method | Endpoint | Auth |
|---|---|---|
| GET | `/api/events/[id]/rekap` | Member |

**Response:**
```json
{
  "totalTamu": 120,
  "totalNominal": 12500000,
  "perAlamat": [{ "alamat": "Krajan", "jumlah": 45, "total": 4500000 }, ...],
  "perMetode": [{ "metode": "AMPLOP", "jumlah": 100, "total": 10000000 }, { "metode": "QRIS", "jumlah": 20, "total": 2500000 }]
}
```

## 7. Export

> Catatan: Saat ini export **client-side** di `EventClient.tsx` — selalu **semua data di DB (abaikan filter tabel)** + **footer TOTAL selalu ada** (Rp + jumlah). Server export (`/api/.../export`) direncanakan tetap sama.

| Method | Endpoint | Auth | Body |
|---|---|---|---|
| POST | `/api/events/[id]/export/excel` | Member | `{ orderBy: "nama_az\|nama_za\|alamat_az\|nominal_desc\|waktu_desc", groupByAlamat: boolean }` |
| POST | `/api/events/[id]/export/pdf` | Member | sama |

Response: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` atau `application/pdf` dengan `Content-Disposition: attachment`.
Footer export selalu: `TOTAL: Rp 26.600.000 — 300 tamu` (contoh).

## 8. Audit Log

| Method | Endpoint | Auth |
|---|---|---|
| GET | `/api/events/[id]/audit-logs?page=&userId=&aksi=` | Member (OWNER/ADMIN lihat semua, VIEWER tetap bisa lihat) |

## 9. Validasi & Error Format

Semua body divalidasi Zod. Error:
```json
{ "error": "VALIDATION_ERROR", "details": [{ "field": "nominal", "message": "Nominal harus > 0" }] }
```

Auth error:
```json
{ "error": "UNAUTHORIZED", "message": "Harus login" }
{ "error": "FORBIDDEN", "message": "Bukan anggota acara ini" }
```

## 10. Contoh Alur Lengkap (cURL)

```bash
# Daftar
curl -X POST http://localhost:3000/api/register -H "Content-Type: application/json" -d '{"name":"Widi","email":"widi@test.com","password":"123456"}'

# Login (via Auth.js, dapatkan cookie session)
# Buat acara
curl -X POST http://localhost:3000/api/events -H "Cookie: next-auth.session-token=..." -H "Content-Type: application/json" -d '{"namaAcara":"Tes Hajatan","tanggal":"2026-09-20T00:00:00Z"}'

# Add member
curl -X POST http://localhost:3000/api/events/evt123/members -H "Cookie: ..." -d '{"email":"budi@gmail.com","role":"VIEWER"}'

# Input buku tamu
curl -X POST http://localhost:3000/api/events/evt123/guestbooks -H "Cookie: ..." -d '{"nama":"Sutrisno","alamat":"Krajan"}'

# Input pemberian
curl -X POST http://localhost:3000/api/events/evt123/guests -H "Cookie: ..." -d '{"nama":"Sutrisno","alamat":"Krajan","nominal":100000,"metode":"AMPLOP"}'
```
