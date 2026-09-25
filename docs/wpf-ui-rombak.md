# Rombak UI WPF Desktop — Cermin Web

**Dibuat:** 2026-09-24  
**Status:** Done (Task 1–10) + Revisi compact density  
**Platform pertama:** Windows (WPF .NET 9 + C#)  
**Menyusul:** Linux (Flutter desktop — lihat bagian terpisah di akhir)

> **Revisi compact density (2026-09-24):** nilai token di dokumen ini (Task 1:
> `M3CardPadding=16`, `RowHeight=36`, `TabItem=16,8`, rail 168px, dsb) telah
> disupersede oleh refinement — `M3CardPadding=12`, `RowHeight=32`,
> `TabItem=12,6`, rail 160px, dan ~40 penurunan spacing lain di `M3Styles.xaml`,
> file C# (`M3Segmented`, `M3Feedback`, `BuildInputPanel`, `AccountSubs`,
> `M3Field`), dan XAML per-halaman. Visual language/warna/radius tetap identik
> web; hanya density yang dirapatkan untuk desktop. Field Catatan kini
> textarea 2-baris (`AcceptsReturn`, `MinHeight=56`).

---

## Latar Belakang

Aplikasi web (`/dashboard`, `/events/[id]`, `/account`) sudah punya desain UI/UX yang
matang dan telah dipakai di lapangan. Aplikasi desktop Windows (WPF) saat ini sudah
punya infrastruktur yang benar (sync engine, offline queue, PIN lock, M3Chrome title
bar, Light/Dark theme) namun tampilannya belum mencerminkan web — spacing terlalu
longgar, kartu tidak punya semua informasi, tab Setting masih window terpisah, dan
shortcut keyboard tidak lengkap.

**Tujuan rombak ini:**
1. Menyinkronkan tampilan dan UX WPF dengan web sebagai referensi
2. Mempertahankan semua fitur eksklusif desktop (sync, PIN, offline, title bar kustom)
3. Layout responsif — 1/2/3 kolom otomatis sesuai lebar window
4. Shortcut keyboard lengkap ala web (`Ctrl+1–4`, `Ctrl+S`, `Ctrl+F`, `Escape`, dll)
5. Ukuran gap/border/text compact — tidak boros layar

---

## Keputusan Arsitektur

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Platform pertama | WPF Windows | Lebih dulu, Linux menyusul |
| Navigation layout | Sidebar Rail kiri 168px + Host kanan | Sesuai web (bukan bottom tab) |
| Buka detail acara | Hybrid: embed di Host saat ≥900px, ShowDialog saat <900px | Layar lebar lebih efisien, layar kecil tetap fokus |
| Tab Setting | Gabung jadi tab ke-4 di EventDetail | Cermin web (satu halaman 4 tab) |
| Sub-halaman Akun | Inline expand di bawah tile (SubHost) | Cermin web, tidak perlu window baru |
| Token desain | `M3Styles.xaml` + `Light/Dark.xaml` | Sudah ada, tinggal diperbarui konsisten |

---

## Referensi Web → WPF

```
Web                          WPF
──────────────────────────── ─────────────────────────────────────
/dashboard (EventsView)      EventsView.xaml + EventsView.xaml.cs
/events/[id] (EventClient)   EventDetailWindow.xaml + .cs
  tab=pemberian              TabItem "Input"
  tab=buku                   TabItem "Buku Tamu"
  tab=rekap                  TabItem "Rekap"
  tab=setting (baru)         TabItem "Setting" (pindah dari SettingsWindow)
/account (AccountClient)     AccountView.xaml + AccountView.xaml.cs
TopBar.tsx                   TopBar control di dalam EventDetail
DashboardHeader.tsx          AppBar di MainWindow
globals.css (:root vars)     Light.xaml + Dark.xaml brush tokens
```

---

## File yang Diubah

```
windows/src/HajatManager/
├── Themes/
│   └── M3Styles.xaml          ← Task 1 (token density)
├── Views/
│   ├── MainWindow.xaml        ← Task 2 (AppBar + Rail)
│   ├── MainWindow.xaml.cs     ← Task 2 (AppBar wiring, shortcut Alt+1/2)
│   ├── EventsView.xaml        ← Task 3 (kartu grid, DataTemplate baru)
│   ├── EventsView.xaml.cs     ← Task 3 (kolom fluida, hybrid open)
│   ├── EventDetailWindow.xaml ← Task 4 (tambah tab Setting, TopBar baru)
│   ├── EventDetailWindow.xaml.cs ← Task 4–7 (tab 4, embed logic, shortcuts)
│   ├── EventDetailView.xaml   ← Task 4 (UserControl baru — embed di Host)
│   ├── EventDetailView.xaml.cs← Task 4 (delegate ke EventDetailWindow logic)
│   ├── AccountView.xaml       ← Task 8 (tile grid, profil, sub-halaman)
│   ├── AccountView.xaml.cs    ← Task 8 (wiring sub-halaman, upload foto)
│   └── SettingsWindow.xaml    ← Task 7 (konten dipindah ke tab, file tetap ada)
```

---

## Task 1 — Token Desain M3Styles.xaml

**Tujuan:** Semua padding/gap/radius compact dan konsisten dengan web.

### Token yang Diperbarui

| Key | Lama | Baru | Referensi Web |
|---|---|---|---|
| `M3CardPadding` | `12` | `16` | `p-4` / `p-5` (16–20px) |
| `M3BtnPadding` | `12,6` | `14,7` | `px-4 py-1.5` (14×6px) |
| `M3InputPadding` | `10,6` | `12,7` | `px-3 py-1.5` (12×6px) |
| `M3ChipPadding` | `8,2` | `10,4` | `px-3 py-1` (10×4px) |
| `M3ChipSmallPadding` | — | `6,2` | chip alamat `h-8 px-3` |
| `M3SectionGap` | — | `0,12,0,0` | `mb-3` / `gap-3` (12px) |
| `M3ItemGap` | — | `0,0,0,8` | `gap-2` (8px) |
| `M3CardGap` | — | `0,0,0,12` | `gap-3` / `mb-3` (12px) |

### Style Baru yang Ditambahkan

```xml
<!-- M3RoleChip — badge OWNER/ADMIN/VIEWER dengan warna per-role -->
<Style x:Key="M3RoleChipOwner" TargetType="Border">
  Background=PrimaryContainerBrush, Foreground=OnPrimaryContainerBrush
  CornerRadius=6, Padding=10,3, BorderBrush=OutlineBrush, BorderThickness=1
</Style>
<Style x:Key="M3RoleChipAdmin" TargetType="Border">
  Background=WarningContainerBrush, Foreground=OnWarningContainerBrush
</Style>
<Style x:Key="M3RoleChipViewer" TargetType="Border">
  Background=SurfaceContainerHighBrush, Foreground=OnVariantBrush
</Style>

<!-- M3StatusBanner — banner info/warning/error (offline, sync pending, dll) -->
<Style x:Key="M3BannerError" TargetType="Border">
  Background=ErrorContainerBrush, CornerRadius=10, Padding=10,8, Margin=0,0,0,8
</Style>
<Style x:Key="M3BannerWarning" TargetType="Border">
  Background=WarningContainerBrush, CornerRadius=10, Padding=10,8
</Style>
<Style x:Key="M3BannerInfo" TargetType="Border">
  Background=InfoContainerBrush, CornerRadius=10, Padding=10,8
</Style>

<!-- M3NavRailItem — item ListBoxItem di sidebar rail kiri -->
<Style x:Key="M3NavRailItem" TargetType="ListBoxItem">
  Padding=12,10, CornerRadius=8
  Hover: SurfaceContainerHighBrush
  Selected: PrimaryContainerBrush + OnPrimaryContainerBrush
</Style>

<!-- M3SyncButton — tombol awan sync (cermin TopBar syncBtn web) -->
<Style x:Key="M3SyncButton" TargetType="Button">
  Width=32, Height=32, CornerRadius=full (16)
  State: online=PrimaryBrush, pending=WarningBrush, offline=ErrorBrush
</Style>

<!-- M3Caption styles sudah ada di M3Chrome — tambah M3CaptionButton + M3CaptionCloseButton
     jika belum ada -->

<!-- DataGrid: RowHeight 32→36, header padding 8,5→10,7 -->
<!-- TabItem: Padding 12,6→16,8 agar tab tidak rapat -->
```

### Aturan Radius

```
Kartu (M3Card)      : CornerRadius="8"   (sudah ada, pertahankan)
Input/TextBox       : CornerRadius="6"   (sudah ada, pertahankan)  
Tombol/Chip (RFull) : CornerRadius="6"   (sudah ada, pertahankan)
Banner              : CornerRadius="10"  (baru)
Modal/Dialog        : CornerRadius="12"  (baru)
Rail item aktif     : CornerRadius="8"   (baru)
```

### Checklist Task 1

- [x] Perbarui 4 token `Thickness` yang ada
- [x] Tambah 4 token `Thickness` baru (`M3SectionGap`, `M3ItemGap`, `M3CardGap`, `M3ChipSmallPadding`)
- [x] Tambah 3 style `M3RoleChip*` (Owner/Admin/Viewer)
- [x] Tambah 3 style `M3Banner*` (Error/Warning/Info)
- [x] Tambah style `M3NavRailItem`
- [x] Tambah style `M3SyncButton`
- [x] Perbarui `DataGrid` `RowHeight` → 36
- [x] Perbarui `TabItem` `Padding` → `16,8`
- [x] Pastikan semua brush pakai `DynamicResource` (tidak ada `StaticResource` warna)

---

## Task 2 — MainWindow: AppBar + Rail Kiri

**Tujuan:** AppBar atas cermin `DashboardHeader.tsx`, rail kiri cermin `NavigationRail` Flutter.

### AppBar Baru (cermin DashboardHeader.tsx)

Struktur AppBar (di dalam `M3Chrome.cs` title bar ATAU di bawahnya sebagai `Border`
di `DockPanel.Dock=Top` — pilih yang tidak konflik dengan M3Chrome):

```
┌─────────────────────────────────────────────────────────────┐
│  [BrandMark]  Hajat Manager        [SyncBtn]  [Avatar▾]     │
│               ████████████████████ [ikut M3Chrome titlebar] │
└─────────────────────────────────────────────────────────────┘
```

Komponen:
- **BrandMark**: TextBlock "Hajat Manager" FontWeight=Bold, FontSize=16
- **StatusChip**: chip kecil "Online ✓" / "Offline ✗" / "Sync…" — warna ikut state
- **SyncBtn**: tombol awan (`M3SyncButton`) — hijau=sync, kuning=pending, merah=offline
  - Click → `OnSyncAll()`
  - ToolTip dinamis sesuai state
  - Badge angka pending jika > 0
- **AvatarBtn**: `Border` lingkaran 32px inisial dari nama/email + `▾`
  - Popup dropdown saat klik: nama user, email, separator, "Akun", "Tema ☀/🌙", "Keluar"
  - Cermin `DashboardHeader.tsx` dropdown

Implementasi di `MainWindow.xaml`:
```xml
<!-- Ganti elemen AppBar yang ada: -->
<Border DockPanel.Dock="Top" Padding="12,8" Background="{DynamicResource SurfaceBrush}"
        BorderBrush="{DynamicResource OutlineBrush}" BorderThickness="0,0,0,1">
  <Grid>
    <!-- Kiri: Brand + status chip -->
    <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
      <TextBlock Text="Hajat Manager" FontSize="16" FontWeight="Bold" VerticalAlignment="Center"/>
      <Border x:Name="StatusChip" Margin="10,0,0,0" Padding="8,3" CornerRadius="6"
              Background="{DynamicResource SurfaceContainerBrush}" VerticalAlignment="Center">
        <TextBlock x:Name="StatusText" FontSize="11"/>
      </Border>
    </StackPanel>
    <!-- Kanan: SyncBtn + AvatarBtn -->
    <StackPanel Grid.Column="1" Orientation="Horizontal" VerticalAlignment="Center"
                HorizontalAlignment="Right">
      <Button x:Name="SyncBtn" Style="{DynamicResource M3SyncButton}" Click="OnSyncAll"
              Margin="0,0,8,0"/>
      <Button x:Name="AvatarBtn" Click="OnAvatarMenu" Style="{DynamicResource TonalButton}"
              Padding="4,4,10,4" CornerRadius="10">
        <!-- Border lingkaran inisial + ChevronDown -->
        <StackPanel Orientation="Horizontal">
          <Border x:Name="AvatarCircle" Width="28" Height="28" CornerRadius="14"
                  Background="{DynamicResource PrimaryContainerBrush}">
            <TextBlock x:Name="AvatarInitial" FontWeight="Bold" FontSize="12"
                       Foreground="{DynamicResource OnPrimaryContainerBrush}"
                       HorizontalAlignment="Center" VerticalAlignment="Center"/>
          </Border>
          <TextBlock x:Name="UserNameText" Margin="6,0,4,0" VerticalAlignment="Center"
                     FontSize="13" MaxWidth="110" TextTrimming="CharacterEllipsis"/>
          <TextBlock Text="&#xE70D;" FontFamily="Segoe MDL2 Assets" FontSize="10"
                     Foreground="{DynamicResource OnVariantBrush}" VerticalAlignment="Center"/>
        </StackPanel>
      </Button>
      <!-- Popup dropdown avatar -->
      <Popup x:Name="AvatarPopup" Placement="Bottom" StaysOpen="False">
        <Border Style="{DynamicResource M3Card}" Padding="4" MinWidth="200">
          <StackPanel>
            <StackPanel Margin="8,8,8,4">
              <TextBlock x:Name="PopupNameText" FontWeight="SemiBold" TextTrimming="CharacterEllipsis"/>
              <TextBlock x:Name="PopupEmailText" FontSize="11" Foreground="{DynamicResource OnVariantBrush}"
                         TextTrimming="CharacterEllipsis"/>
            </StackPanel>
            <Separator Margin="0,4,0,4" Background="{DynamicResource OutlineBrush}"/>
            <Button Content="Akun" Click="GoAccount" Style="{DynamicResource TextButton}"
                    HorizontalContentAlignment="Left" Padding="8,6"/>
            <Button x:Name="ThemeToggleBtn" Content="Mode Gelap" Click="OnToggleTheme"
                    Style="{DynamicResource TextButton}" HorizontalContentAlignment="Left" Padding="8,6"/>
            <Separator Margin="0,4,0,4" Background="{DynamicResource OutlineBrush}"/>
            <Button Content="Keluar" Click="OnLogout" Style="{DynamicResource DangerButton}"
                    HorizontalContentAlignment="Left" Padding="8,6" Margin="0"/>
          </StackPanel>
        </Border>
      </Popup>
    </StackPanel>
  </Grid>
</Border>
```

### Rail Kiri Baru

```xml
<!-- Rail kiri: ListBox dengan M3NavRailItem -->
<Border Width="168" Background="{DynamicResource SurfaceBrush}"
        BorderBrush="{DynamicResource OutlineBrush}" BorderThickness="0,0,1,0" Padding="8,4">
  <ListBox x:Name="NavRail" SelectionChanged="OnNavSelect"
           BorderThickness="0" Background="Transparent">
    <ListBoxItem x:Name="AcaraItem" Tag="events" Style="{DynamicResource M3NavRailItem}">
      <StackPanel Orientation="Horizontal">
        <TextBlock Text="&#xE8B5;" FontFamily="Segoe MDL2 Assets" FontSize="16"
                   Margin="0,0,10,0" VerticalAlignment="Center"/>
        <TextBlock Text="Acara" VerticalAlignment="Center" FontSize="13"/>
      </StackPanel>
    </ListBoxItem>
    <ListBoxItem x:Name="AkunItem" Tag="account" Style="{DynamicResource M3NavRailItem}">
      <StackPanel Orientation="Horizontal">
        <TextBlock Text="&#xE77B;" FontFamily="Segoe MDL2 Assets" FontSize="16"
                   Margin="0,0,10,0" VerticalAlignment="Center"/>
        <TextBlock Text="Akun" VerticalAlignment="Center" FontSize="13"/>
      </StackPanel>
    </ListBoxItem>
  </ListBox>
</Border>
```

### Shortcut MainWindow

| Shortcut | Aksi |
|---|---|
| `Alt+1` | Navigasi ke Acara |
| `Alt+2` | Navigasi ke Akun |
| `Ctrl+N` | Buka dialog buat acara baru |

### Checklist Task 2

- [x] Ganti AppBar: brand + status chip + SyncBtn + AvatarBtn + dropdown
- [x] Wiring `AvatarBtn`: load inisial + nama dari `AppConfig.GetCachedUser()`
- [x] Wiring `ThemeToggleBtn`: toggle Light/Dark via `ThemeManager`
- [x] Update label ThemeToggleBtn sesuai mode aktif ("Mode Gelap" / "Mode Terang")
- [x] Update `SyncBtn` state: `OnSyncChanged()` + `RefreshStatusAsync()`
- [x] Perbarui rail kiri: style `M3NavRailItem`, ikon MDL2 di setiap item
- [x] Tambah shortcut `Alt+1`, `Alt+2`, `Ctrl+N` di `PreviewKeyDown`

---

## Task 3 — EventsView: Kartu Grid Fluida

**Tujuan:** Cermin `/dashboard` web — kartu grid 2-3 kolom fluida, semua info tampil.

### Layout Grid Fluida

Di `EventsView.xaml.cs`, hook `SizeChanged` di `UserControl.Loaded`:

```csharp
// Cermin WindowUi.columnsForWidth (Flutter) dan md:grid-cols-2 xl:grid-cols-3 (web)
private void UpdateColumns(double width)
{
    if (List == null) return;
    var cols = width < 700 ? 1 : width < 1050 ? 2 : 3;
    // UniformGrid: set Columns
    if (List.ItemsPanel?.VisualTree is UniformGrid ug)
        ug.Columns = cols;
}
```

XAML: ganti `WrapPanel` → `UniformGrid`:

```xml
<ItemsControl.ItemsPanel>
  <ItemsPanelTemplate>
    <UniformGrid x:Name="EventGrid" Columns="2"/>
  </ItemsPanelTemplate>
</ItemsControl.ItemsPanel>
```

### DataTemplate Kartu Baru

Cermin kartu web:
```
┌─────────────────────────────────────────┐
│  ┌──────┐  Nama Acara              OWNER│  ← CornerRadius=8
│  │ 14   │  Tuan rumah: Budi             │
│  │ Sep  │  📅 14 September 2026         │
│  └──────┘  📍 Lokasi                    │
│  ─────────────────────────────────────  │
│  Buka Acara →                           │
└─────────────────────────────────────────┘
```

```xml
<DataTemplate>
  <Border Margin="0,0,0,12" Style="{DynamicResource M3Card}"
          Cursor="Hand" Focusable="True"
          MouseLeftButtonUp="OnOpen" KeyDown="OnOpenKey"
          MouseEnter="OnCardHover" MouseLeave="OnCardLeave">
    <StackPanel>
      <!-- Baris atas: kotak tanggal + info + role chip -->
      <Grid Margin="0,0,0,10">
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="52"/>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <!-- Kotak tanggal -->
        <Border Width="48" Height="48" CornerRadius="8"
                Background="{DynamicResource SecondaryContainerBrush}"
                BorderBrush="{DynamicResource OutlineBrush}" BorderThickness="1"
                VerticalAlignment="Top">
          <StackPanel VerticalAlignment="Center" HorizontalAlignment="Center">
            <TextBlock Text="{Binding Tanggal, StringFormat=dd}" FontWeight="Bold"
                       FontSize="16" Foreground="{DynamicResource OnSecondaryContainerBrush}"
                       HorizontalAlignment="Center"/>
            <TextBlock Text="{Binding TanggalBulan}" FontSize="11"
                       Foreground="{DynamicResource OnSecondaryContainerBrush}"
                       HorizontalAlignment="Center"/>
          </StackPanel>
        </Border>
        <!-- Info tengah -->
        <StackPanel Grid.Column="1" Margin="12,0,8,0">
          <TextBlock Text="{Binding NamaAcara}" FontWeight="SemiBold" FontSize="14"
                     TextTrimming="CharacterEllipsis"/>
          <TextBlock FontSize="12" Foreground="{DynamicResource OnVariantBrush}"
                     Margin="0,2,0,0" TextTrimming="CharacterEllipsis"
                     Text="{Binding TuanRumahLabel}"/>
          <StackPanel Orientation="Horizontal" Margin="0,3,0,0">
            <TextBlock Text="&#xE787;" FontFamily="Segoe MDL2 Assets" FontSize="11"
                       Foreground="{DynamicResource OnVariantBrush}" Margin="0,0,3,0"
                       VerticalAlignment="Center"/>
            <TextBlock Text="{Binding TanggalPanjang}" FontSize="12"
                       Foreground="{DynamicResource OnVariantBrush}"
                       TextTrimming="CharacterEllipsis"/>
          </StackPanel>
          <TextBlock Text="{Binding LokasiLabel}" FontSize="12"
                     Foreground="{DynamicResource OnVariantBrush}"
                     Margin="0,2,0,0" TextTrimming="CharacterEllipsis"
                     Visibility="{Binding LokasiVisible}"/>
        </StackPanel>
        <!-- Role chip kanan atas -->
        <Border Grid.Column="2" x:Name="RoleChip" VerticalAlignment="Top"
                Style="{Binding RoleChipStyle}">
          <TextBlock Text="{Binding MyRole}" FontSize="11" FontWeight="SemiBold"/>
        </Border>
      </Grid>
      <!-- Separator -->
      <Border Height="1" Background="{DynamicResource OutlineBrush}" Margin="0,0,0,10"/>
      <!-- Baris bawah: "Buka Acara →" -->
      <StackPanel Orientation="Horizontal" HorizontalAlignment="Right">
        <TextBlock Text="Buka Acara" FontSize="13" FontWeight="SemiBold"
                   Foreground="{DynamicResource PrimaryBrush}"/>
        <TextBlock Text="&#xE76C;" FontFamily="Segoe MDL2 Assets" FontSize="13"
                   Foreground="{DynamicResource PrimaryBrush}" Margin="4,0,0,0"
                   VerticalAlignment="Center"/>
      </StackPanel>
    </StackPanel>
  </Border>
</DataTemplate>
```

ViewModel helper di `EventModel` (atau anonymous wrapper di `EventsView.xaml.cs`):
```csharp
// Properties tambahan untuk binding DataTemplate:
string TanggalBulan      // → "Sep"
string TanggalPanjang    // → "14 September 2026"
string TuanRumahLabel    // → "Tuan rumah: Budi" atau ""
string LokasiLabel       // → "📍 Lokasi" atau ""
Visibility LokasiVisible // → Collapsed jika kosong
string RoleChipStyle     // → "M3RoleChipOwner" / "M3RoleChipAdmin" / "M3RoleChipViewer"
```

### Hover State Kartu

```csharp
private void OnCardHover(object s, MouseEventArgs e)
{
    if (s is Border b)
        b.BorderBrush = BrushOf("PrimaryBrush");
}
private void OnCardLeave(object s, MouseEventArgs e)
{
    if (s is Border b)
        b.BorderBrush = BrushOf("OutlineBrush");
}
```

### Hybrid Open: Embed vs Dialog

```csharp
private void OnOpen(object sender, MouseButtonEventArgs e)
{
    if ((sender as FrameworkElement)?.DataContext is not EventModel ev) return;
    var mainWin = Application.Current.MainWindow as MainWindow;
    if (mainWin != null && mainWin.ActualWidth >= 900)
    {
        // Embed di Host — cermin web (konten kanan berubah)
        mainWin.ShowEventDetail(ev);
    }
    else
    {
        // Window terpisah — layar sempit atau window kecil
        new EventDetailWindow(ev).ShowDialog();
    }
}
```

`MainWindow.cs` tambah method:
```csharp
public void ShowEventDetail(EventModel ev)
{
    Host.Content = new EventDetailView(ev, this);
    // Tandai rail: tidak ada item khusus "Detail", tetap highlight Acara
    try { NavRail.SelectedItem = AcaraItem; } catch { }
}
```

### Search Bar Baru

```xml
<Grid DockPanel.Dock="Top" Margin="0,0,0,10">
  <Border Background="{DynamicResource CardBrush}"
          BorderBrush="{DynamicResource OutlineBrush}" BorderThickness="1"
          CornerRadius="8">
    <Grid>
      <Grid.ColumnDefinitions>
        <ColumnDefinition Width="36"/>
        <ColumnDefinition Width="*"/>
      </Grid.ColumnDefinitions>
      <TextBlock Text="&#xE71E;" FontFamily="Segoe MDL2 Assets" FontSize="14"
                 Foreground="{DynamicResource OnVariantBrush}"
                 HorizontalAlignment="Center" VerticalAlignment="Center"/>
      <TextBox x:Name="SearchBox" Grid.Column="1" BorderThickness="0"
               Background="Transparent" Padding="0,8" FontSize="13"
               TextChanged="OnSearch"/>
    </Grid>
  </Border>
  <!-- Placeholder (collapsed saat ada teks) -->
  <TextBlock IsHitTestVisible="False" VerticalAlignment="Center" Margin="42,0,0,0"
             Foreground="{DynamicResource OnVariantBrush}" FontSize="13"
             Text="Cari acara atau lokasi… (Ctrl+F)">
    <TextBlock.Style>
      <Style TargetType="TextBlock">
        <Setter Property="Visibility" Value="Collapsed"/>
        <Style.Triggers>
          <DataTrigger Binding="{Binding Text, ElementName=SearchBox}" Value="">
            <Setter Property="Visibility" Value="Visible"/>
          </DataTrigger>
        </Style.Triggers>
      </Style>
    </TextBlock.Style>
  </TextBlock>
</Grid>
```

### Checklist Task 3

- [x] Ganti `WrapPanel` → `UniformGrid` + `SizeChanged` update kolom (1/2/3)
- [x] Buat DataTemplate kartu baru (kotak tanggal, info, role chip, separator, "Buka Acara →")
- [x] Tambah ViewModel properties di wrapper class atau `EventModel`
- [x] Role chip warna per-role menggunakan style dari Task 1
- [x] Hover state kartu (border berubah ke primary saat mouse over)
- [x] Hybrid open: embed di Host saat ≥900px, `ShowDialog` saat <900px
- [x] Perbarui `MainWindow.cs` tambah `ShowEventDetail()`
- [x] Perbarui search bar (Border + ikon search + placeholder)
- [x] Shortcut `Ctrl+F` fokus search (sudah ada, pastikan masih berfungsi)
- [x] Shortcut `Ctrl+N` panggil `OnCreate`

---

## Task 4 — EventDetailWindow: Hybrid Embed + Tab Setting

**Tujuan:** Buat `EventDetailView.xaml` (UserControl) yang bisa embed di Host, tambah tab
Setting ke-4, dan pastikan shortcut Ctrl+1–4 berfungsi.

### EventDetailView.xaml (UserControl baru)

UserControl ini membungkus semua konten `EventDetailWindow` agar bisa di-embed di Host.
Pola: logic utama tetap di `EventDetailWindow.xaml.cs` → di-share via base class atau
partial class. Opsi paling sederhana: `EventDetailView` adalah UserControl yang
membuat instance logika yang sama.

```
EventDetailView.xaml        ← UserControl: layout identik EventDetailWindow tapi tanpa Window chrome
EventDetailView.xaml.cs     ← Konstruktor memanggil InitializeComponent + BuildContent() (method shared)
```

Alternatif lebih sederhana (pilih ini): `EventDetailView` langsung mewarisi/reuse logic
`EventDetailWindow` dengan memanggil method-method yang sama (BuildInputPanel, LoadGuests,
dll) karena semua field/method sudah `private` — perlu di-refactor ke `protected` atau
ekstrak ke `EventDetailLogic.cs` partial class.

**Rekomendasi pendekatan:**
Ekstrak semua logic ke `EventDetailLogic.cs` sebagai `partial class EventDetailWindow`:
```csharp
// EventDetailLogic.cs — partial class, semua method bisa dipakai EventDetailView
public partial class EventDetailWindow : Window { ... logic ... }

// EventDetailView.xaml.cs — UserControl yang memiliki field yang sama
public partial class EventDetailView : UserControl
{
    // Delegate semua ke shared logic
}
```

Karena refactor partial besar, pendekatan praktis: **EventDetailView adalah shell tipis
yang host EventDetailWindow sebagai embedded content** menggunakan `WindowsFormsHost`
pattern — namun WPF tidak support Window di dalam UserControl secara native.

**Pendekatan paling bersih (dipakai):**
Copy XAML content `EventDetailWindow` ke `EventDetailView`, dan shared logic via
`EventDetailBase` abstract class:

```
EventDetailBase.cs          ← abstract class dengan semua field + method
EventDetailWindow : Window  ← extends EventDetailBase, InitializeComponent() Window
EventDetailView : UserControl ← extends EventDetailBase, InitializeComponent() UserControl
```

Karena WPF tidak support multiple inheritance dan `UserControl`/`Window` keduanya inherit
`ContentControl`, cara paling pragmatis adalah **copy logic** dengan `EventDetailHelper.cs`
yang menyimpan semua state dan method, lalu di-inject ke keduanya.

### Tab Setting (Tab ke-4)

Di `EventDetailWindow.xaml` dan `EventDetailView.xaml`:

```xml
<TabControl x:Name="Tabs">
  <TabItem Header="Input">    ... (Tab 1 — sudah ada) </TabItem>
  <TabItem Header="Buku Tamu"> ... (Tab 2 — sudah ada) </TabItem>
  <TabItem Header="Rekap">     ... (Tab 3 — sudah ada) </TabItem>
  <TabItem Header="Setting">   ... (Tab 4 — BARU) </TabItem>
</TabControl>
```

Konten Tab Setting dipindahkan dari `SettingsWindow` (detail di Task 7).

### TopBar di Dalam EventDetail (cermin TopBar.tsx)

Struktur di atas `TabControl`:

```
┌──────────────────────────────────────────────────────────────┐
│ ←  Nama Acara ████████  [MEJA-1▾]  [Rp ••••• 👁]  [kasir●]  │
│                                      [Export] [🔄]           │
└──────────────────────────────────────────────────────────────┘
```

```xml
<Border Background="{DynamicResource CardBrush}"
        BorderBrush="{DynamicResource OutlineBrush}" BorderThickness="1"
        CornerRadius="10" Padding="10,8" Margin="0,0,0,8">
  <Grid>
    <Grid.ColumnDefinitions>
      <ColumnDefinition Width="Auto"/> <!-- Tombol kembali (hanya saat embed) -->
      <ColumnDefinition Width="*"/>   <!-- Info acara -->
      <ColumnDefinition Width="Auto"/> <!-- Aksi kanan -->
    </Grid.ColumnDefinitions>
    <!-- Tombol kembali ke daftar (hanya di EventDetailView embed) -->
    <Button x:Name="BackBtn" Style="{DynamicResource TextButton}" Click="OnBack"
            Width="32" Height="32" Content="&#xE72B;" FontFamily="Segoe MDL2 Assets"
            Visibility="Collapsed"/>
    <!-- Info: nama + meja + nominal + kasir -->
    <StackPanel Grid.Column="1" Orientation="Horizontal" VerticalAlignment="Center">
      <TextBlock x:Name="TitleText" FontWeight="SemiBold" FontSize="14"
                 TextTrimming="CharacterEllipsis" MaxWidth="220" VerticalAlignment="Center"/>
      <!-- Dropdown meja -->
      <ComboBox x:Name="MejaBox" Margin="8,0,0,0" Width="90"
                SelectionChanged="OnMejaChanged"/>
      <!-- Nominal pill (cermin nominalPill web) -->
      <Border Margin="8,0,0,0" Padding="8,3" CornerRadius="12"
              Background="{DynamicResource PrimaryContainerBrush}"
              BorderBrush="{DynamicResource OutlineBrush}" BorderThickness="1">
        <StackPanel Orientation="Horizontal">
          <TextBlock Text="&#xE719;" FontFamily="Segoe MDL2 Assets" FontSize="12"
                     Foreground="{DynamicResource OnPrimaryContainerBrush}"
                     VerticalAlignment="Center" Margin="0,0,4,0"/>
          <TextBlock x:Name="NominalPill" FontSize="12" FontWeight="SemiBold"
                     FontFamily="{DynamicResource NumericFont}"
                     Foreground="{DynamicResource OnPrimaryContainerBrush}"/>
          <Button x:Name="HideNominalBtn" Style="{DynamicResource TextButton}"
                  Width="18" Height="18" Click="OnToggleHideNominal" Margin="4,0,0,0"
                  Content="&#xE7B3;" FontFamily="Segoe MDL2 Assets" FontSize="11"
                  ToolTip="Sembunyikan/tampilkan nominal"/>
        </StackPanel>
      </Border>
      <!-- Kasir chip -->
      <Border Margin="8,0,0,0" Padding="8,3" CornerRadius="12"
              Background="{DynamicResource SurfaceContainerBrush}"
              BorderBrush="{DynamicResource OutlineBrush}" BorderThickness="1">
        <StackPanel Orientation="Horizontal">
          <Ellipse Width="6" Height="6" Fill="{DynamicResource TertiaryBrush}"
                   VerticalAlignment="Center" Margin="0,0,4,0"/>
          <TextBlock x:Name="KasirText" FontSize="12"
                     Foreground="{DynamicResource OnVariantBrush}"
                     TextTrimming="CharacterEllipsis" MaxWidth="100"/>
        </StackPanel>
      </Border>
    </StackPanel>
    <!-- Aksi kanan: role chip + export + sync -->
    <StackPanel Grid.Column="2" Orientation="Horizontal" VerticalAlignment="Center">
      <Border x:Name="TopRoleChip" Padding="8,3" CornerRadius="6" Margin="0,0,8,0"
              BorderBrush="{DynamicResource OutlineBrush}" BorderThickness="1">
        <TextBlock x:Name="TopRoleText" FontSize="11" FontWeight="SemiBold"/>
      </Border>
      <Button Content="Export" Click="OnExport" Style="{DynamicResource TonalButton}"
              Margin="0,0,6,0" Padding="10,5"/>
      <!-- Sync button -->
      <Button x:Name="SyncCloudBtn" Style="{DynamicResource M3SyncButton}" Click="OnSync"
              ToolTip="Sync data"/>
    </StackPanel>
  </Grid>
</Border>
```

### Shortcut EventDetail

| Shortcut | Aksi |
|---|---|
| `Ctrl+1` | Tab Input/Pemberian |
| `Ctrl+2` | Tab Buku Tamu |
| `Ctrl+3` | Tab Rekap |
| `Ctrl+4` | Tab Setting |
| `Ctrl+S` | Simpan (tab 1) / Simpan info acara (tab 4) |
| `Ctrl+R` | Refresh/Sync |
| `Escape` | Tutup suggest / tutup modal edit |
| Karakter (saat tidak ada fokus) | Auto-fokus field Nama |
| `↑↓` | Navigasi suggest list |
| `Enter` | Pilih suggest |
| `Tab` | Nama → Alamat → Nominal → Simpan |

Implementasi di `KeyDown` handler:
```csharp
private void OnKeyDown(object s, KeyEventArgs e)
{
    var ctrl = (Keyboard.Modifiers & ModifierKeys.Control) != 0;
    if (ctrl)
    {
        if (e.Key == Key.D1) { Tabs.SelectedIndex = 0; e.Handled = true; }
        if (e.Key == Key.D2) { Tabs.SelectedIndex = 1; e.Handled = true; }
        if (e.Key == Key.D3) { Tabs.SelectedIndex = 2; e.Handled = true; }
        if (e.Key == Key.D4) { Tabs.SelectedIndex = 3; e.Handled = true; }
        if (e.Key == Key.S)
        {
            e.Handled = true;
            if (Tabs.SelectedIndex == 0 && _ev.CanEdit && !_guestSaving)
                _ = SaveGuestAsync();
            else if (Tabs.SelectedIndex == 3 && _ev.CanEdit)
                OnSaveInfo(null, null);
        }
        if (e.Key == Key.R) { e.Handled = true; _ = OnSyncAsync(); }
    }
    // Auto-fokus field Nama saat karakter diketik di luar input
    var active = Keyboard.FocusedElement as FrameworkElement;
    if (!ctrl && !e.Handled && Tabs.SelectedIndex == 0
        && active is not TextBox && active is not ComboBox
        && e.Key.ToString().Length == 1 && _namaBox != null)
    {
        e.Handled = true;
        _namaBox.Focus();
    }
}
```

### Checklist Task 4

- [x] Buat `EventDetailView.xaml` (UserControl) dengan XAML yang sama tapi `UserControl` bukan `Window`
- [x] Buat `EventDetailView.xaml.cs` dengan logic yang sama (atau shared via helper)
- [x] Tambah `TabItem Header="Setting"` (konten kosong dulu, diisi Task 7)
- [x] Tambah TopBar baru (cermin `TopBar.tsx`) di atas `TabControl`
- [x] Tambah `BackBtn` (hanya di `EventDetailView`, Collapsed di `EventDetailWindow`)
- [x] Wiring shortcut `Ctrl+1–4`, `Ctrl+S`, `Ctrl+R`, `Escape`, auto-fokus
- [x] `EventsView.cs` `OnOpen`: logic hybrid (embed vs ShowDialog)
- [x] `MainWindow.cs` tambah `ShowEventDetail()`
- [x] Tombol kembali di `EventDetailView`: kembali ke daftar acara

---

## Task 5 — Tab Pemberian (Input)

**Tujuan:** Cermin tab `pemberian` web — form 2 kolom, chip alamat top-4, chip nominal
top-6, suggest dropdown M3, banner duplikat, tabel bawah dengan sort/filter.

### Layout Form Input

```
┌─────────────────────────────────────────┐
│  NAMA *                 NOMINAL (Rp)    │
│  [________________]     Rp [________]   │
│  [Chip alamat 1]        Rp [50.000]     │
│  [Chip alamat 2]        Rp [100.000]    │
│  [Chip alamat 3]        Rp [200.000]    │
│                                         │
│  ALAMAT *               METODE          │
│  [________________]     [AMPLOP][QRIS]  │
│                         [TRANSFER]      │
│                                         │
│  CATATAN                                │
│  [________________________________________]
│                                         │
│  [!] Ada duplikat: Budi dari Desa X     │
│                      [Simpan (Ctrl+S)] →│
└─────────────────────────────────────────┘
```

XAML struktur (2 kolom UniformGrid):
```xml
<UniformGrid Columns="2" Margin="0,0,0,8">
  <!-- Kolom kiri: Nama + chip alamat -->
  <StackPanel Margin="0,0,6,0">
    <TextBlock Text="NAMA" Style="{DynamicResource M3SectionTitle}"/>
    <!-- TextBox Nama dengan Popup suggest -->
    ...
    <TextBlock Text="ALAMAT" Style="{DynamicResource M3SectionTitle}" Margin="0,8,0,0"/>
    <TextBox x:Name="AlamatBox" .../>
    <WrapPanel x:Name="AlamatChips" Margin="0,6,0,0"/>
  </StackPanel>
  <!-- Kolom kanan: Nominal preview + input + chip nominal + metode -->
  <StackPanel Margin="6,0,0,0">
    <TextBlock Text="NOMINAL (Rp)" Style="{DynamicResource M3SectionTitle}"/>
    <TextBlock x:Name="NominalPreview" FontWeight="Bold" FontSize="18"
               FontFamily="{DynamicResource NumericFont}"
               Foreground="{DynamicResource PrimaryBrush}"
               HorizontalAlignment="Right" Margin="0,0,0,4"/>
    <TextBox x:Name="NominalBox" .../>
    <WrapPanel x:Name="NominalChips" Margin="0,6,0,0"/>
    <TextBlock Text="METODE" Style="{DynamicResource M3SectionTitle}" Margin="0,10,0,0"/>
    <WrapPanel x:Name="MetodeChips"/>
  </StackPanel>
</UniformGrid>
<!-- Catatan: full-width di bawah 2 kolom -->
<TextBlock Text="CATATAN (wajib jika duplikat)" Style="{DynamicResource M3SectionTitle}"/>
<TextBox x:Name="CatatanBox" .../>
```

### Chip Nominal (6 chips, cermin web)

```csharp
// nominalOptions: merge shortcut + default, deduplicate, sort, max 6
// Cermin: const nominalOptions = Array.from(new Set(merged)).sort().slice(0, 6)
var merged = _nominalTops.Select(n => n.Nominal)
    .Concat(new long[] { 50000, 100000, 200000 })
    .Distinct().OrderBy(n => n).Take(6);
```

Chip nominal render: `M3Chip` saat normal, `M3ChipActive` saat aktif (nilai = chip).
Keyboard highlight: `_nominalHighlighted` index → chip di-highlight dengan ring primary.

### Suggest Dropdown

Popup di atas `NamaBox` (sudah ada, perlu styling):
```xml
<Popup x:Name="SuggestPopup" Placement="Bottom" PlacementTarget="{Binding ElementName=NamaBox}"
       AllowsTransparency="False" StaysOpen="False">
  <Border Style="{DynamicResource M3Card}" MaxHeight="220" MinWidth="300" Padding="4">
    <ListBox x:Name="SuggestList" BorderThickness="0" Background="Transparent"
             SelectionChanged="OnSuggestSelect" MaxHeight="200">
      <ListBox.ItemTemplate>
        <DataTemplate>
          <StackPanel Padding="6,5">
            <TextBlock Text="{Binding Nama}" FontWeight="SemiBold" FontSize="13"/>
            <TextBlock Text="{Binding Alamat}" FontSize="12"
                       Foreground="{DynamicResource OnVariantBrush}"/>
          </StackPanel>
        </DataTemplate>
      </ListBox.ItemTemplate>
    </ListBox>
  </Border>
</Popup>
```

### Tabel Tamu (bawah)

```xml
<!-- Sort/Filter bar -->
<StackPanel Orientation="Horizontal" Margin="0,12,0,6">
  <TextBlock Text="CARI &amp; FILTER" Style="{DynamicResource M3SectionTitle}"
             VerticalAlignment="Center" Margin="0,0,10,0"/>
  <TextBox x:Name="GuestSearchBox" Width="200" .../>
  <ComboBox x:Name="MejaFilterBox" Margin="8,0,0,0" Width="100"/>
  <ComboBox x:Name="SortBox" Margin="8,0,0,0" Width="120"/>
  <ComboBox x:Name="OrderBox" Margin="6,0,0,0" Width="80"/>
</StackPanel>
<!-- DataGrid tamu -->
<DataGrid x:Name="GuestGrid" MaxHeight="400" ...>
  <!-- Kolom: #, Nama (+ catatan ↳), Alamat, Nominal, Meja, Kasir, Metode, Aksi -->
</DataGrid>
<!-- Footer + load more -->
<StackPanel Orientation="Horizontal" Margin="0,6,0,0">
  <TextBlock x:Name="GuestFooter" Foreground="{DynamicResource OnVariantBrush}" FontSize="12"/>
  <Button x:Name="GuestMoreBtn" Content="Muat 50 lagi" Style="{DynamicResource OutlineButton}"
          Margin="10,0,0,0" Visibility="Collapsed" Click="OnGuestMore"/>
</StackPanel>
```

### Checklist Task 5

- [x] Ganti form menjadi 2-kolom UniformGrid (kiri: nama+alamat, kanan: nominal+metode)
- [x] Preview nominal (angka besar, font numeric) di atas input nominal
- [x] Chip nominal: 6 chips, merge shortcut+default, sorted, `M3Chip`/`M3ChipActive`
- [x] Chip alamat: 4 chips, `M3Chip`/`M3ChipActive`, klik isi field alamat
- [x] Suggest dropdown: Popup dengan ListBox bergaya M3 (nama bold + alamat kecil)
- [x] Keyboard `↑↓` navigasi suggest, `Enter` pilih, `Escape` tutup
- [x] Auto-fokus field nominal setelah pilih suggest
- [x] Banner duplikat: `M3BannerError` dengan teks detail duplikat
- [x] Tombol simpan: full-width, label "Simpan (Ctrl+S)", `PrimaryButton`
- [x] Sort/filter bar di atas tabel
- [x] Tabel tamu: 8 kolom, row height 36, alternating row
- [x] Baris Nama menampilkan catatan jika ada (↳ catatan)
- [x] Tombol Edit + Hapus di kolom Aksi (hanya saat isEditor)
- [x] Footer: total nominal + jumlah data
- [x] "Muat 50 lagi" tombol (sudah ada, pastikan visible)

---

## Task 6 — Tab Buku Tamu & Tab Rekap

### Tab Buku Tamu

Layout:
```
┌──────────────────────────────────────────┐
│ [🔍 Cari buku tamu…]         [+ Tamu]   │
│ ─────────────────────────────────────── │
│ #  │ Nama         │ Alamat     │ Aksi   │
│ 1  │ Budi         │ Desa A     │ E  H   │
│ 2  │ Sari         │ Desa B     │ E  H   │
│ ─────────────────────────────────────── │
│ Total: 245 tamu              [Muat lagi] │
└──────────────────────────────────────────┘
```

Dialog Add/Edit Buku Tamu (cermin `Modal` web):
```xml
<!-- ContentDialog atau Window kecil dengan M3Card -->
<Border Style="{DynamicResource M3Card}" Padding="20" MaxWidth="400">
  <StackPanel>
    <TextBlock Text="Tambah Buku Tamu" Style="{DynamicResource M3Headline}"
               Margin="0,0,0,16"/>
    <TextBlock Text="NAMA" Style="{DynamicResource M3SectionTitle}"/>
    <TextBox x:Name="BookNamaBox" Margin="0,0,0,10"/>
    <TextBlock Text="ALAMAT / DESA" Style="{DynamicResource M3SectionTitle}"/>
    <TextBox x:Name="BookAlamatBox" Margin="0,0,0,16"/>
    <StackPanel Orientation="Horizontal" HorizontalAlignment="Right">
      <Button Content="Batal" Click="OnCancelBook" Style="{DynamicResource OutlineButton}"
              Margin="0,0,8,0"/>
      <Button Content="Simpan" Click="OnSaveBook" Style="{DynamicResource PrimaryButton}"/>
    </StackPanel>
  </StackPanel>
</Border>
```

### Tab Rekap

Layout:
```
┌──────────────────────────────────────────┐
│  ┌────────────────────────────────────┐  │
│  │  🏠 245 tamu                       │  │
│  │  💰 Rp 24.500.000    [👁]  [Export]│  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────┐ ┌────────────────┐   │
│  │ Per Alamat     │ │ Per Metode     │   │
│  │ Desa A  12 ... │ │ AMPLOP  100 ...│   │
│  │ Desa B   8 ... │ │ QRIS     45 ...│   │
│  └────────────────┘ └────────────────┘   │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │ Per Meja    (jika ada meja)      │    │
│  └──────────────────────────────────┘    │
└──────────────────────────────────────────┘
```

Kartu total besar:
```xml
<Border Style="{DynamicResource M3Card}" Margin="0,0,0,12" Padding="20">
  <Grid>
    <Grid.ColumnDefinitions>
      <ColumnDefinition Width="*"/>
      <ColumnDefinition Width="Auto"/>
    </Grid.ColumnDefinitions>
    <StackPanel>
      <TextBlock x:Name="TotalTamuText" FontSize="14"
                 Foreground="{DynamicResource OnVariantBrush}"/>
      <StackPanel Orientation="Horizontal" Margin="0,4,0,0">
        <TextBlock x:Name="TotalNominalText" FontSize="28" FontWeight="Bold"
                   FontFamily="{DynamicResource NumericFont}"/>
        <Button x:Name="HideRekapNominalBtn" Style="{DynamicResource TextButton}"
                Width="24" Height="24" Click="OnToggleHideNominal" Margin="8,0,0,0"
                Content="&#xE7B3;" FontFamily="Segoe MDL2 Assets" FontSize="12"/>
      </StackPanel>
    </StackPanel>
    <Button Grid.Column="1" Content="Export PDF / Excel" Click="OnExport"
            Style="{DynamicResource PrimaryButton}" VerticalAlignment="Center"/>
  </Grid>
</Border>
<!-- Grid 2 kolom per-alamat + per-metode -->
<UniformGrid x:Name="RekapGrid" Columns="2" Margin="0,0,0,12">
  <Border Style="{DynamicResource M3Card}" Margin="0,0,6,0">
    <StackPanel>
      <TextBlock Text="PER ALAMAT / DESA" Style="{DynamicResource M3SectionTitle}"/>
      <DataGrid x:Name="AlamatGrid" .../>
    </StackPanel>
  </Border>
  <Border Style="{DynamicResource M3Card}" Margin="6,0,0,0">
    <StackPanel>
      <TextBlock Text="PER METODE" Style="{DynamicResource M3SectionTitle}"/>
      <DataGrid x:Name="MetodeGrid" .../>
    </StackPanel>
  </Border>
</UniformGrid>
```

Dialog Export (cermin `exportModal` web):
```xml
<Border Style="{DynamicResource M3Card}" Padding="20" MaxWidth="440">
  <StackPanel>
    <TextBlock Text="Export Data" Style="{DynamicResource M3Headline}" Margin="0,0,0,16"/>
    <!-- Tipe: Pemberian / Buku Tamu -->
    <TextBlock Text="TIPE DATA" Style="{DynamicResource M3SectionTitle}"/>
    <StackPanel Orientation="Horizontal" Margin="0,0,0,10">
      <RadioButton x:Name="ExportTamu" Content="Buku Tamu" Margin="0,0,10,0"/>
      <RadioButton x:Name="ExportPemberian" Content="Pemberian" IsChecked="True"/>
    </StackPanel>
    <!-- Format: PDF / Excel -->
    <TextBlock Text="FORMAT" Style="{DynamicResource M3SectionTitle}"/>
    <StackPanel Orientation="Horizontal" Margin="0,0,0,10">
      <RadioButton x:Name="ExportPdf" Content="PDF" IsChecked="True" Margin="0,0,10,0"/>
      <RadioButton x:Name="ExportExcel" Content="Excel / CSV"/>
    </StackPanel>
    <!-- Urutan: Nama A-Z, Waktu, Nominal -->
    <TextBlock Text="URUTAN" Style="{DynamicResource M3SectionTitle}"/>
    <ComboBox x:Name="ExportOrderBox" Margin="0,0,0,10">
      <ComboBoxItem Content="Nama A–Z" Tag="nama_az" IsSelected="True"/>
      <ComboBoxItem Content="Nama Z–A" Tag="nama_za"/>
      <ComboBoxItem Content="Alamat A–Z" Tag="alamat_az"/>
      <ComboBoxItem Content="Nominal ↓" Tag="nominal_desc"/>
      <ComboBoxItem Content="Waktu ↓" Tag="waktu_desc"/>
    </ComboBox>
    <!-- Orientasi (PDF saja) -->
    <TextBlock x:Name="OrientasiLabel" Text="ORIENTASI (PDF)" Style="{DynamicResource M3SectionTitle}"/>
    <StackPanel Orientation="Horizontal" Margin="0,0,0,16">
      <RadioButton x:Name="ExportLandscape" Content="Landscape" IsChecked="True" Margin="0,0,10,0"/>
      <RadioButton x:Name="ExportPortrait" Content="Portrait"/>
    </StackPanel>
    <StackPanel Orientation="Horizontal" HorizontalAlignment="Right">
      <Button Content="Batal" Click="OnCancelExport" Style="{DynamicResource OutlineButton}"
              Margin="0,0,8,0"/>
      <Button Content="Export" Click="OnDoExport" Style="{DynamicResource PrimaryButton}"/>
    </StackPanel>
  </StackPanel>
</Border>
```

`SizeChanged` untuk kolom RekapGrid:
```csharp
private void OnSizeChanged(object s, SizeChangedEventArgs e)
{
    if (RekapGrid != null)
        RekapGrid.Columns = e.NewSize.Width < 800 ? 1 : 2;
}
```

### Checklist Task 6

**Buku Tamu:**
- [x] Search bar bergaya M3 (border + ikon) + tombol "+ Tamu" kanan
- [x] DataGrid tabel: #, Nama, Alamat, Aksi (Edit + Hapus)
- [x] Dialog Add/Edit: `M3Card` popup dengan field Nama + Alamat + tombol Batal/Simpan
- [x] Konfirmasi hapus: `MessageBox` atau dialog kecil (bukan `confirm()` native)
- [x] Footer: total buku tamu + "Muat 50 lagi"

**Rekap:**
- [x] Kartu total besar: jumlah tamu + total nominal (font besar numeric) + hide/show + Export
- [x] `UniformGrid` 2 kolom: per-Alamat + per-Metode; `SizeChanged` → 1 kolom saat <800px
- [x] DataGrid per-Alamat: Alamat, Jumlah, Total Rp
- [x] DataGrid per-Metode: Metode, Jumlah, Total Rp, Porsi %
- [x] Dialog Export: tipe, format, urutan, orientasi
- [x] Export PDF memanggil `Exporter.cs` (sudah ada)
- [x] Export Excel/CSV memanggil `Exporter.cs`

---

## Task 7 — Tab Setting (ke-4)

**Tujuan:** Pindahkan konten `SettingsWindow` ke dalam tab Setting di `EventDetailWindow`,
cermin tab `setting` web (`EventClient.tsx`).

### Bagian-Bagian Tab Setting

```
┌────────────────────────────────────────────────┐
│ INFO ACARA                              [Simpan]│
│ ┌─────────────────┐ ┌────────────────────────┐  │
│ │ Nama Acara      │ │ Lokasi                 │  │
│ │ [__________]    │ │ [__________]           │  │
│ │ Tuan Rumah *    │ │ Catatan                │  │
│ │ [__________]    │ │ [__________]           │  │
│ │ Tanggal         │ │                        │  │
│ │ [__________]    │ │                        │  │
│ └─────────────────┘ └────────────────────────┘  │
│ HANYA OWNER/ADMIN YANG BISA MENGUBAH ← jika VIEWER
│ ────────────────────────────────────────────── │
│ MEJA (maks 10)                                  │
│ [MEJA-1 ×] [MEJA-2 ×] [MEJA-3 ×]              │
│ [__________] [+ Tambah]                         │
│ ────────────────────────────────────────────── │
│ ANGGOTA (hanya OWNER)                           │
│ [🔍 Cari user…] [ADMIN▾] [+ Tambah]            │
│ Nama         Email          Role    Aksi        │
│ Budi         budi@...       ADMIN   Edit Hapus  │
│ ────────────────────────────────────────────── │
│ AUDIT LOG                                       │
│ [🔍 Cari log…]                                  │
│ 2026-09-24 • Budi: TAMBAH Sari dari Desa A     │
│ ────────────────────────────────────────────── │
│ [Hapus Acara Permanen]   ← DangerButton, paling bawah
└────────────────────────────────────────────────┘
```

### Form Info Acara (2 Kolom)

```xml
<GroupBox Header="Info Acara" Margin="0,0,0,8">
  <StackPanel>
    <UniformGrid Columns="2">
      <StackPanel Margin="0,0,6,0">
        <TextBlock Text="NAMA ACARA" Style="{DynamicResource M3SectionTitle}"/>
        <TextBox x:Name="SettingNamaBox" Margin="0,0,0,8"/>
        <TextBlock Text="TUAN RUMAH *" Style="{DynamicResource M3SectionTitle}"/>
        <TextBox x:Name="SettingTuanBox" Margin="0,0,0,8"/>
        <TextBlock Text="TANGGAL" Style="{DynamicResource M3SectionTitle}"/>
        <DatePicker x:Name="SettingTglPicker"/>
      </StackPanel>
      <StackPanel Margin="6,0,0,0">
        <TextBlock Text="LOKASI" Style="{DynamicResource M3SectionTitle}"/>
        <TextBox x:Name="SettingLokBox" Margin="0,0,0,8"/>
        <TextBlock Text="CATATAN" Style="{DynamicResource M3SectionTitle}"/>
        <TextBox x:Name="SettingCatBox" AcceptsReturn="True" Height="80"
                 VerticalContentAlignment="Top"/>
      </StackPanel>
    </UniformGrid>
    <TextBlock x:Name="SettingViewerNote" FontSize="12" Margin="0,8,0,0"
               Foreground="{DynamicResource OnVariantBrush}" Visibility="Collapsed"
               Text="Hanya OWNER/ADMIN yang bisa mengubah info acara."/>
    <Button x:Name="SettingSaveBtn" Content="Simpan Perubahan (Ctrl+S)"
            Style="{DynamicResource PrimaryButton}" HorizontalAlignment="Right"
            Margin="0,10,0,0" Click="OnSaveInfo"/>
  </StackPanel>
</GroupBox>
```

### Chip Meja Deletable

```csharp
// Cermin WrapPanel chip meja dengan tombol × 
private void RebuildMejaChips()
{
    SettingMejaChips.Children.Clear();
    foreach (var m in _ev.MejaList)
    {
        var panel = new StackPanel { Orientation = Orientation.Horizontal };
        var lbl = new TextBlock { Text = m, VerticalAlignment = VerticalAlignment.Center };
        var del = new Button { Content = "×", Tag = m };
        del.Click += (_, _) => RemoveMeja(m);
        // Bungkus dalam Border M3Chip
        var chip = new Border { Style = M3Style("M3Chip") };
        chip.Child = panel;
        panel.Children.Add(lbl);
        panel.Children.Add(del);
        SettingMejaChips.Children.Add(chip);
    }
}
```

### Audit Log

```xml
<GroupBox Header="Audit Log" Margin="0,8,0,0">
  <StackPanel>
    <TextBox x:Name="LogSearchBox" TextChanged="OnLogSearch" Margin="0,0,0,8"
             Tag="Cari log…"/>
    <DataGrid x:Name="AuditGrid" AutoGenerateColumns="False" IsReadOnly="True"
              MaxHeight="250" HeadersVisibility="Column">
      <DataGrid.Columns>
        <DataGridTextColumn Header="Waktu" Binding="{Binding Waktu}" Width="130"/>
        <DataGridTextColumn Header="User" Binding="{Binding User}" Width="120"/>
        <DataGridTextColumn Header="Aksi" Binding="{Binding Aksi}" Width="*"/>
      </DataGrid.Columns>
    </DataGrid>
  </StackPanel>
</GroupBox>
```

### Danger Zone

```xml
<Border Margin="0,12,0,0" Padding="16" CornerRadius="8"
        BorderBrush="{DynamicResource ErrorBrush}" BorderThickness="1">
  <StackPanel>
    <TextBlock Text="Zona Berbahaya" FontWeight="SemiBold"
               Foreground="{DynamicResource ErrorBrush}" Margin="0,0,0,4"/>
    <TextBlock Text="Tindakan ini tidak bisa dibatalkan." FontSize="12"
               Foreground="{DynamicResource OnVariantBrush}" Margin="0,0,0,8"/>
    <Button x:Name="DeleteBtn" Content="Hapus Acara Permanen"
            Style="{DynamicResource DangerButton}" Click="OnDelete"
            HorizontalAlignment="Left"/>
  </StackPanel>
</Border>
```

Konfirmasi hapus (cermin web — ketik "HAPUS"):
```csharp
private async void OnDelete(object s, RoutedEventArgs e)
{
    // Dialog kecil dengan TextBox konfirmasi
    var dlg = new ConfirmDeleteDialog("Ketik HAPUS untuk konfirmasi");
    if (dlg.ShowDialog() == true && dlg.Input == "HAPUS")
    {
        await DeleteEventAsync();
        // Kembali ke daftar acara
        if (Application.Current.MainWindow is MainWindow mw)
            mw.GoEvents(null, null);
        else this.Close();
    }
}
```

### Checklist Task 7

- [x] Pindahkan form info acara ke tab Setting (2 kolom UniformGrid)
- [x] Chip meja deletable dengan tombol × per chip
- [x] Seksi anggota: cari user + ComboBox role + DataGrid + edit/hapus (hanya OWNER)
- [x] Audit log: DataGrid + search debounce
- [x] Danger zone: border merah + tombol hapus + dialog konfirmasi ketik "HAPUS"
- [x] `Ctrl+S` dari tab Setting → `OnSaveInfo()`
- [x] Setelah simpan: refresh TopBar judul acara
- [x] `SettingsWindow` tetap ada (fallback), tapi isinya diganti dengan pesan redirect

---

## Task 8 — AccountView

**Tujuan:** Cermin `/account` web — kartu profil + tampilan segmented + tile grid 2 kolom
+ sub-halaman inline.

### Layout AccountView

```
┌─────────────────────────────────────────┐
│ Akun                                    │
│ ┌─────────────────────────────────────┐ │
│ │ [👤] Budi Santoso                   │ │
│ │      budi@email.com                 │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Tampilan   [☀ Terang][🌙 Gelap][⚙]  │ │
│ └─────────────────────────────────────┘ │
│ ┌──────────────┐ ┌───────────────────┐  │
│ │ [👤] Profil →│ │ [🔒] Keamanan  → │  │
│ └──────────────┘ └───────────────────┘  │
│ ┌──────────────┐ ┌───────────────────┐  │
│ │ [📱] PIN   → │ │ [ℹ] Tentang    → │  │
│ └──────────────┘ └───────────────────┘  │
│ ┌─────────────────────────────────────┐ │
│ │ [Sub-halaman expand di sini]        │ │  ← SubHost
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Kartu Profil (sudah ada, rapikan)

Perbarui `AvatarCircle` ke 52px, load foto profil jika ada (`profilePicture`/`avatar`
dari API `/api/users/me`).

### Segmented Button Tema (cermin Flutter)

`M3Segmented.cs` sudah ada → gunakan untuk pilihan tema:
```csharp
var seg = new M3Segmented(new[] { "☀ Terang", "🌙 Gelap", "⚙ Sistem" });
seg.SelectedIndex = ThemeManager.Current == ThemeMode.Light ? 0
    : ThemeManager.Current == ThemeMode.Dark ? 1 : 2;
seg.Changed += (i) => ThemeManager.Set(i == 0 ? ThemeMode.Light
    : i == 1 ? ThemeMode.Dark : ThemeMode.System);
ThemeSegHost.Content = seg;
```

### Tile Grid 2 Kolom

`SizeChanged` → 1 kolom saat <600px, 2 kolom saat ≥600px.

```xml
<UniformGrid x:Name="TileGrid" Columns="2" Margin="0,8,0,0">
  <Border x:Name="TileProfil" Style="{DynamicResource M3Card}" Margin="0,0,6,6"
          Cursor="Hand" Focusable="True" MouseLeftButtonUp="GoProfile">
    <Grid>
      <Grid.ColumnDefinitions>
        <ColumnDefinition Width="48"/>
        <ColumnDefinition Width="*"/>
        <ColumnDefinition Width="Auto"/>
      </Grid.ColumnDefinitions>
      <Border Width="40" Height="40" CornerRadius="10"
              Background="{DynamicResource SecondaryContainerBrush}">
        <TextBlock Text="&#xE77B;" FontFamily="Segoe MDL2 Assets" FontSize="18"
                   Foreground="{DynamicResource OnSecondaryContainerBrush}"
                   HorizontalAlignment="Center" VerticalAlignment="Center"/>
      </Border>
      <StackPanel Grid.Column="1" Margin="10,0,0,0" VerticalAlignment="Center">
        <TextBlock Text="Profil" FontWeight="SemiBold" FontSize="14"/>
        <TextBlock Text="Nama, username, email" FontSize="12"
                   Foreground="{DynamicResource OnVariantBrush}"/>
      </StackPanel>
      <TextBlock Grid.Column="2" Text="&#xE76C;" FontFamily="Segoe MDL2 Assets"
                 FontSize="16" Foreground="{DynamicResource OnVariantBrush}"
                 VerticalAlignment="Center"/>
    </Grid>
  </Border>
  <!-- TileKeamanan, TilePin, TileTentang — pola sama -->
</UniformGrid>
```

### Sub-Halaman Inline

```csharp
private void GoProfile(object s, MouseButtonEventArgs e)
{
    SubHost.Content = new ProfilSub(_cachedUser, OnSubBack);
}
private void OnSubBack()
{
    SubHost.Content = null;
    _load(); // refresh kartu profil
}
```

Setiap sub-halaman (`ProfilSub`, `KeamananSub`, `PinSub`, `TentangSub`) adalah
`UserControl` dengan tombol "← Kembali" di atas yang memanggil callback `onBack`.

### Sub-Halaman Profil

- Form: Nama (TextBox), Username (TextBox, cek availability), Email (disabled)
- Upload foto: `Button` klik → `OpenFileDialog` → preview → upload ke `/api/upload`
- Simpan → `PATCH /api/users/me`
- Snackbar notifikasi (cermin web `setSnack`)

### Sub-Halaman Keamanan

- Form ganti password: Password lama + Password baru + Konfirmasi
- Daftar perangkat tertaut: DataGrid (nama, platform, terakhir dipakai, tombol Cabut)
- Cabut perangkat → `DELETE /api/auth/devices/{id}`

### Sub-Halaman PIN

- Sudah ada `PinFlow.cs` → reuse logic
- Tambah: toggle jeda kunci otomatis (kombo: 5/15/30 menit / tidak pernah)

### Sub-Halaman Tentang

- Versi app (dari `AppConfig`)
- URL server (dari `AppConfig`, bisa diedit)
- Tombol "Keluar Akun" (`DangerButton`)
- Tautan dokumentasi / repo

### Checklist Task 8

- [x] Perbarui kartu profil: avatar 52px, load foto jika ada
- [x] Pasang M3Segmented tema (Terang/Gelap/Sistem) via `ThemeSegHost`
- [x] Tile grid 2 kolom: ikon kotak `SecondaryContainer` + judul + subtitle + chevron
- [x] `SizeChanged` → 1 kolom saat <600px
- [x] Sub-halaman inline: click tile → `SubHost.Content = UserControl baru`
- [x] Buat `ProfilSub.xaml` + `.cs`: form nama/username + upload foto + simpan
- [x] Buat `KeamananSub.xaml` + `.cs`: ganti password + daftar perangkat
- [x] Buat `PinSub.xaml` + `.cs`: reuse `PinFlow.cs` + jeda kunci
- [x] Buat `TentangSub.xaml` + `.cs`: versi + server URL + keluar
- [x] Snackbar: `Dispatcher.BeginInvoke` dengan auto-dismiss 3 detik

---

## Task 9 — Shortcut Keyboard Global

**Tujuan:** Semua shortcut tersedia, konsisten, dan ada tooltip panduan.

### Tabel Shortcut Lengkap

| Shortcut | Konteks | Aksi |
|---|---|---|
| `Alt+1` | Global (MainWindow) | Navigasi ke Acara |
| `Alt+2` | Global (MainWindow) | Navigasi ke Akun |
| `Ctrl+N` | EventsView | Buat acara baru |
| `Ctrl+F` | EventsView | Fokus ke search acara |
| `Enter` | EventsView (item terfokus) | Buka acara terpilih |
| `↑↓` | EventsView | Navigasi kartu |
| `Ctrl+1` | EventDetail | Tab Input/Pemberian |
| `Ctrl+2` | EventDetail | Tab Buku Tamu |
| `Ctrl+3` | EventDetail | Tab Rekap |
| `Ctrl+4` | EventDetail | Tab Setting |
| `Ctrl+S` | EventDetail tab 1 | Simpan pemberian |
| `Ctrl+S` | EventDetail tab 4 | Simpan info acara |
| `Ctrl+R` | EventDetail | Refresh/Sync |
| `Escape` | EventDetail | Tutup suggest/modal |
| Karakter | EventDetail tab 1 (tidak ada fokus) | Auto-fokus field Nama |
| `↑↓` | Suggest dropdown | Navigasi item |
| `Enter` | Suggest dropdown | Pilih item, fokus ke nominal |
| `Tab` | Form input | Nama → Alamat → Nominal → Simpan |
| `←` | EventDetailView embed | Kembali ke daftar acara |

### Implementasi `PreviewKeyDown` MainWindow

```csharp
protected override void OnPreviewKeyDown(KeyEventArgs e)
{
    base.OnPreviewKeyDown(e);
    var alt = (Keyboard.Modifiers & ModifierKeys.Alt) != 0;
    var ctrl = (Keyboard.Modifiers & ModifierKeys.Control) != 0;
    if (alt && !ctrl)
    {
        if (e.Key == Key.D1) { GoEvents(null, null); e.Handled = true; }
        if (e.Key == Key.D2) { GoAccount(null, null); e.Handled = true; }
    }
    if (ctrl && e.Key == Key.N && Host?.Content is EventsView ev)
    {
        ev.OnCreate(null, null); e.Handled = true;
    }
}
```

### Tooltip Tombol

Semua tombol penting harus punya `ToolTip` yang menyebut shortcut:
```xml
<Button Content="Simpan" ToolTip="Simpan pemberian (Ctrl+S)" .../>
<Button Content="Sync" ToolTip="Sync data (Ctrl+R)" .../>
<Button Content="Export" ToolTip="Export PDF / Excel" .../>
```

### Checklist Task 9

- [x] `PreviewKeyDown` di `MainWindow`: `Alt+1`, `Alt+2`, `Ctrl+N`
- [x] `KeyDown` di `EventDetailWindow`/`EventDetailView`: `Ctrl+1–4`, `Ctrl+S`, `Ctrl+R`, `Escape`
- [x] Navigasi suggest: `↑↓` + `Enter` + `Escape`
- [x] Auto-fokus field Nama dari karakter bebas (saat tab 1, tidak ada fokus input)
- [x] `Tab` navigasi antar field form (urus `TabIndex` di XAML)
- [x] `Enter` di EventsView buka acara terpilih
- [x] Semua tombol penting punya `ToolTip` dengan shortcut
- [x] Test: alur satset tanpa mouse — search → open → ketik → suggest → Enter → nominal → Ctrl+S

---

## Task 10 — Polish & QA

**Tujuan:** QA visual final — spacing konsisten, dark mode, resize smooth.

### Checklist Polish

**Spacing:**
- [x] Audit semua `Margin`/`Padding` hardcoded → ganti ke token (`{StaticResource M3CardPadding}`, dll)
- [x] Jarak antar kartu konsisten: `M3CardGap` (0,0,0,12)
- [x] Jarak antar seksi dalam kartu: `M3SectionGap` (0,12,0,0)

**Dark Mode:**
- [x] Semua brush pakai `DynamicResource` — audit dengan `scripts/check-wpf-brushes.py`
- [x] Tidak ada `#xxxxxx` warna hardcoded di XAML selain di `Light.xaml` / `Dark.xaml`
- [ ] Toggle tema → semua elemen berubah instan tanpa restart *(QA manual Windows)*

**Resize:**
- [x] EventsView grid: 800px → 1 kolom, 700–1049px → 2 kolom, ≥1050px → 3 kolom
- [x] Rekap grid: <800px → 1 kolom, ≥800px → 2 kolom
- [x] AccountView tile: <600px → 1 kolom, ≥600px → 2 kolom
- [x] Form input 2 kolom: di layar sempit tetap 2 kolom (minimum per kolom ~220px)

**Font & Angka:**
- [x] Semua angka nominal/total pakai `FontFamily="{DynamicResource NumericFont}"` (Geist Mono)
- [x] Semua teks panjang punya `TextTrimming="CharacterEllipsis"`

**Scroll:**
- [x] Semua tab `EventDetail` punya `ScrollViewer` dengan `VerticalScrollBarVisibility="Auto"`
- [x] `AccountView` punya `ScrollViewer` luar
- [ ] Tidak ada konten terpotong saat window diperkecil ke 800×600px *(QA manual Windows)*

**Aksesibilitas:**
- [x] Semua tombol punya `ToolTip`
- [x] Semua input punya `Tag` (dipakai sebagai placeholder) atau `Label` terkait
- [x] `Focusable="True"` pada kartu yang bisa diklik keyboard

**Khusus WPF:**
- [x] `SnapsToDevicePixels="True"` pada semua `Border` + `DataGrid` agar garis tidak blur
- [x] `RenderOptions.BitmapScalingMode="HighQuality"` jika ada gambar
- [x] M3Chrome title bar tidak overlap dengan konten AppBar

### Urutan QA

1. Build Release → buka app
2. Test dark mode toggle (AppBar → dropdown → Mode Gelap)
3. Test resize: 800px → 1100px → 1400px (semua grid berubah)
4. Alur satset tanpa mouse: `Alt+1` → `Ctrl+F` cari → `Enter` buka → ketik nama → suggest → `Enter` → nominal chip → `Ctrl+S` simpan
5. Test offline: cabut kabel/matikan wifi → banner offline muncul → ketik → data masuk queue → sambung lagi → sync otomatis
6. Test dark mode: semua permukaan ikut tema, tidak ada yang tertinggal terang

---

## Catatan Transisi: Linux Flutter

Setelah WPF selesai, rombak Flutter desktop menggunakan pola yang sama:

| WPF | Flutter |
|---|---|
| `M3NavRailItem` | `NavigationRail` dengan `NavigationRailDestination` |
| `EventDetailView` (UserControl embed) | `EventDetailScreen` di dalam `Scaffold` body |
| `UniformGrid Columns=2/3` | `GridView.count(crossAxisCount:...)` + `LayoutBuilder` |
| `M3Chrome.cs` | `window_manager` package (sudah ada di `window_ui.dart`) |
| Shortcut `KeyDown` | `CallbackShortcuts` + `FocusNode.onKeyEvent` |
| `SizeChanged` handler | `LayoutBuilder` + `WindowUi.columnsForWidth()` |

File yang perlu dirombak di Flutter:
```
mobile/lib/features/events/events_screen.dart
mobile/lib/features/event_detail/event_detail_screen.dart
mobile/lib/features/account/account_screen.dart
mobile/lib/core/window_ui.dart  (mungkin tidak perlu diubah, sudah bagus)
```

---

## Progress Tracking

| Task | Status | Catatan |
|---|---|---|
| Task 1: Token desain | ✅ Done | RoleChip/Banner via TextBlock.Foreground + brush OnErrorContainer/OnInfo 2026-09-24 |
| Task 2: MainWindow AppBar + Rail | ✅ Done | AppBar DashboardHeader + rail M3NavRailItem + Alt+1/2 Ctrl+N 2026-09-24 |
| Task 3: EventsView grid fluida | ✅ Done | UniformGrid 1/2/3 + kartu baru + hybrid dispatch (embed penuh di Task 4) 2026-09-24 |
| Task 4: EventDetailView hybrid + tab 4 | ✅ Done | Inversi View-pemilik-logic + TopBar + shortcut + Setting placeholder 2026-09-24 |
| Task 5: Tab Pemberian | ✅ Done | Form 2-kolom + chip merge-6 + suggest M3 + banner error + simpan full-width 2026-09-24 |
| Task 6: Tab Buku Tamu + Rekap | ✅ Done | Search M3 + dialog Batal + rekap hide/Porsi + opsi Export 2026-09-24 |
| Task 7: Tab Setting | ✅ Done | Port SettingsWindow penuh + audit-log + HAPUS confirm + redirect fallback 2026-09-24 |
| Task 8: AccountView | ✅ Done | Subs inline + foto/cek-user/perangkat/PIN-grace/server-URL + snack 2026-09-24 |
| Task 9: Shortcut global | ✅ Done | ↑↓ kartu + Ctrl+R global + ← kembali + tooltip pass 2026-09-24 |
| Task 10: Polish & QA | ✅ Done (statis) | Audit lolos; QA runtime (toggle/800×600/offline) manual di Windows 2026-09-24 |

Legend: ⬜ Todo · 🔵 In Progress · ✅ Done · 🔴 Blocked
