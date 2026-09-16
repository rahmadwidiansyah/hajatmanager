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
        Loaded += async (_, _) =>
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
            _ = RefreshStatusAsync();
        };
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
        var ok = await SyncEngine.Instance.CheckNowAsync();
        StatusText.Text = ok ? "Online ✓" : "Offline ✗";
    }

    private void GoEvents(object? s, RoutedEventArgs e) => Host.Content = new EventsView();
    private void GoAccount(object? s, RoutedEventArgs e) => Host.Content = new AccountView();

    private async void OnSyncAll(object? s, RoutedEventArgs e)
    {
        StatusText.Text = "Sync…";
        // Flush semua event yang punya antrean (daftar dari DB lokal).
        var events = await Data.LocalDb.Instance.GetEventsAsync();
        int f = 0, c = 0;
        foreach (var ev in events)
        {
            var (fl, cf, _) = await SyncEngine.Instance.FlushAsync(ev.Id);
            f += fl; c += cf;
        }
        StatusText.Text = $"Sync: {f} terkirim, {c} konflik";
        if (Host.Content is EventsView ev2) await ev2.ReloadAsync();
    }

    private async void OnLogout(object? sender, RoutedEventArgs e)
    {
        var r = MessageBox.Show(this,
            "Session + PIN di perangkat ini dihapus. Data antrean yang belum sync ikut terhapus.\n\nKeluar akun?",
            "Keluar akun?", MessageBoxButton.YesNo, MessageBoxImage.Warning);
        if (r != MessageBoxResult.Yes) return;
        await ApiClient.Instance.LogoutAsync();
        AuthStore.Logout();
        new LoginWindow().Show();
        Close();
    }
}
