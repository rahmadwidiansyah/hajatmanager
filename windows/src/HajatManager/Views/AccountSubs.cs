using System.IO;
using System.Net.Http;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using HajatManager.Api;
using HajatManager.Services;
using Microsoft.Win32;

namespace HajatManager.Views;

// Sub-halaman akun inline cermin /account web (Task 8).
// Setiap sub memakai SubPage: tombol ← Kembali + judul + kartu + snackbar 3 detik.

/// <summary>Cangkang sub-halaman: kembali + judul + kartu + snackbar auto-dismiss.</summary>
internal sealed class SubPage : UserControl
{
    private readonly TextBlock _snack;
    private readonly DispatcherTimer _snackTimer;

    public SubPage(string title, string subtitle, UIElement body, Action? onBack)
    {
        var root = new StackPanel();
        var back = new Button
        {
            Content = "← Kembali",
            HorizontalAlignment = HorizontalAlignment.Left,
            ToolTip = "Kembali ke daftar menu akun",
        };
        if (Application.Current?.TryFindResource("TextButton") is Style tbs) back.Style = tbs;
        back.Click += (_, _) => { try { onBack?.Invoke(); } catch { } };
        root.Children.Add(back);
        root.Children.Add(new TextBlock
        {
            Text = title, FontWeight = FontWeights.Bold, FontSize = 16,
            Margin = new Thickness(0, 8, 0, 0),
        });
        if (!string.IsNullOrWhiteSpace(subtitle))
        {
            var sub = new TextBlock
            {
                Text = subtitle, FontSize = 12, Margin = new Thickness(0, 2, 0, 0),
                TextWrapping = TextWrapping.Wrap,
            };
            sub.SetResourceReference(TextBlock.ForegroundProperty, "OnVariantBrush");
            root.Children.Add(sub);
        }
        var card = M3Field.Card(body);
        card.Margin = new Thickness(0, 8, 0, 0);
        root.Children.Add(card);
        _snack = new TextBlock
        {
            Visibility = Visibility.Collapsed,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 8, 0, 0),
        };
        root.Children.Add(_snack);
        _snackTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
        _snackTimer.Tick += (_, _) =>
        {
            _snackTimer.Stop();
            try { _snack.Visibility = Visibility.Collapsed; } catch { }
        };
        Content = root;
    }

    /// <summary>Snackbar cermin web setSnack: BeginInvoke + hilang otomatis 3 detik.</summary>
    public void Notify(string msg, bool isError = false)
    {
        try
        {
            Dispatcher.BeginInvoke(new Action(() =>
            {
                try
                {
                    _snack.Text = msg;
                    _snack.SetResourceReference(TextBlock.ForegroundProperty,
                        isError ? "ErrorBrush" : "PrimaryBrush");
                    _snack.Visibility = Visibility.Visible;
                    _snackTimer.Stop();
                    _snackTimer.Start();
                }
                catch { }
            }));
        }
        catch { }
    }
}

internal static class SubPhotos
{
    // Foto profil lingkaran 52px; gagal unduh → inisial (best-effort, offline aman).
    public static async Task FillCircleAsync(Border circle, TextBlock initial, string? url)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(url)) return;
            var bytes = await ApiClient.Instance.GetBytesAsync(url);
            if (bytes == null || bytes.Length == 0) return;
            circle.Dispatcher.BeginInvoke(new Action(() =>
            {
                try
                {
                    var bmp = new System.Windows.Media.Imaging.BitmapImage();
                    using var ms = new MemoryStream(bytes);
                    bmp.BeginInit();
                    bmp.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
                    bmp.StreamSource = ms;
                    bmp.EndInit();
                    bmp.Freeze();
                    var img = new Image
                    {
                        Source = bmp,
                        Stretch = System.Windows.Media.Stretch.UniformToFill,
                        Width = 52, Height = 52,
                    };
                    img.SetValue(System.Windows.Media.RenderOptions.BitmapScalingModeProperty,
                        System.Windows.Media.BitmapScalingMode.HighQuality);
                    img.Clip = new System.Windows.Media.EllipseGeometry(
                        new Point(26, 26), 26, 26);
                    circle.Child = img;
                }
                catch { }
            }));
        }
        catch { }
    }
}

// Sub-halaman akun — cermin profile/security/about Flutter + /account web.
public sealed class ProfileView : UserControl
{
    private readonly SubPage _page;
    private DispatcherTimer? _checkTimer;
    private string _uname0 = "";
    private string _name0 = "";
    private string _status = "idle"; // idle|checking|available|taken

    public ProfileView(Action? onBack = null)
    {
        var cached = AppConfig.Instance.GetCachedUser() ?? "{}";
        var email = "";
        string? photo = null;
        try
        {
            var root = JsonDocument.Parse(cached).RootElement;
            email = root.TryGetProperty("email", out var em) ? em.GetString() ?? "" : "";
            _name0 = root.TryGetProperty("name", out var nn) ? nn.GetString() ?? "" : "";
            _uname0 = root.TryGetProperty("username", out var un) && un.ValueKind != JsonValueKind.Null ? un.GetString() ?? "" : "";
            foreach (var key in new[] { "profilePicture", "avatar", "image" })
            {
                if (root.TryGetProperty(key, out var p) && p.ValueKind == JsonValueKind.String)
                {
                    var v = p.GetString();
                    if (!string.IsNullOrWhiteSpace(v)) { photo = v; break; }
                }
            }
        }
        catch { }
        var name = new TextBox { Text = _name0, Margin = new Thickness(0, 0, 0, 8) };
        var uname = new TextBox { Text = _uname0, Margin = new Thickness(0, 0, 0, 4) };
        var unameStatus = new TextBlock { FontSize = 12, Margin = new Thickness(0, 0, 0, 8) };
        uname.TextChanged += (_, _) => ScheduleUsernameCheck(uname.Text, unameStatus);
        // Email tampil saja cermin web (disabled).
        var mail = new TextBox { Text = email, Margin = new Thickness(0, 0, 0, 8), IsEnabled = false };
        // Foto profil: preview + ganti + hapus cermin /account web.
        var photoCircle = new Border
        {
            Width = 52, Height = 52, CornerRadius = new CornerRadius(26),
            Margin = new Thickness(0, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        photoCircle.SetResourceReference(Border.BackgroundProperty, "PrimaryContainerBrush");
        var photoInitial = new TextBlock
        {
            Text = _name0.Trim().Length > 0 ? _name0.Trim()[..1].ToUpperInvariant() : "?",
            FontWeight = FontWeights.Bold, FontSize = 20,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        };
        photoInitial.SetResourceReference(TextBlock.ForegroundProperty, "OnPrimaryContainerBrush");
        photoCircle.Child = photoInitial;
        _ = SubPhotos.FillCircleAsync(photoCircle, photoInitial, photo);
        var changePhoto = new Button { Content = "Ganti foto", VerticalAlignment = VerticalAlignment.Center };
        if (Application.Current?.TryFindResource("OutlineButton") is Style obs) changePhoto.Style = obs;
        var removePhoto = new Button
        {
            Content = "Hapus", Margin = new Thickness(8, 0, 0, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        if (Application.Current?.TryFindResource("TextButton") is Style tbs) removePhoto.Style = tbs;
        changePhoto.Click += async (_, _) => await UploadPhotoAsync(changePhoto, photoCircle, photoInitial);
        removePhoto.Click += async (_, _) =>
        {
            try
            {
                using var r = await ApiClient.Instance.PatchJsonAsync("/api/users/me",
                    new { profilePicture = (string?)null });
                if (!r.IsSuccessStatusCode)
                {
                    _page.Notify(await ApiClient.Instance.TryErrAsync(r, "Gagal hapus foto") ?? "Gagal", true);
                    return;
                }
                await RefreshCachedUserAsync();
                photoCircle.Child = photoInitial;
                _page.Notify("Foto profil dihapus");
            }
            catch { _page.Notify("Butuh online.", true); }
        };
        var photoRow = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Margin = new Thickness(0, 0, 0, 8),
            VerticalAlignment = VerticalAlignment.Center,
        };
        photoRow.Children.Add(photoCircle);
        photoRow.Children.Add(changePhoto);
        photoRow.Children.Add(removePhoto);
        var err = new TextBlock { TextWrapping = TextWrapping.Wrap };
        err.SetResourceReference(TextBlock.ForegroundProperty, "ErrorBrush");
        var btn = new Button { Content = "Simpan Profil", Margin = new Thickness(0, 8, 0, 0), HorizontalAlignment = HorizontalAlignment.Left, MinWidth = 180 };
        if (Application.Current?.TryFindResource("PrimaryButton") is Style ps) btn.Style = ps;
        btn.Click += async (_, _) =>
        {
            if (_status == "taken") { err.Text = "Username sudah dipakai orang lain"; return; }
            btn.IsEnabled = false;
            try
            {
                using var r = await ApiClient.Instance.PatchJsonAsync("/api/users/me",
                    new { name = name.Text, username = uname.Text });
                if (r.IsSuccessStatusCode)
                {
                    await RefreshCachedUserAsync();
                    try
                    {
                        var root = JsonDocument.Parse(AppConfig.Instance.GetCachedUser() ?? "{}").RootElement;
                        _uname0 = root.TryGetProperty("username", out var un) && un.ValueKind != JsonValueKind.Null ? un.GetString() ?? "" : "";
                    }
                    catch { }
                    err.Text = "";
                    _page.Notify("Profil diperbarui");
                }
                else err.Text = await ApiClient.Instance.TryErrAsync(r, "Gagal simpan") ?? "Gagal";
            }
            catch { err.Text = "Butuh online — tidak ada perubahan"; }
            finally { btn.IsEnabled = true; }
        };
        var body = new StackPanel
        {
            Children =
            {
                photoRow,
                M3Field.Label("NAMA"), name,
                M3Field.Label("USERNAME"), uname, unameStatus,
                M3Field.Label("EMAIL"), mail,
                btn, err,
            }
        };
        _page = new SubPage("Profil", "Nama, username, dan foto yang tampil ke panitia.", body, onBack);
        Content = _page;
    }

    private void ScheduleUsernameCheck(string current, TextBlock status)
    {
        _checkTimer?.Stop();
        var v = (current ?? "").Trim();
        if (v.Length < 3 || string.Equals(v, _uname0, StringComparison.OrdinalIgnoreCase))
        {
            _status = "idle";
            try { status.Text = ""; } catch { }
            return;
        }
        _checkTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(400) };
        _checkTimer.Tick += async (_, _) =>
        {
            _checkTimer?.Stop();
            _status = "checking";
            try
            {
                status.Text = "Memeriksa…";
                status.SetResourceReference(TextBlock.ForegroundProperty, "OnVariantBrush");
            }
            catch { }
            try
            {
                var doc = await ApiClient.Instance.GetAsync(
                    "/api/users/check?" + ApiClient.BuildQuery(new() { ["username"] = v }));
                var available = doc?.RootElement.TryGetProperty("available", out var av) == true && av.GetBoolean();
                _status = available ? "available" : "taken";
                status.Dispatcher.BeginInvoke(new Action(() =>
                {
                    status.Text = available ? "Username tersedia ✓" : "Username sudah dipakai orang lain";
                    status.SetResourceReference(TextBlock.ForegroundProperty,
                        available ? "PrimaryBrush" : "ErrorBrush");
                }));
            }
            catch { _status = "idle"; }
        };
        _checkTimer.Start();
    }

    private async Task UploadPhotoAsync(Button btn, Border circle, TextBlock initial)
    {
        var dlg = new OpenFileDialog
        {
            Filter = "Gambar (*.png;*.jpg;*.jpeg;*.webp)|*.png;*.jpg;*.jpeg;*.webp",
            Title = "Pilih foto profil",
        };
        if (dlg.ShowDialog() != true) return;
        try
        {
            var fi = new FileInfo(dlg.FileName);
            if (fi.Length > 20 * 1024 * 1024) { _page.Notify("Foto maksimal 20MB", true); return; }
            btn.IsEnabled = false;
            using var mp = new MultipartFormDataContent();
            await using var fs = File.OpenRead(dlg.FileName);
            var sc = new StreamContent(fs);
            mp.Add(sc, "file", fi.Name);
            using var r = await ApiClient.Instance.PostMultipartAsync("/api/upload", mp);
            var body = await r.Content.ReadAsStringAsync();
            if (!r.IsSuccessStatusCode)
            {
                string? msg = null;
                try
                {
                    using var dj = JsonDocument.Parse(body);
                    msg = dj.RootElement.TryGetProperty("message", out var m) ? m.GetString()
                        : dj.RootElement.TryGetProperty("error", out var e2) ? e2.GetString() : null;
                }
                catch { }
                _page.Notify(msg ?? "Gagal upload foto", true);
                return;
            }
            string? url = null;
            try
            {
                using var dj = JsonDocument.Parse(body);
                url = dj.RootElement.TryGetProperty("url", out var u) ? u.GetString() : null;
                if (url == null && dj.RootElement.TryGetProperty("data", out var d) && d.ValueKind == JsonValueKind.Object)
                    url = d.TryGetProperty("url", out var u2) ? u2.GetString() : null;
            }
            catch { }
            if (string.IsNullOrWhiteSpace(url)) { _page.Notify("Server tidak mengembalikan URL foto", true); return; }
            using var p = await ApiClient.Instance.PatchJsonAsync("/api/users/me",
                new { profilePicture = url });
            if (!p.IsSuccessStatusCode)
            {
                _page.Notify(await ApiClient.Instance.TryErrAsync(p, "Gagal simpan") ?? "Gagal", true);
                return;
            }
            await RefreshCachedUserAsync();
            circle.Child = initial;
            await SubPhotos.FillCircleAsync(circle, initial, url);
            _page.Notify("Foto profil diperbarui");
        }
        catch { _page.Notify("Gagal upload foto", true); }
        finally { btn.IsEnabled = true; }
    }

    private static async Task RefreshCachedUserAsync()
    {
        try
        {
            var doc = await ApiClient.Instance.GetAsync("/api/users/me");
            if (doc != null) AppConfig.Instance.SaveUser(doc.RootElement.GetRawText());
        }
        catch { }
    }
}

public sealed class SecurityView : UserControl
{
    private readonly SubPage _page;
    private DataGrid? _devGrid;
    private TextBlock? _devInfo;

    public sealed class DeviceRow
    {
        public string Id { get; set; } = "";
        public string Nama { get; set; } = "";
        public string Platform { get; set; } = "";
        public string Terakhir { get; set; } = "";
    }

    public SecurityView(Action? onBack = null)
    {
        var cur = new PasswordBox { Margin = new Thickness(0, 0, 0, 8) };
        var nw = new PasswordBox { Margin = new Thickness(0, 0, 0, 8) };
        var cf = new PasswordBox { Margin = new Thickness(0, 0, 0, 8) };
        // Toggle lihat-sandi cermin Flutter (ganti PasswordBox reveal bawaan).
        var curShow = new TextBox { Margin = new Thickness(0, 0, 0, 8), Visibility = Visibility.Collapsed };
        var nwShow = new TextBox { Margin = new Thickness(0, 0, 0, 8), Visibility = Visibility.Collapsed };
        var cfShow = new TextBox { Margin = new Thickness(0, 0, 0, 8), Visibility = Visibility.Collapsed };
        var show = new CheckBox { Content = "Tampilkan sandi", Margin = new Thickness(0, 0, 0, 8) };
        show.Checked += (_, _) =>
        {
            curShow.Text = cur.Password; nwShow.Text = nw.Password; cfShow.Text = cf.Password;
            cur.Visibility = Visibility.Collapsed; nw.Visibility = Visibility.Collapsed; cf.Visibility = Visibility.Collapsed;
            curShow.Visibility = Visibility.Visible; nwShow.Visibility = Visibility.Visible; cfShow.Visibility = Visibility.Visible;
        };
        show.Unchecked += (_, _) =>
        {
            cur.Password = curShow.Text; nw.Password = nwShow.Text; cf.Password = cfShow.Text;
            cur.Visibility = Visibility.Visible; nw.Visibility = Visibility.Visible; cf.Visibility = Visibility.Visible;
            curShow.Visibility = Visibility.Collapsed; nwShow.Visibility = Visibility.Collapsed; cfShow.Visibility = Visibility.Collapsed;
        };
        var err = new TextBlock { TextWrapping = TextWrapping.Wrap };
        err.SetResourceReference(TextBlock.ForegroundProperty, "ErrorBrush");
        var btn = new Button { Content = "Ganti Password", Margin = new Thickness(0, 8, 0, 0), HorizontalAlignment = HorizontalAlignment.Left, MinWidth = 180 };
        if (Application.Current?.TryFindResource("PrimaryButton") is Style ps) btn.Style = ps;
        btn.Click += async (_, _) =>
        {
            var curPw = cur.Visibility == Visibility.Visible ? cur.Password : curShow.Text;
            var newPw = nw.Visibility == Visibility.Visible ? nw.Password : nwShow.Text;
            var cfPw = cf.Visibility == Visibility.Visible ? cf.Password : cfShow.Text;
            if (newPw.Length < 6) { err.Text = "Password baru min 6"; return; }
            if (newPw != cfPw) { err.Text = "Konfirmasi tidak sama"; return; }
            btn.IsEnabled = false;
            try
            {
                using var r = await ApiClient.Instance.PatchJsonAsync("/api/users/me",
                    new { currentPassword = curPw, newPassword = newPw });
                err.Text = r.IsSuccessStatusCode
                    ? "Password diganti"
                    : await ApiClient.Instance.TryErrAsync(r, "Gagal ganti") ?? "Gagal";
            }
            catch { err.Text = "Butuh online — tidak ada perubahan"; }
            finally { btn.IsEnabled = true; }
        };
        var grid = new DataGrid
        {
            AutoGenerateColumns = false, IsReadOnly = true,
            HeadersVisibility = DataGridHeadersVisibility.Column,
            MaxHeight = 220, Margin = new Thickness(0, 0, 0, 4),
        };
        grid.Columns.Add(new DataGridTextColumn { Header = "Perangkat", Binding = new System.Windows.Data.Binding("Nama"), Width = new DataGridLength(1, DataGridLengthUnitType.Star) });
        grid.Columns.Add(new DataGridTextColumn { Header = "Platform", Binding = new System.Windows.Data.Binding("Platform"), Width = 110 });
        grid.Columns.Add(new DataGridTextColumn { Header = "Terakhir", Binding = new System.Windows.Data.Binding("Terakhir"), Width = 110 });
        var cabutCol = new DataGridTemplateColumn { Header = "Aksi", Width = 90 };
        var f = new FrameworkElementFactory(typeof(Button));
        f.SetValue(Button.ContentProperty, "Cabut");
        f.SetValue(Button.ToolTipProperty, "Cabut perangkat");
        f.SetValue(FrameworkElement.MarginProperty, new Thickness(0));
        f.AddHandler(Button.ClickEvent, new RoutedEventHandler(OnRevokeDevice));
        cabutCol.CellTemplate = new DataTemplate { VisualTree = f };
        grid.Columns.Add(cabutCol);
        var devInfo = new TextBlock { FontSize = 12, TextWrapping = TextWrapping.Wrap };
        devInfo.SetResourceReference(TextBlock.ForegroundProperty, "OnVariantBrush");
        var body = new StackPanel
        {
            Children =
            {
                M3Field.Label("PASSWORD LAMA"), cur, curShow,
                M3Field.Label("PASSWORD BARU (MIN 6)"), nw, nwShow,
                M3Field.Label("KONFIRMASI BARU"), cf, cfShow,
                show, btn, err,
                M3Field.Label("PERANGKAT TERTAUT"),
                grid, devInfo,
            }
        };
        _page = new SubPage("Keamanan", "Password dan sesi perangkat tertaut.", body, onBack);
        Content = _page;
        _devGrid = grid;
        _devInfo = devInfo;
        Loaded += async (_, _) => await LoadDevicesAsync();
    }

    private async Task LoadDevicesAsync()
    {
        var grid = _devGrid;
        var info = _devInfo;
        if (grid == null) return;
        try { if (info != null) info.Text = "Memuat…"; } catch { }
        try
        {
            var doc = await ApiClient.Instance.GetAsync("/api/auth/device/list");
            var arr = doc?.RootElement.TryGetProperty("devices", out var d) == true && d.ValueKind == JsonValueKind.Array
                ? d.EnumerateArray().ToList() : new List<JsonElement>();
            grid.ItemsSource = arr.Select(x => new DeviceRow
            {
                Id = x.TryGetProperty("id", out var id) ? id.GetString() ?? "" : "",
                Nama = (x.TryGetProperty("deviceName", out var dn) ? dn.GetString() : null)
                    is string nm && !string.IsNullOrWhiteSpace(nm) ? nm
                    : ((x.TryGetProperty("current", out var cu) && cu.GetBoolean()) ? "Perangkat ini" : "Perangkat")
                    + ((x.TryGetProperty("current", out var cu2) && cu2.GetBoolean()) ? " (ini)" : ""),
                Platform = x.TryGetProperty("platform", out var pf) ? pf.GetString() ?? "—" : "—",
                Terakhir = x.TryGetProperty("lastUsedAt", out var lu) && lu.ValueKind == JsonValueKind.String &&
                    DateTime.TryParse(lu.GetString(), out var dt) ? dt.ToLocalTime().ToString("dd/MM HH:mm") : "—",
            }).ToList();
            try { info.Text = arr.Count == 0 ? "Tidak ada perangkat tertaut." : $"{arr.Count} perangkat tertaut."; } catch { }
        }
        catch { try { info.Text = "Perangkat butuh online."; } catch { } }
    }

    private async void OnRevokeDevice(object sender, RoutedEventArgs e)
    {
        DeviceRow? row = null;
        try { row = ((FrameworkElement)sender).DataContext as DeviceRow; } catch { }
        if (row == null || string.IsNullOrEmpty(row.Id)) return;
        var btn = sender as Button;
        if (btn != null) btn.IsEnabled = false;
        try
        {
            using var r = await ApiClient.Instance.PostJsonAsync("/api/auth/device/revoke",
                new { id = row.Id });
            if (r.IsSuccessStatusCode)
            {
                _page.Notify("Perangkat dihapus — sesi di perangkat itu ikut keluar");
                await LoadDevicesAsync();
            }
            else _page.Notify(await ApiClient.Instance.TryErrAsync(r, "Gagal hapus perangkat") ?? "Gagal", true);
        }
        catch { _page.Notify("Gagal hapus perangkat", true); }
        finally { if (btn != null) btn.IsEnabled = true; }
    }
}

// PIN layar kunci inline cermin Flutter pin_lock_screen (Task 8).
// Reuse: AuthStore (simpan/verifikasi, dipakai PinFlow) + grace AppConfig.
public sealed class PinSubView : UserControl
{
    private readonly SubPage _page;
    private readonly string _email;

    public PinSubView(string email, Action? onBack = null)
    {
        _email = email;
        var has = false;
        try { has = AuthStore.HasPin(); } catch { }
        var status = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 8) };
        status.Text = has
            ? "PIN aktif — diperlukan saat membuka aplikasi di luar jeda kunci."
            : "Belum ada PIN — buat 6 digit agar aplikasi terkunci saat dibuka.";
        var old = new PasswordBox { Margin = new Thickness(0, 0, 0, 8) };
        var nw1 = new PasswordBox { Margin = new Thickness(0, 0, 0, 8), MaxLength = 6 };
        var nw2 = new PasswordBox { Margin = new Thickness(0, 0, 0, 8), MaxLength = 6 };
        var err = new TextBlock { TextWrapping = TextWrapping.Wrap };
        err.SetResourceReference(TextBlock.ForegroundProperty, "ErrorBrush");
        var btn = new Button
        {
            Content = has ? "Ubah PIN" : "Buat PIN",
            Margin = new Thickness(0, 8, 0, 0),
            HorizontalAlignment = HorizontalAlignment.Left, MinWidth = 180,
        };
        if (Application.Current?.TryFindResource("PrimaryButton") is Style ps) btn.Style = ps;
        btn.Click += async (_, _) =>
        {
            if (has)
            {
                if (!AuthStore.VerifyPin(_email, old.Password)) { err.Text = "PIN lama salah"; return; }
            }
            if (nw1.Password.Length != 6 || !nw1.Password.All(char.IsDigit)) { err.Text = "PIN harus 6 digit angka"; return; }
            if (nw1.Password != nw2.Password) { err.Text = "Ulangi PIN tidak sama"; return; }
            btn.IsEnabled = false;
            try
            {
                AuthStore.SetPin(_email, nw1.Password);
                try { await ApiClient.Instance.PostJsonAsync("/api/users/pin", new { pin = nw1.Password }); }
                catch { /* offline: PIN lokal tetap sah */ }
                AppConfig.Instance.MarkUnlocked();
                err.Text = "";
                _page.Notify(has ? "PIN diubah" : "PIN dibuat");
            }
            catch { err.Text = "Gagal simpan PIN"; }
            finally { btn.IsEnabled = true; }
        };
        var grace = new ComboBox { Margin = new Thickness(0, 0, 0, 4), MinWidth = 200, HorizontalAlignment = HorizontalAlignment.Left };
        var graceOpts = new (string label, int minutes)[]
        {
            ("5 menit", 5), ("15 menit", 15), ("30 menit", 30), ("Tidak pernah", 525600),
        };
        foreach (var (label, _) in graceOpts) grace.Items.Add(label);
        try
        {
            var cur = AppConfig.Instance.GetPinGraceMin();
            var idx = Array.FindIndex(graceOpts, o => o.minutes == cur);
            grace.SelectedIndex = idx >= 0 ? idx : 0;
        }
        catch { grace.SelectedIndex = 0; }
        grace.SelectionChanged += (_, _) =>
        {
            try
            {
                if (grace.SelectedIndex >= 0 && grace.SelectedIndex < graceOpts.Length)
                {
                    AppConfig.Instance.SetPinGraceMin(graceOpts[grace.SelectedIndex].minutes);
                    _page.Notify($"Jeda kunci: {graceOpts[grace.SelectedIndex].label}");
                }
            }
            catch { }
        };
        var body = new StackPanel();
        body.Children.Add(status);
        if (has)
        {
            body.Children.Add(M3Field.Label("PIN LAMA"));
            body.Children.Add(old);
        }
        body.Children.Add(M3Field.Label(has ? "PIN BARU (6 DIGIT)" : "PIN (6 DIGIT)"));
        body.Children.Add(nw1);
        body.Children.Add(M3Field.Label("ULANGI PIN"));
        body.Children.Add(nw2);
        body.Children.Add(btn);
        body.Children.Add(err);
        body.Children.Add(M3Field.Label("JEDA KUNCI OTOMATIS"));
        body.Children.Add(grace);
        var hint = new TextBlock
        {
            Text = "Aplikasi dikunci bila dibuka setelah jeda ini. “Tidak pernah” ≈ 365 hari.",
            FontSize = 12, TextWrapping = TextWrapping.Wrap,
        };
        hint.SetResourceReference(TextBlock.ForegroundProperty, "OnVariantBrush");
        body.Children.Add(hint);
        _page = new SubPage("PIN", "Kunci layar dan jeda penguncian otomatis.", body, onBack);
        Content = _page;
    }
}

public sealed class AboutView : UserControl
{
    private readonly SubPage _page;

    public AboutView(Action? onBack = null)
    {
        var info = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 8) };
        var server = new TextBlock { TextWrapping = TextWrapping.Wrap };
        server.SetResourceReference(TextBlock.ForegroundProperty, "OnVariantBrush");
        var urlBox = new TextBox { Margin = new Thickness(0, 0, 0, 8) };
        var urlErr = new TextBlock { TextWrapping = TextWrapping.Wrap };
        urlErr.SetResourceReference(TextBlock.ForegroundProperty, "ErrorBrush");
        var saveUrl = new Button { Content = "Simpan Server", HorizontalAlignment = HorizontalAlignment.Left, MinWidth = 180 };
        if (Application.Current?.TryFindResource("PrimaryButton") is Style ps) saveUrl.Style = ps;
        saveUrl.Click += async (_, _) =>
        {
            var raw = (urlBox.Text ?? "").Trim();
            if (!ApiClient.TryNormalizeBaseUrl(raw, out var normalized, out var err))
            {
                urlErr.Text = err ?? "URL tidak valid";
                return;
            }
            saveUrl.IsEnabled = false;
            try
            {
                AppConfig.Instance.SetBaseUrl(normalized);
                ApiClient.Instance.TryConfigure(normalized, out _);
                var ok = await ApiClient.Instance.HealthAsync();
                urlErr.Text = "";
                server.Text = $"Server aktif: {normalized}\nStatus: {(ok ? "Online ✓" : "Offline ✗")}";
                _page.Notify(ok ? "Server diganti dan online ✓" : "Server disimpan (offline ✗ — cek URL)");
            }
            catch { urlErr.Text = "Gagal simpan server"; }
            finally { saveUrl.IsEnabled = true; }
        };
        var btn = new Button { Content = "Keluar Akun", Margin = new Thickness(0, 12, 0, 0), HorizontalAlignment = HorizontalAlignment.Left, MinWidth = 180 };
        if (Application.Current?.TryFindResource("DangerButton") is Style ds) btn.Style = ds;
        btn.Click += async (_, _) =>
        {
            var r = MessageBox.Show(
                "Session + PIN di perangkat ini dihapus. Data antrean yang belum sync ikut terhapus.\n\nKeluar akun?",
                "Keluar akun?", MessageBoxButton.YesNo, MessageBoxImage.Warning);
            if (r != MessageBoxResult.Yes) return;
            await ApiClient.Instance.LogoutAsync();
            AuthStore.Logout();
            var w = Window.GetWindow(this);
            new LoginWindow().Show();
            w?.Close();
            // Tutup MainWindow bila masih terbuka.
            foreach (var win in Application.Current.Windows.OfType<MainWindow>())
                win.Close();
        };
        var body = new StackPanel
        {
            Children =
            {
                info,
                M3Field.Label("URL SERVER"),
                urlBox, urlErr, saveUrl,
                server, btn,
            }
        };
        _page = new SubPage("Tentang", "Versi aplikasi dan server.", body, onBack);
        Content = _page;
        Loaded += async (_, _) =>
        {
            var baseUrl = AppConfig.Instance.GetBaseUrl();
            var ok = await ApiClient.Instance.HealthAsync();
            var ver = "1.x";
            try { ver = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? ver; }
            catch { }
            info.Text = $"Hajat Manager (Windows, C#) v{ver}";
            try { urlBox.Text = baseUrl; } catch { }
            server.Text = $"Server aktif: {baseUrl}\nStatus: {(ok ? "Online ✓" : "Offline ✗")}";
        };
    }
}
