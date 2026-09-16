using System.Text.Json;
using System.Windows;
using HajatManager.Api;
using HajatManager.Services;

namespace HajatManager.Views;

// Login email + server+Tes — cermin login_screen.dart (tanpa Google di Windows).
public partial class LoginWindow : Window
{
    private bool _reg;

    public LoginWindow()
    {
        InitializeComponent();
        Loaded += async (_, _) => await LoadServerAsync();
    }

    private async Task LoadServerAsync()
    {
        ServerBox.Text = AppConfig.Instance.GetBaseUrl();
        await RefreshServerStatusAsync();
    }

    private async Task RefreshServerStatusAsync()
    {
        ApiClient.Instance.Configure(AppConfig.Instance.GetBaseUrl());
        var ok = await ApiClient.Instance.HealthAsync();
        ServerLabel.Text = ok ? "Server (Online ✓)" : "Server (Offline ✗)";
    }

    private async void OnTestServer(object sender, RoutedEventArgs e)
    {
        AppConfig.Instance.SetBaseUrl(ServerBox.Text);
        await RefreshServerStatusAsync();
        var ok = ServerLabel.Text.Contains("Online");
        MessageBox.Show(this,
            ok ? "Server tersambung ✓" : "Masih tak terjangkau — cek URL / koneksi internet",
            "Tes Server", MessageBoxButton.OK,
            ok ? MessageBoxImage.Information : MessageBoxImage.Warning);
    }

    private void OnToggleReg(object sender, RoutedEventArgs e)
    {
        _reg = !_reg;
        var v = _reg ? Visibility.Visible : Visibility.Collapsed;
        NameLabel.Visibility = v;
        NameBox.Visibility = v;
        SubmitBtn.Content = _reg ? "Daftar & Masuk" : "Masuk";
    }

    private void Fail(string msg)
    {
        ErrText.Text = msg;
        ErrText.Visibility = Visibility.Visible;
    }

    private async void OnSubmit(object sender, RoutedEventArgs e)
    {
        ErrText.Visibility = Visibility.Collapsed;
        var email = EmailBox.Text.Trim();
        var pass = PassBox.Password;
        if (!email.Contains('@') || pass.Length < 6)
        {
            Fail("Email valid + password min 6");
            return;
        }
        SubmitBtn.IsEnabled = false;
        try
        {
            if (_reg)
            {
                var name = string.IsNullOrWhiteSpace(NameBox.Text)
                    ? email.Split('@')[0] : NameBox.Text.Trim();
                var (rok, rerr) = await ApiClient.Instance.RegisterAsync(name, email, pass);
                if (!rok) { Fail(rerr ?? "Gagal daftar"); return; }
            }
            else
            {
                var (ok, err) = await ApiClient.Instance.LoginEmailAsync(email, pass);
                if (!ok) { Fail(err ?? "Gagal masuk"); return; }
            }

            var s = await ApiClient.Instance.SessionAsync();
            var userJson = s?.RootElement.GetProperty("user").GetRawText()
                ?? JsonSerializer.Serialize(new { email });
            AppConfig.Instance.SaveUser(userJson);

            // Alur PIN sama seperti APK: wajib PIN lokal → ke daftar acara.
            var next = await PinFlow.ResolveNextAsync();
            next.Show();
            Close();
        }
        finally { SubmitBtn.IsEnabled = true; }
    }
}
