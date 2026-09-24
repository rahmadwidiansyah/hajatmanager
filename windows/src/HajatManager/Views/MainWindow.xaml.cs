using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using HajatManager.Api;
using HajatManager.Models;
using HajatManager.Services;

namespace HajatManager.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        M3Chrome.Attach(this);
        // Pasang SelectedIndex setelah InitializeComponent agar OnNavSelect tidak
        // dipicu saat XAML di-parse (Host & AcaraItem belum siap → NullReferenceException).
        NavRail.SelectedIndex = 0;
        Loaded += async (_, _) =>
        {
            try
            {
                // Kunci PIN bila ada dan di luar grace period.
                var email = UserEmail();
                if (AuthStore.HasPin() && !AppConfig.Instance.WithinGrace())
                {
                    var d = new PinDialog("Kunci Layar", "Masukkan PIN 6 digit.");
                    if (d.ShowDialog() != true || !AuthStore.VerifyPin(email, d.Pin))
                    {
                        new LoginWindow().Show();
                        Close();
                        return;
                    }
                    AppConfig.Instance.MarkUnlocked();
                }
                GoEvents(null, new RoutedEventArgs());
            }
            catch (Exception ex)
            {
                AppLogger.LogException("MainWindow.Load gagal", ex);
                try { GoEvents(null, new RoutedEventArgs()); } catch { }
            }
            try { LoadAvatar(); } catch { }
            try { UpdateThemeToggleLabel(); } catch { }
            _ = RefreshStatusAsync();
            SyncEngine.Instance.Changed += OnSyncChanged;
            System.Net.NetworkInformation.NetworkChange.NetworkAvailabilityChanged += OnNetChanged;
        };
        Closed += (_, _) =>
        {
            try { SyncEngine.Instance.Changed -= OnSyncChanged; } catch { }
            try { System.Net.NetworkInformation.NetworkChange.NetworkAvailabilityChanged -= OnNetChanged; } catch { }
        };
    }

    private void OnSyncChanged()
    {
        try { Dispatcher.InvokeAsync(async () => await RefreshStatusAsync()); } catch { }
    }

    private void OnNetChanged(object? s, System.Net.NetworkInformation.NetworkAvailabilityEventArgs e)
    {
        try { Dispatcher.InvokeAsync(async () => await RefreshStatusAsync()); } catch { }
    }

    private static string UserEmail()
    {
        try
        {
            var j = AppConfig.Instance.GetCachedUser() ?? "{}";
            return JsonDocument.Parse(j).RootElement.GetProperty("email").GetString() ?? "";
        }
        catch { return ""; }
    }

    private async Task RefreshStatusAsync()
    {
        try
        {
            var online = await SyncEngine.Instance.CheckNowAsync();
            var pending = 0;
            try
            {
                var events = await Data.LocalDb.Instance.GetEventsAsync();
                foreach (var ev in events)
                    pending += await Data.LocalDb.Instance.OutboxCountAsync(ev.Id);
            }
            catch { }
            UpdateSyncState(pending, online);
        }
        catch (Exception ex)
        {
            AppLogger.LogException("RefreshStatus gagal", ex);
            try { UpdateSyncState(0, false); } catch { }
        }
    }

    // Status chip + SyncBtn ikut state cermin TopBar.tsx / EventDetail UpdateSyncCloud:
    // online + bersih = Primary (hijau), online + pending = Warning (kuning),
    // offline = Error (merah). Badge tampil bila pending > 0.
    private void UpdateSyncState(int pending, bool online)
    {
        try
        {
            if (StatusText != null)
            {
                if (_syncingAll) StatusText.Text = "Sync…";
                else if (!online) StatusText.Text = pending > 0 ? $"Offline ✗ • Antre: {pending}" : "Offline ✗";
                else StatusText.Text = pending > 0 ? $"Antre: {pending}" : "Online ✓";
            }
            if (StatusChip != null)
            {
                if (_syncingAll || (online && pending > 0))
                    StatusChip.Background = BrushOf("WarningContainerBrush");
                else if (!online)
                    StatusChip.Background = BrushOf("ErrorContainerBrush");
                else
                    StatusChip.Background = BrushOf("PrimaryContainerBrush");
            }
            if (SyncBtn != null)
            {
                if (_syncingAll)
                {
                    SyncBtn.Background = BrushOf("SurfaceContainerBrush");
                    SyncBtn.Foreground = BrushOf("OnVariantBrush");
                    SyncBtn.ToolTip = "Sinkronisasi berjalan…";
                    SyncBtn.IsEnabled = false;
                }
                else
                {
                    SyncBtn.IsEnabled = true;
                    if (!online)
                    {
                        SyncBtn.Background = BrushOf("ErrorBrush");
                        SyncBtn.Foreground = BrushOf("OnErrorBrush");
                        SyncBtn.ToolTip = pending > 0
                            ? $"Offline — {pending} menunggu sync. Klik untuk coba lagi."
                            : "Offline — data tersimpan di perangkat. Klik untuk coba lagi.";
                    }
                    else if (pending > 0)
                    {
                        SyncBtn.Background = BrushOf("WarningBrush");
                        SyncBtn.Foreground = BrushOf("OnPrimaryBrush");
                        SyncBtn.ToolTip = $"{pending} data belum sync — klik untuk sync sekarang";
                    }
                    else
                    {
                        SyncBtn.Background = BrushOf("PrimaryBrush");
                        SyncBtn.Foreground = BrushOf("OnPrimaryBrush");
                        SyncBtn.ToolTip = "Sudah tersinkron — klik untuk refresh (Ctrl+R)";
                    }
                }
            }
            if (SyncBadgeBorder != null && SyncBadgeText != null)
            {
                if (pending > 0)
                {
                    SyncBadgeBorder.Visibility = Visibility.Visible;
                    SyncBadgeText.Text = pending > 9 ? "9+" : pending.ToString();
                }
                else SyncBadgeBorder.Visibility = Visibility.Collapsed;
            }
        }
        catch { }
    }

    private static Brush BrushOf(string key)
    {
        try
        {
            if (Application.Current?.TryFindResource(key) is Brush b) return b;
        }
        catch { }
        return Brushes.Gray;
    }

    // Avatar cermin DashboardHeader.tsx: inisial + nama dari user cache.
    private void LoadAvatar()
    {
        try
        {
            var j = AppConfig.Instance.GetCachedUser() ?? "{}";
            using var doc = JsonDocument.Parse(j);
            var r = doc.RootElement;
            var name = r.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
            var email = r.TryGetProperty("email", out var e) ? e.GetString() ?? "" : "";
            if (string.IsNullOrWhiteSpace(name) && !string.IsNullOrWhiteSpace(email))
                name = email;
            var initial = name.Trim().Length > 0 ? name.Trim()[..1].ToUpperInvariant() : "?";
            if (AvatarInitial != null) AvatarInitial.Text = initial;
            if (UserNameText != null) UserNameText.Text = name;
            if (PopupNameText != null) PopupNameText.Text = string.IsNullOrWhiteSpace(name) ? "Pengguna" : name;
            if (PopupEmailText != null) PopupEmailText.Text = email;
        }
        catch { }
    }

    private void OnAvatarMenu(object? sender, RoutedEventArgs e)
    {
        try
        {
            LoadAvatar();
            UpdateThemeToggleLabel();
            if (AvatarPopup != null)
            {
                AvatarPopup.PlacementTarget = AvatarBtn;
                AvatarPopup.IsOpen = true;
            }
        }
        catch { }
    }

    private void OnToggleTheme(object? sender, RoutedEventArgs e)
    {
        try
        {
            // AppBar hanya toggle Terang/Gelap (pilihan Sistem ada di halaman Akun).
            var next = ThemeManager.IsDarkEffective() ? ThemeManager.Light : ThemeManager.Dark;
            ThemeManager.Apply(next);
            UpdateThemeToggleLabel();
            try { if (AvatarPopup != null) AvatarPopup.IsOpen = false; } catch { }
        }
        catch (Exception ex)
        {
            AppLogger.LogException("Ganti tema gagal", ex);
        }
    }

    private void UpdateThemeToggleLabel()
    {
        try
        {
            if (ThemeToggleBtn != null)
                ThemeToggleBtn.Content = ThemeManager.IsDarkEffective() ? "☀ Mode Terang" : "🌙 Mode Gelap";
        }
        catch { }
    }

    // Rail M3: selected ikut konten (cermin mobile NavigationRail).
    // Public agar EventDetailView embed bisa kembali via mw.GoEvents (lihat Task 4).
    public void GoEvents(object? s, RoutedEventArgs e)
    {
        if (Host == null) return; // guard: dipanggil sebelum InitializeComponent selesai
        Host.Content = new EventsView();
        try { if (NavRail != null && AcaraItem != null) NavRail.SelectedItem = AcaraItem; } catch { }
    }

    public void GoAccount(object? s, RoutedEventArgs e)
    {
        if (Host == null) return;
        Host.Content = new AccountView();
        try { if (NavRail != null && AkunItem != null) NavRail.SelectedItem = AkunItem; } catch { }
    }

    // Hybrid open cermin web (konten kanan berubah, rail tetap highlight Acara).
    public void ShowEventDetail(EventModel ev)
    {
        if (Host == null) return;
        Host.Content = new EventDetailView(ev, this);
        try { if (NavRail != null && AcaraItem != null) NavRail.SelectedItem = AcaraItem; } catch { }
    }

    private void OnNavSelect(object s, SelectionChangedEventArgs e)
    {
        if (NavRail == null || Host == null) return;
        if (NavRail.SelectedItem == AkunItem) GoAccount(s, new RoutedEventArgs());
        else GoEvents(s, new RoutedEventArgs());
    }

    private bool _syncingAll;

    private async void OnSyncAll(object? s, RoutedEventArgs e)
    {
        if (_syncingAll) return;
        _syncingAll = true;
        var item = s as System.Windows.Controls.MenuItem;
        if (item != null) item.IsEnabled = false;
        try
        {
            UpdateSyncState(0, SyncEngine.Instance.Online);
            await SyncEngine.Instance.SyncInBackgroundAsync(null);
            var events = await Data.LocalDb.Instance.GetEventsAsync();
            int pending = 0;
            foreach (var ev in events)
                pending += await Data.LocalDb.Instance.OutboxCountAsync(ev.Id);
            UpdateSyncState(pending, SyncEngine.Instance.Online);
            if (Host.Content is EventsView ev2) await ev2.ReloadAsync();
        }
        catch (Exception ex)
        {
            AppLogger.LogException("SyncAll gagal", ex);
            try { UpdateSyncState(0, false); } catch { }
        }
        finally
        {
            _syncingAll = false;
            if (item != null) item.IsEnabled = true;
            try { await RefreshStatusAsync(); } catch { }
        }
    }

    private async void OnLogout(object? sender, RoutedEventArgs e)
    {
        try
        {
            var r = MessageBox.Show(this,
                "Session + PIN di perangkat ini dihapus. Data antrean yang belum sync ikut terhapus.\n\nKeluar akun?",
                "Keluar akun?", MessageBoxButton.YesNo, MessageBoxImage.Warning);
            if (r != MessageBoxResult.Yes) return;
            try { await ApiClient.Instance.LogoutAsync(); }
            catch (Exception ex) { AppLogger.Warn($"Logout server gagal (best-effort): {ex.Message}"); }
            AuthStore.Logout();
            new LoginWindow().Show();
            Close();
        }
        catch (Exception ex)
        {
            AppLogger.LogException("Logout gagal", ex);
        }
    }

    // Shortcut global cermin web/Task 9: Alt+1/Alt+2 navigasi, Ctrl+N buat acara,
    // Ctrl+R sync (bila bukan detail embed — detail menangani sendiri).
    protected override void OnPreviewKeyDown(KeyEventArgs e)
    {
        base.OnPreviewKeyDown(e);
        try
        {
            var alt = (Keyboard.Modifiers & ModifierKeys.Alt) != 0;
            var ctrl = (Keyboard.Modifiers & ModifierKeys.Control) != 0;
            if (alt && !ctrl)
            {
                if (e.Key == Key.D1 || e.Key == Key.NumPad1) { GoEvents(null, new RoutedEventArgs()); e.Handled = true; }
                else if (e.Key == Key.D2 || e.Key == Key.NumPad2) { GoAccount(null, new RoutedEventArgs()); e.Handled = true; }
            }
            else if (ctrl && !alt && e.Key == Key.N)
            {
                if (Host?.Content is EventsView ev)
                {
                    try { ev.CreateNew(); } catch { }
                    e.Handled = true;
                }
            }
            else if (ctrl && !alt && e.Key == Key.R)
            {
                if (Host?.Content is not EventDetailView)
                {
                    try { OnSyncAll(null, new RoutedEventArgs()); } catch { }
                    e.Handled = true;
                }
            }
        }
        catch { }
    }
}
