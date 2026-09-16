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
