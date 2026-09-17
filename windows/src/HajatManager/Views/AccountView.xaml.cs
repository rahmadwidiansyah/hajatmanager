using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using HajatManager.Api;
using HajatManager.Services;

namespace HajatManager.Views;

public partial class AccountView : UserControl
{
    public AccountView()
    {
        InitializeComponent();
        Loaded += async (_, _) => await LoadAsync();
    }

    private async Task LoadAsync()
    {
        try
        {
            var u = AppConfig.Instance.GetCachedUser() ?? "{}";
            SetHeader(JsonDocument.Parse(u).RootElement);
        }
        catch { }
        try
        {
            var doc = await ApiClient.Instance.GetAsync("/api/users/me");
            if (doc != null)
            {
                AppConfig.Instance.SaveUser(doc.RootElement.GetRawText());
                SetHeader(doc.RootElement);
            }
        }
        catch { }
    }

    private void SetHeader(JsonElement u)
    {
        NameText.Text = u.TryGetProperty("name", out var n) ? n.GetString() ?? "…" : "…";
        EmailText.Text = u.TryGetProperty("email", out var e) ? e.GetString() ?? "" : "";
        // Fase A: tandai pilihan tema tersimpan (tanpa memicu Checked).
        try
        {
            var cur = ThemeManager.Current;
            ThemeLight.IsChecked = cur == ThemeManager.Light;
            ThemeDark.IsChecked = cur == ThemeManager.Dark;
            ThemeSystem.IsChecked = cur != ThemeManager.Light && cur != ThemeManager.Dark;
        }
        catch { }
    }

    // Fase A: ganti tema instan, tersimpan untuk startup berikutnya.
    private void OnThemeChecked(object s, RoutedEventArgs e)
    {
        try
        {
            // Abaikan event inisialisasi (SetHeader menandai radio tersimpan).
            if (s is RadioButton rb && rb.Tag is string tag && rb.IsChecked == true
                && tag != ThemeManager.Current)
                ThemeManager.Apply(tag);
        }
        catch (Exception ex)
        {
            AppLogger.LogException("Ganti tema gagal", ex);
        }
    }

    private void GoProfile(object s, RoutedEventArgs e) => SubHost.Content = new ProfileView();
    private void GoSecurity(object s, RoutedEventArgs e) => SubHost.Content = new SecurityView();
    private void GoPin(object s, RoutedEventArgs e)
    {
        var email = "";
        try
        {
            email = JsonDocument.Parse(AppConfig.Instance.GetCachedUser() ?? "{}")
                .RootElement.GetProperty("email").GetString() ?? "";
        }
        catch { }
        new PinSetupWindow(email).ShowDialog();
    }
    private void GoAbout(object s, RoutedEventArgs e) => SubHost.Content = new AboutView();
}
