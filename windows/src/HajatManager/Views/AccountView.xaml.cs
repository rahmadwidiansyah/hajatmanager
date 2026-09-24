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
        // Segmented Terang/Gelap/Sistem cermin Flutter (ganti radio).
        try
        {
            var cur = ThemeManager.Current;
            var seg = M3Segmented.Build(
                new List<(string, string?)>
                {
                    ("Terang", null),
                    ("Gelap", null),
                    ("Sistem", null),
                },
                cur == ThemeManager.Dark ? 1 : cur == ThemeManager.Light ? 0 : 2,
                idx =>
                {
                    var tag = idx == 1 ? ThemeManager.Dark : idx == 0 ? ThemeManager.Light : ThemeManager.System;
                    if (tag != ThemeManager.Current)
                    {
                        try { ThemeManager.Apply(tag); } catch (Exception ex) { AppLogger.LogException("Ganti tema gagal", ex); }
                    }
                });
            ThemeSegHost.Content = seg;
        }
        catch { }
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
        // Avatar inisial cermin Flutter CircleAvatar.
        try
        {
            var nm = NameText.Text.Trim();
            AvatarText.Text = nm.Length > 0 ? nm[..1].ToUpperInvariant() : "?";
        }
        catch { }
    }

    // Tile aktif ditandai border Primary (ganti chip aktif).
    private void MarkActive(Border active)
    {
        foreach (var b in new Border[] { TileProfil, TileKeamanan, TilePin, TileTentang })
        {
            try
            {
                if (ReferenceEquals(b, active))
                    b.SetResourceReference(Border.BorderBrushProperty, "PrimaryBrush");
                else
                    b.SetResourceReference(Border.BorderBrushProperty, "OutlineBrush");
                b.BorderThickness = new Thickness(ReferenceEquals(b, active) ? 1.5 : 1);
            }
            catch { }
        }
    }

    private void GoProfile(object s, System.Windows.Input.MouseButtonEventArgs e) { SubHost.Content = new ProfileView(); MarkActive(TileProfil); }
    private void GoSecurity(object s, System.Windows.Input.MouseButtonEventArgs e) { SubHost.Content = new SecurityView(); MarkActive(TileKeamanan); }
    private void GoPin(object s, System.Windows.Input.MouseButtonEventArgs e)
    {
        var email = "";
        try
        {
            email = JsonDocument.Parse(AppConfig.Instance.GetCachedUser() ?? "{}")
                .RootElement.GetProperty("email").GetString() ?? "";
        }
        catch { }
        new PinSetupWindow(email).ShowDialog();
        MarkActive(TilePin);
    }
    private void GoAbout(object s, System.Windows.Input.MouseButtonEventArgs e) { SubHost.Content = new AboutView(); MarkActive(TileTentang); }

    private void OnTileKey(object s, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key != System.Windows.Input.Key.Enter) return;
        try
        {
            if (ReferenceEquals(s, TileProfil)) { SubHost.Content = new ProfileView(); MarkActive(TileProfil); }
            else if (ReferenceEquals(s, TileKeamanan)) { SubHost.Content = new SecurityView(); MarkActive(TileKeamanan); }
            else if (ReferenceEquals(s, TilePin)) GoPin(s, new System.Windows.Input.MouseButtonEventArgs(System.Windows.Input.Mouse.PrimaryDevice, 0, System.Windows.Input.MouseButton.Left));
            else if (ReferenceEquals(s, TileTentang)) { SubHost.Content = new AboutView(); MarkActive(TileTentang); }
            e.Handled = true;
        }
        catch { }
    }
}
