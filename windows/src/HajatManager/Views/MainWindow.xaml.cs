using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using HajatManager.Api;
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
            var ok = await SyncEngine.Instance.CheckNowAsync();
            StatusText.Text = ok ? "Online ✓" : "Offline ✗";
        }
        catch (Exception ex)
        {
            AppLogger.LogException("RefreshStatus gagal", ex);
            try { StatusText.Text = "Offline ✗"; } catch { }
        }
    }

    // Rail M3: selected ikut konten (cermin mobile NavigationRail).
    private void GoEvents(object? s, RoutedEventArgs e)
    {
        if (Host == null) return; // guard: dipanggil sebelum InitializeComponent selesai
        Host.Content = new EventsView();
        try { if (NavRail != null && AcaraItem != null) NavRail.SelectedItem = AcaraItem; } catch { }
    }

    private void GoAccount(object? s, RoutedEventArgs e)
    {
        if (Host == null) return;
        Host.Content = new AccountView();
        try { if (NavRail != null && AkunItem != null) NavRail.SelectedItem = AkunItem; } catch { }
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
        var btn = s as System.Windows.Controls.Button;
        if (item != null) item.IsEnabled = false;
        if (btn != null) btn.IsEnabled = false;
        try
        {
            StatusText.Text = "Sync…";
            await SyncEngine.Instance.SyncInBackgroundAsync(null);
            var events = await Data.LocalDb.Instance.GetEventsAsync();
            int pending = 0;
            foreach (var ev in events)
                pending += await Data.LocalDb.Instance.OutboxCountAsync(ev.Id);
            StatusText.Text = pending == 0 ? "Tersinkron ✓" : $"Antre: {pending}";
            if (Host.Content is EventsView ev2) await ev2.ReloadAsync();
        }
        catch (Exception ex)
        {
            AppLogger.LogException("SyncAll gagal", ex);
            try { StatusText.Text = "Sync gagal ✗"; } catch { }
        }
        finally
        {
            _syncingAll = false;
            if (item != null) item.IsEnabled = true;
            if (btn != null) btn.IsEnabled = true;
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
}
