# Rilis Desktop — Setup.exe & Linux

File rilis desktop dibangun otomatis oleh workflow **`Release Assets`**
(`.github/workflows/release-assets.yml`) setiap tag `v*` dibuat.
Semua file dilampirkan ke **1 GitHub Release yang sama** oleh job `publish`.

## File yang dihasilkan per versi

| File | Dari | Cara install |
|---|---|---|
| `Hajat-Manager-<ver>-windows-x64-Setup.exe` | WPF C# self-contained + Inno Setup | Double-klik → Next → Finish. Tanpa admin (install ke Local Programs). Data `%AppData%\HajatManager` tidak dihapus saat uninstall. |
| `Hajat-Manager-<ver>-windows-x64.zip` | WPF framework-dependent | Ekstrak → jalankan `HajatManager.exe`. Butuh .NET 10 Desktop Runtime. |
| `Hajat-Manager-<ver>-linux-x64.tar.gz` | Flutter (`flutter build linux`) | Ekstrak → `./hajat_manager`, atau pasang via AUR (di bawah). |
| `Hajat-Manager-<ver>-linux-x64.AppImage` | AppImage dari bundle Flutter | `chmod +x *.AppImage` → double-klik. |
| `SHA256SUMS.txt` | CI | `sha256sum -c SHA256SUMS.txt` untuk verifikasi. |

Versi diambil dari `package.json` → disync otomatis ke
`HajatManager.csproj`, `hajat-manager.iss`, `PKGBUILD`, `pubspec.yaml`
via `node scripts/sync-versions.js <ver>` (dipanggil semantic-release).

## Windows: catatan SmartScreen

Setup.exe **tidak ditandatangani** (tanpa sertifikat code-sign) sehingga
Windows SmartScreen bisa menampilkan peringatan biru pada install pertama.
Klik *More info → Run anyway*. Ini normal untuk installer unsigned.

## Linux (Arch/CachyOS)

Dependensi runtime (biasanya sudah ada di CachyOS):

```bash
sudo pacman -S gtk3 libsecret
```

### Opsi A — AUR (`hajat-manager-bin`)

`packaging/linux/PKGBUILD` mengambil tarball rilis resmi:

```bash
yay -S hajat-manager-bin
# atau: paru -S hajat-manager-bin / makepkg -si di folder PKGBUILD
```

`pkgver` di PKGBUILD disync otomatis tiap rilis. Maintainer AUR cukup
`updpkgsums` bila checksum diperketat (saat ini `SKIP` + verifikasi manual
via `SHA256SUMS.txt`).

### Opsi B — AppImage (tanpa install)

```bash
chmod +x Hajat-Manager-*.AppImage
./Hajat-Manager-*.AppImage
```

### Opsi C — tarball manual

```bash
tar -xzf Hajat-Manager-*-linux-x64.tar.gz
./bundle/hajat_manager
```

## Tes Login Google di Linux (CachyOS)

Alur normal (Fase 4):

1. Klik **Lanjutkan dengan Google** di layar login → browser sistem terbuka
   ke halaman `/device/google` → pilih akun Google → browser kembali otomatis
   ke aplikasi ("Login berhasil, kembali ke aplikasi") → app masuk alur PIN.
2. **Catatan:** bila browser sudah punya sesi Google, halaman langsung lanjut
   tanpa ketik password — itu normal, bukan bug.
3. Bila browser tidak terbuka otomatis → app menampilkan dialog
   **Buka Tautan Manual** (tautan + tombol salin). Tempel di browser mana pun,
   selesaikan login, lalu ulangi dari aplikasi.
4. Bila browser terbuka tapi tidak kembali otomatis → di halaman finish klik
   **Salin kode** → di aplikasi klik **Punya kode Google manual? Tempel di sini**.

Cek awal bila macet:

```bash
xdg-open https://hajat.widihhh.my.id
```

Bila perintah di atas tidak membuka browser, perbaiki default browser dulu
(Settings → Default Applications). Browser Snap/Flatpak tetap bisa dipakai
karena redirect ke `127.0.0.1` terjadi di mesin yang sama.

Lapor hasil tes dengan info ini (agar fix tepat sasaran):

- (a) apakah browser terbuka otomatis?
- (b) apakah browser kembali otomatis ke aplikasi?
- (c) pesan error persis di app / browser.
- (d) baris log `[GoogleDesktop]` dari console (`flutter run`) atau
  `%AppData%/HajatManager/logs` (WPF): port loopback, `browser opened=`,
  `callback` (diterima vs TIMEOUT), hasil tukar kode.

## Build lokal (tanpa CI)

```bash
# Setup.exe (di Windows + Inno Setup 6 terinstall):
dotnet publish windows/src/HajatManager -c Release -r win-x64 \
  --self-contained true -p:PublishSingleFile=true -o windows/src/HajatManager/publish-setup
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" windows/installer/hajat-manager.iss

# Linux tarball + AppImage (di Arch/CachyOS + Flutter):
flutter build linux --release
bash packaging/linux/build-appimage.sh \
  mobile/build/linux/x64/release/bundle \
  packaging/linux/hajat-manager.desktop \
  mobile/assets/app_icon.png \
  Hajat-Manager-local.AppImage
```
