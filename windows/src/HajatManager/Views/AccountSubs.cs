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
        var email = "";
        try
        {
            email = JsonDocument.Parse(AppConfig.Instance.GetCachedUser() ?? "{}")
                .RootElement.GetProperty("email").GetString() ?? "";
        }
        catch { }
        var name = new TextBox { Margin = new Thickness(0, 0, 0, 8) };
        var uname = new TextBox { Margin = new Thickness(0, 0, 0, 8) };
        var mail = new TextBox { Text = email, Margin = new Thickness(0, 0, 0, 8) };
        var err = new TextBlock { Foreground = System.Windows.Media.Brushes.Red };
        var btn = new Button { Content = "Simpan Profil", Margin = new Thickness(0, 8, 0, 0) };
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
        Content = new StackPanel
        {
            Children =
            {
                new TextBlock { Text = "Nama" }, name,
                new TextBlock { Text = "Username" }, uname,
                new TextBlock { Text = "Email" }, mail,
                btn, err,
            }
        };
    }
}

public sealed class SecurityView : UserControl
{
    public SecurityView()
    {
        var cur = new PasswordBox { Margin = new Thickness(0, 0, 0, 8) };
        var nw = new PasswordBox { Margin = new Thickness(0, 0, 0, 8) };
        var err = new TextBlock { Foreground = System.Windows.Media.Brushes.Red };
        var btn = new Button { Content = "Ganti Password", Margin = new Thickness(0, 8, 0, 0) };
        btn.Click += async (_, _) =>
        {
            if (nw.Password.Length < 6) { err.Text = "Password baru min 6"; return; }
            btn.IsEnabled = false;
            try
            {
                using var r = await ApiClient.Instance.PatchJsonAsync("/api/users/me",
                    new { currentPassword = cur.Password, newPassword = nw.Password });
                err.Text = r.IsSuccessStatusCode
                    ? "Password diganti"
                    : await ApiClient.Instance.TryErrAsync(r, "Gagal ganti") ?? "Gagal";
            }
            catch { err.Text = "Butuh online — tidak ada perubahan"; }
            finally { btn.IsEnabled = true; }
        };
        Content = new StackPanel
        {
            Children =
            {
                new TextBlock { Text = "Password lama" }, cur,
                new TextBlock { Text = "Password baru (min 6)" }, nw,
                btn, err,
            }
        };
    }
}

public sealed class AboutView : UserControl
{
    public AboutView()
    {
        var info = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 12) };
        var btn = new Button { Content = "Keluar Akun" };
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
        Content = new StackPanel { Children = { info, btn } };
        Loaded += async (_, _) =>
        {
            var baseUrl = AppConfig.Instance.GetBaseUrl();
            var ok = await ApiClient.Instance.HealthAsync();
            info.Text = $"Hajat Manager (Windows, C#)\nServer aktif: {baseUrl}\nStatus: {(ok ? "Online ✓" : "Offline ✗")}\n\nGanti server dari layar Login (kolom Server + Tes).";
        };
    }
}
