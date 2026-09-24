using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using HajatManager.Api;
using HajatManager.Services;

namespace HajatManager.Views;

// Sub-halaman akun — cermin profile/security/about Flutter.
public sealed class ProfileView : UserControl
{
    public ProfileView()
    {
        var cached = AppConfig.Instance.GetCachedUser() ?? "{}";
        var email = "";
        var name0 = "";
        var uname0 = "";
        try
        {
            var root = JsonDocument.Parse(cached).RootElement;
            email = root.TryGetProperty("email", out var em) ? em.GetString() ?? "" : "";
            name0 = root.TryGetProperty("name", out var nn) ? nn.GetString() ?? "" : "";
            uname0 = root.TryGetProperty("username", out var un) && un.ValueKind != JsonValueKind.Null ? un.GetString() ?? "" : "";
        }
        catch { }
        var name = new TextBox { Text = name0, Margin = new Thickness(0, 0, 0, 8) };
        var uname = new TextBox { Text = uname0, Margin = new Thickness(0, 0, 0, 8) };
        var mail = new TextBox { Text = email, Margin = new Thickness(0, 0, 0, 8) };
        var err = new TextBlock { TextWrapping = TextWrapping.Wrap };
        err.SetResourceReference(TextBlock.ForegroundProperty, "ErrorBrush");
        var btn = new Button { Content = "Simpan Profil", Margin = new Thickness(0, 8, 0, 0), HorizontalAlignment = HorizontalAlignment.Left, MinWidth = 180 };
        if (Application.Current?.TryFindResource("PrimaryButton") is Style ps) btn.Style = ps;
        btn.Click += async (_, _) =>
        {
            btn.IsEnabled = false;
            try
            {
                using var r = await ApiClient.Instance.PatchJsonAsync("/api/users/me",
                    new { name = name.Text, username = uname.Text, email = mail.Text });
                err.Text = r.IsSuccessStatusCode
                    ? "Profil diperbarui"
                    : await ApiClient.Instance.TryErrAsync(r, "Gagal simpan") ?? "Gagal";
            }
            catch { err.Text = "Butuh online — tidak ada perubahan"; }
            finally { btn.IsEnabled = true; }
        };
        var card = new StackPanel
        {
            Children =
            {
                M3Field.Label("NAMA"), name,
                M3Field.Label("USERNAME"), uname,
                M3Field.Label("EMAIL"), mail,
                btn, err,
            }
        };
        Content = M3Field.Card(card);
    }
}

public sealed class SecurityView : UserControl
{
    public SecurityView()
    {
        var cur = new PasswordBox { Margin = new Thickness(0, 0, 0, 8) };
        var nw = new PasswordBox { Margin = new Thickness(0, 0, 0, 8) };
        // Toggle lihat-sandi cermin Flutter (ganti PasswordBox reveal bawaan).
        var curShow = new TextBox { Margin = new Thickness(0, 0, 0, 8), Visibility = Visibility.Collapsed };
        var nwShow = new TextBox { Margin = new Thickness(0, 0, 0, 8), Visibility = Visibility.Collapsed };
        var show = new CheckBox { Content = "Tampilkan sandi", Margin = new Thickness(0, 0, 0, 8) };
        show.Checked += (_, _) =>
        {
            curShow.Text = cur.Password; nwShow.Text = nw.Password;
            cur.Visibility = Visibility.Collapsed; nw.Visibility = Visibility.Collapsed;
            curShow.Visibility = Visibility.Visible; nwShow.Visibility = Visibility.Visible;
        };
        show.Unchecked += (_, _) =>
        {
            cur.Password = curShow.Text; nw.Password = nwShow.Text;
            cur.Visibility = Visibility.Visible; nw.Visibility = Visibility.Visible;
            curShow.Visibility = Visibility.Collapsed; nwShow.Visibility = Visibility.Collapsed;
        };
        var err = new TextBlock { TextWrapping = TextWrapping.Wrap };
        err.SetResourceReference(TextBlock.ForegroundProperty, "ErrorBrush");
        var btn = new Button { Content = "Ganti Password", Margin = new Thickness(0, 8, 0, 0), HorizontalAlignment = HorizontalAlignment.Left, MinWidth = 180 };
        if (Application.Current?.TryFindResource("PrimaryButton") is Style ps) btn.Style = ps;
        btn.Click += async (_, _) =>
        {
            var curPw = cur.Visibility == Visibility.Visible ? cur.Password : curShow.Text;
            var newPw = nw.Visibility == Visibility.Visible ? nw.Password : nwShow.Text;
            if (newPw.Length < 6) { err.Text = "Password baru min 6"; return; }
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
        var card = new StackPanel
        {
            Children =
            {
                M3Field.Label("PASSWORD LAMA"), cur, curShow,
                M3Field.Label("PASSWORD BARU (MIN 6)"), nw, nwShow,
                show, btn, err,
            }
        };
        Content = M3Field.Card(card);
    }
}

public sealed class AboutView : UserControl
{
    public AboutView()
    {
        var info = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 12) };
        var server = new TextBlock { TextWrapping = TextWrapping.Wrap };
        server.SetResourceReference(TextBlock.ForegroundProperty, "OnVariantBrush");
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
        var card = new StackPanel { Children = { info, server, btn } };
        Content = M3Field.Card(card);
        Loaded += async (_, _) =>
        {
            var baseUrl = AppConfig.Instance.GetBaseUrl();
            var ok = await ApiClient.Instance.HealthAsync();
            var ver = "1.x";
            try { ver = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? ver; }
            catch { }
            info.Text = $"Hajat Manager (Windows, C#) v{ver}";
            server.Text = $"Server aktif: {baseUrl}\nStatus: {(ok ? "Online ✓" : "Offline ✗")}\n\nGanti server dari layar Login (kolom Server + Tes).";
        };
    }
}
