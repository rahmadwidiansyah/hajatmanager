# Panduan Pengguna — Hajat Manager

> Panduan bahasa awam untuk **panitia** dan **tuan rumah (owner)**. Tidak perlu paham teknis.

## 1. Daftar & Login

### Daftar Baru
1. Buka alamat web (ex: `https://kondangan.homelab-mu.com`)
2. Klik **Daftar**
3. Pilih:
   - **Login dengan Google** (paling mudah, klik → pilih akun Gmail → selesai)
   - Atau isi **Nama, Email, Password** → klik Daftar
4. Setelah daftar, otomatis login.

### Login
- Klik **Login** → pilih Google atau isi email/password → masuk ke Dashboard.

## 2. Buat Acara (Hajatan)

Hanya untuk yang mau jadi panitia/penyelenggara.

1. Di Dashboard klik **Buat Acara Baru**
2. Isi:
   - **Nama Acara** (wajib): ex: `Pernikahan Budi & Ani`
   - **Tanggal** (wajib): ex: `20 September 2026`
   - **Lokasi** (opsional): ex: `Balai Desa Krajan`
   - **Catatan** (opsional): ex: `Target 300 tamu`
3. Klik **Simpan** → kamu otomatis jadi **OWNER** acara itu.

## 3. Tambah Panitia / Tuan Rumah (Unlimited)

1. Buka acara → tab **Setting → Kelola Anggota**
2. Di kotak **Cari User**, ketik nama atau email (ex: `budi` atau `budi@gmail.com`) → muncul daftar.
3. Pilih user → pilih **Peran**:
   - **ADMIN** → bisa input/edit pemberian (untuk panitia)
   - **OWNER** → bisa input + kelola anggota (untuk yang punya hajat)
   - **VIEWER** → cuma bisa lihat & export (untuk tuan rumah yang cuma mau lihat)
4. Klik **Tambah** → user itu langsung bisa login dan lihat acara di dashboardnya.
5. Bisa tambah **tak terbatas** (10 panitia pun bisa).
6. Jika user belum daftar, minta dia daftar dulu, baru cari lagi.

> Tip: Tuan rumah yang pakai Google tinggal suruh login Google dulu sekali, baru kamu search emailnya.

## 4. Isi Buku Tamu (Daftar Undangan/Hadir)

**Kenapa dulu?** Biar nanti input pemberian tinggal pilih nama, tidak ketik ulang alamat.

1. Buka acara → tab **Buku Tamu**
2. **Cara 1 - Input satu per satu:** isi `Nama` + `Alamat` → Simpan. Ulangi.
3. **Cara 2 - Import Excel:** klik **Import Excel** → pilih file `.xlsx` dengan kolom `Nama` dan `Alamat` di baris pertama → Upload → cek hasilnya.
4. Bisa **edit/hapus** jika salah ketik.

## 5. Input Pemberian (Paling Sering Dipakai Panitia di HP)

1. Buka acara → tab **Pemberian** (di HP enak, form di atas, tabel di bawah)
2. **Ketik Nama** (cukup 2-3 huruf, ex: `Su`) → muncul **suggest** (ex: `Sutrisno - Krajan`, `Susi - Krakan`) → **tap** nama yang cocok → **Alamat terisi otomatis**.
   - Jika tidak muncul, ketik manual Nama & Alamat.
3. **Pilih Alamat cepat:** di atas form ada **4 chip alamat paling sering** di acara ini (ex: `Krajan`, `Krakan`). Tap chip → alamat terisi.
4. **Isi Nominal:** tap **chip nominal** (ex: `50.000`, `100.000`) atau ketik manual. Tampil format `Rp 100.000`.
5. **Metode:** default `AMPLOP` (uang cash dalam amplop). Jika ada yang QRIS/Transfer, ubah di dropdown.
6. **Catatan:** opsional (ex: `titip salam`, `keluarga jauh`).
7. Klik **Simpan** (atau Enter di keyboard) → muncul "Tersimpan" → form kosong lagi, fokus balik ke Nama → langsung input tamu berikutnya. **Satset!**
8. Tabel bawah otomatis nambah baris, **Total Tamu & Total Rp di header naik**.

**Edit/Hapus:** di tabel tap **Edit** → ubah → Simpan. Semua edit tercatat di Log.

**Search & Sort:** ketik di kotak Cari (nama/alamat), klik header tabel untuk urut Nama A-Z atau Nominal besar-kecil.

## 6. Lihat Rekap

Buka tab **Rekap**:
- **Total Tamu:** ex: `120 orang`
- **Total Nominal:** ex: `Rp 12.500.000`
- **Per Alamat:** tabel `Alamat | Jumlah Tamu | Total Rp` (urut terbesar)
- **Per Metode:** `AMPLOP: 100 orang (Rp 10jt)`, `QRIS: 20 orang (Rp 2,5jt)`

## 7. Export & Cetak (Untuk Tuan Rumah)

1. Di tab **Rekap** atau **Pemberian**, klik **Export Excel** atau **Export PDF**
2. Muncul modal **Setting Export**:
   - **Urutkan:** `Nama A-Z`, `Nama Z-A`, `Alamat A-Z`, `Nominal terbesar`, `Waktu input`
   - **Centang** `Group by alamat (subtotal per desa)` jika mau rekap per desa di file
3. Klik **Download** → file terdownload.
4. **Excel** bisa dibuka di HP/Laptop, **PDF** siap print A4 untuk diberikan ke tuan rumah.

> Tuan rumah dengan peran VIEWER tetap bisa export sendiri tanpa minta panitia.

## 8. Log Aktivitas (Transparansi)

Buka **Setting → Log Aktivitas**:
- Lihat `Jam | Panitia | Aksi | Target`
- Ex: `09:12 Widi - INPUT Sutrisno Rp 100.000 (AMPLOP)` atau `09:15 Budi - EDIT Sutrisno Rp 50.000 → Rp 100.000`
- Bisa filter by panitia atau tanggal.

## 9. Tips Cepat di HP

- **Add to Home Screen:** buka di Chrome HP → titik tiga → `Tambahkan ke Layar Utama` → jadi seperti aplikasi.
- **Input cepat:** setelah Simpan, tidak perlu scroll, langsung ketik nama berikutnya.
- **Alamat chip:** jika desa tamu belum ada di chip, ketik manual sekali, nanti akan masuk Top 4 jika sering muncul.
- **Salah nominal:** langsung Edit di tabel, tidak perlu hapus.

## 10. FAQ

**Q: Alamat harus detail RT/RW?**  
A: Tidak. Cukup `Krajan`, `Krakan`, `Sumber` saja biar cepat. Detail bisa tulis di Catatan jika perlu.

**Q: Nominal harus pakai titik/koma?**  
A: Ketik angka saja `50000`, sistem otomatis jadi `Rp 50.000`. Chip juga tinggal tap.

**Q: Bisa input barang bukan uang?**  
A: Bisa, pilih metode `BARANG` dan tulis di catatan (ex: `kado magic com`).

**Q: Tuan rumah tidak bisa input?**  
A: Minta panitia (OWNER) ubah peranmu dari VIEWER jadi OWNER/ADMIN di Setting Anggota.

**Q: Data hilang jika HP mati?**  
A: Tidak, data simpan di server homelab. Selama sudah klik Simpan dan ada internet, data aman. (Fase 7 nanti bisa offline dulu baru Push).

**Q: Lupa password?**  
A: Jika daftar pakai Google, login Google saja. Jika email/password, hubungi admin untuk reset.

---

> Butuh bantuan teknis? Hubungi admin homelab atau baca `docs/setup.md`.
