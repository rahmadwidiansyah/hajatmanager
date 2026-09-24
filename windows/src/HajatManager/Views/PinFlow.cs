using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using HajatManager.Api;
using HajatManager.Services;

namespace HajatManager.Views;

// Alur PIN pasca-login — cermin pin_screen.dart resolveNextAfterLogin().
public static class PinFlow
{
    public static async Task<Window> ResolveNextAsync()
    {
        var userJson = AppConfig.Instance.GetCachedUser() ?? "{}";
        var email = "";
        try { email = JsonDocument.Parse(userJson).RootElement.GetProperty("email").GetString() ?? ""; }
        catch { }
        if (AuthStore.HasPin()) return new MainWindow();
        var serverHas = await ServerHasPinAsync();
        if (serverHas == true) return new PinRestoreWindow(email);
        if (serverHas == false) return new PinSetupWindow(email, forceNew: true);
        return AuthStore.HasPin() ? (Window)new MainWindow() : new PinSetupWindow(email, forceNew: true);
    }

    public static async Task<bool?> ServerHasPinAsync()
    {
        try
        {
            var doc = await ApiClient.Instance.GetAsync("/api/users/pin");
            if (doc == null) return null;
            return doc.RootElement.TryGetProperty("hasPin", out var h) && h.GetBoolean();
        }
        catch { return null; }
    }
}

/// Dialog input 6 digit (kunci buka) — cermin _PinLockScreenState Flutter:
/// ikon lock + auto-submit saat 6 digit.
public sealed class PinDialog : Window
{
    private readonly PasswordBox _box = new() { MaxLength = 6, Margin = new Thickness(0, 8, 0, 0) };
    private bool _auto;
    public string Pin => _box.Password;

    public PinDialog(string title, string hint)
    {
        Title = title;
        Width = 360; Height = 300;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        SetResourceReference(BackgroundProperty, "SurfaceBrush");
        var p = new StackPanel { Margin = new Thickness(24), HorizontalAlignment = HorizontalAlignment.Center };
        var iconText = new TextBlock
        {
            Text = "\uE72E",
            FontFamily = new System.Windows.Media.FontFamily("Segoe MDL2 Assets"),
            FontSize = 24,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        };
        iconText.SetResourceReference(TextBlock.ForegroundProperty, "OnPrimaryContainerBrush");
        var icon = new Border
        {
            Width = 56, Height = 56, CornerRadius = new CornerRadius(28),
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 12),
            Child = iconText,
        };
        icon.SetResourceReference(Border.BackgroundProperty, "PrimaryContainerBrush");
        p.Children.Add(icon);
        p.Children.Add(new TextBlock { Text = hint, TextWrapping = TextWrapping.Wrap, TextAlignment = TextAlignment.Center });
        p.Children.Add(_box);
        var help = new TextBlock { Text = "Wajib 6 digit angka.", Margin = new Thickness(0, 4, 0, 0) };
        help.SetResourceReference(TextBlock.ForegroundProperty, "OnVariantBrush");
        p.Children.Add(help);
        var ok = new Button { Content = "OK", Margin = new Thickness(0, 12, 0, 0) };
        ok.Click += (_, _) => { DialogResult = _box.Password.Length == 6; };
        p.Children.Add(ok);
        Content = p;
        M3Chrome.Attach(this, dialog: true);
        _box.PasswordChanged += (_, _) =>
        {
            if (_auto || _box.Password.Length != 6) return;
            _auto = true;
            try { DialogResult = true; } catch { _auto = false; }
        };
        _box.Focus();
    }
}

public sealed class PinSetupWindow : Window
{
    private readonly string _email;
    public PinSetupWindow(string email, bool forceNew = false)
    {
        _email = email;
        Title = "Buat PIN Offline";
        Width = 420; Height = 300;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        SetResourceReference(BackgroundProperty, "SurfaceBrush");
        var p = new StackPanel { Margin = new Thickness(24) };
        p.Children.Add(new TextBlock
        {
            Text = "PIN 6 digit — dipakai buka aplikasi tanpa internet.",
            TextWrapping = TextWrapping.Wrap
        });
        var b1 = new PasswordBox { MaxLength = 6, Margin = new Thickness(0, 12, 0, 0) };
        var b2 = new PasswordBox { MaxLength = 6, Margin = new Thickness(0, 8, 0, 0) };
        var help = new TextBlock { Text = "Wajib 6 digit angka.", Margin = new Thickness(0, 4, 0, 0) };
        help.SetResourceReference(TextBlock.ForegroundProperty, "OnVariantBrush");
        var err = new TextBlock { Foreground = Ui.ErrorBrush, Margin = new Thickness(0, 8, 0, 0) };
        var ok = new Button { Content = "Simpan PIN", Margin = new Thickness(0, 12, 0, 0) };
        ok.Click += async (_, _) =>
        {
            if (!ok.IsEnabled) return;
            if (b1.Password.Length != 6 || b1.Password != b2.Password ||
                !b1.Password.All(char.IsDigit))
            {
                err.Text = "PIN harus 6 digit angka dan sama.";
                return;
            }
            ok.IsEnabled = false;
            try
            {
                AuthStore.SetPin(_email, b1.Password);
                try
                {
                    await ApiClient.Instance.PostJsonAsync("/api/users/pin",
                        new { pin = b1.Password });
                }
                catch { /* offline: PIN lokal tetap sah */ }
                AppConfig.Instance.MarkUnlocked();
                new MainWindow().Show();
                Close();
            }
            finally { try { ok.IsEnabled = true; } catch { } }
        };
        p.Children.Add(new TextBlock { Text = "PIN baru", Margin = new Thickness(0, 8, 0, 0) });
        p.Children.Add(b1);
        p.Children.Add(new TextBlock { Text = "Ulangi PIN", Margin = new Thickness(0, 8, 0, 0) });
        p.Children.Add(b2);
        p.Children.Add(help);
        p.Children.Add(err);
        p.Children.Add(ok);
        Content = p;
        M3Chrome.Attach(this, dialog: true);
    }
}

public sealed class PinRestoreWindow : Window
{
    public PinRestoreWindow(string email)
    {
        Title = "Verifikasi PIN Lama";
        Width = 420; Height = 260;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        SetResourceReference(BackgroundProperty, "SurfaceBrush");
        var p = new StackPanel { Margin = new Thickness(24) };
        p.Children.Add(new TextBlock
        {
            Text = "PIN di perangkat ini terhapus, tapi server masih punya. Masukkan PIN lama.",
            TextWrapping = TextWrapping.Wrap
        });
        var b = new PasswordBox { MaxLength = 6, Margin = new Thickness(0, 12, 0, 0) };
        var err = new TextBlock { Foreground = Ui.ErrorBrush, Margin = new Thickness(0, 8, 0, 0) };
        var ok = new Button { Content = "Verifikasi", Margin = new Thickness(0, 12, 0, 0) };
        ok.Click += async (_, _) =>
        {
            if (!ok.IsEnabled) return;
            ok.IsEnabled = false;
            try
            {
                using var r = await ApiClient.Instance.PostJsonAsync(
                    "/api/users/pin/verify", new { pin = b.Password });
                if (!r.IsSuccessStatusCode) { err.Text = "PIN salah"; return; }
                AuthStore.SetPin(email, b.Password);
                AppConfig.Instance.MarkUnlocked();
                new MainWindow().Show();
                Close();
            }
            catch { err.Text = "Tidak ada koneksi ke server"; }
            finally { try { ok.IsEnabled = true; } catch { } }
        };
        var lupa = new Button
        {
            Content = "Lupa PIN? Buat baru",
            BorderThickness = new Thickness(0),
            Margin = new Thickness(0, 8, 0, 0)
        };
        if (TryFindResource("TextButton") is Style tbs) lupa.Style = tbs;
        lupa.Click += (_, _) => { new PinSetupWindow(email, forceNew: true).Show(); Close(); };
        p.Children.Add(b);
        p.Children.Add(err);
        p.Children.Add(ok);
        p.Children.Add(lupa);
        Content = p;
        M3Chrome.Attach(this, dialog: true);
    }
}
