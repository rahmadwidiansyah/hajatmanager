# Rilis GitHub — Hajat Manager

Alur resmi (otomatis penuh):

1. Tulis commit **Conventional Commits** (`feat:`, `fix:`, …) → push ke `main`.
2. `Release (semantic-release)` jalan: tentukan versi → sync versi ke
   `package.json`, `mobile/pubspec.yaml`
   (`x.y.z+N`, N = nomor run CI) → update `CHANGELOG.md` → commit
   `chore(release)` (**tanpa `[skip ci]`** agar build tag tidak ke-skip)
   → buat tag `v*` + GitHub Release berisi catatan rilis.
3. Tag `v*` memicu **`Release Assets`**: build paralel
   - `build-windows-csharp` (windows): `Hajat-Manager-<ver>-windows-x64.zip`
     (WPF .NET 9, dari `windows/`)
   - `build-flutter-apk` (ubuntu): `Hajat-Manager-<ver>-unsigned.apk`
     (+ `Hajat-Manager-<ver>.apk` bila secrets keystore ada) — dari `mobile/`
     (Flutter, appId `com.hajatmanager.hajat_manager`)
4. Job `publish` melampirkan **semua file ke 1 release yang sama** (sekali,
   anti-balapan). Cek di halaman Releases.

## Secrets (repo Settings → Secrets → Actions)

| Secret | Wajib? | Guna |
|---|---|---|
| `RELEASE_PAT` | **Ya, agar rilis beraset** | Personal Access Token agar push tag memicu build aset. Tanpa ini, tag dari `GITHUB_TOKEN` **tidak memicu workflow lain** (aturan GitHub) → rilis jadi tanpa EXE/ZIP/APK. Buat di GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate → centang **`repo`** → copy → tempel sebagai secret `RELEASE_PAT`. (Alternatif fine-grained: akses repo ini saja + `Contents: read and write`.) |
| `ANDROID_KEYSTORE_BASE64` | Tidak | Keystore rilis → APK signed. Kosong = hanya unsigned (tetap installable, fallback debug). |
| `ANDROID_KEYSTORE_PASSWORD` | Bila signed | Password keystore |
| `ANDROID_KEY_ALIAS` | Bila signed | Alias key |
| `ANDROID_KEY_PASSWORD` | Bila signed | Password key |

`GITHUB_TOKEN` otomatis tersedia (butuh `contents: write` — sudah diatur di
job `publish` + `release`).

## Uji manual tanpa memotong rilis

- Actions → `Release Assets` → Run workflow → isi `version` (mis. `1.0.3-test`)
  → artifact dicek, lalu job `publish` membuat release testing dari tag
  tersebut. Hapus release testing bila sudah puas.
- Atau jalankan workflow `Release Assets` manual (Run workflow → isi `version`).

## Troubleshooting

| Gejala | Penyebab umum |
|---|---|
| Tag dibuat tapi `Release Assets` tidak jalan | Cek tab Actions aktif; `[skip ci]` tidak boleh ada di pesan commit rilis (sudah dihapus dari `.releaserc.json`). |
| `flutter build windows` gagal CMake | `windows-latest` wajib (butuh VS 2022 C++ workload, preinstalled). Jangan pindah ke ubuntu. |
| `sqflite` crash di Windows | Sudah ditangani (`sqflite_common_ffi` + `initLocalDb()` di `main`). |
| Login Google di Windows | Disembunyikan sengaja (plugin hanya Android/iOS) → pakai email. |
| Rilis ganda/notes tertimpa | Pastikan tidak ada workflow lain yang attach ke tag `v*` selain `publish`. |
| APK "tidak valid" saat install | Pakai file `-unsigned.apk` (fallback debug) atau isi secrets keystore untuk signed. |
