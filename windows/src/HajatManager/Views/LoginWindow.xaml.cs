using System.Text.Json;
using System.Threading;
using System.Windows;
using HajatManager.Api;
using HajatManager.Services;

namespace HajatManager.Views;

// Login email + server+Tes + Google desktop via browser (Fase 4).
// Fase 2: alur register → login sekali (RegisterAsync tidak lagi login ganda).
public partial class LoginWindow : Window
{
    private bool _reg;
    private CancellationTokenSource? _googleCts;

    public LoginWindow()
    {
        InitializeComponent();
        M3Chrome.Attach(this);
        Loaded += async (_, _) =>
        {
            try { await LoadServerAsync(); }
            catch (Exception ex)
            {
                AppLogger.LogException("LoginWindow.Load gagal", ex);
                ServerLabel.Text = "Server (Offline ✗)";
            }
        };
        Closed += (_, _) =>
        {
            try { _googleCts?.Cancel(); } catch { }
        };
    }

    private async Task LoadServerAsync()
    {
        try
        {
            ServerBox.Text = AppConfig.Instance.GetBaseUrl();
            await RefreshServerStatusAsync();
            await RefreshGoogleVisibilityAsync();
            // Fase 3: token perangkat masih valid → lewati login (cermin _Gate Flutter).
            await TryAutoLoginAsync();
        }
        catch (Exception ex)
        {
            AppLogger.LogException("LoadServer gagal", ex);
            ServerLabel.Text = "Server (Offline ✗)";
        }
    }

    /// Fase 4: tampilkan tombol Google hanya bila server mengiklankan OAuth.
    private async Task RefreshGoogleVisibilityAsync()
    {
        try
        {
            var show = await ApiClient.Instance.GoogleAvailableAsync();
            GooglePanel.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
        }
        catch (Exception ex)
        {
            AppLogger.LogException("RefreshGoogle gagal", ex);
            GooglePanel.Visibility = Visibility.Collapsed;
        }
    }

    /// Auto-login bila DPAPI masih menyimpan token dan server mengakuinya.
    private async Task TryAutoLoginAsync()
    {
        try
        {
            if (!ApiClient.Instance.HasDeviceToken) return;
            var me = await ApiClient.Instance.DeviceMeAsync();
            if (me == null)
            {
                // Offline mode may open cached data, but never treats an
                // online token rejection as a valid session.
                var online = await SyncEngine.Instance.CheckNowAsync();
                if (!online && AppConfig.Instance.GetCachedUser() != null)
                {
                    AppLogger.Info("Auto-login offline terbatas menggunakan cache lokal");
                    var offlineNext = await PinFlow.ResolveNextAsync();
                    offlineNext.Show();
                    Close();
                }
                return;
            }
            using (me)
            {
                var userJson = me.RootElement.GetProperty("user").GetRawText();
                AppConfig.Instance.SaveUser(userJson);
            }
            AppLogger.Info("Auto-login device-token OK");
            var next = await PinFlow.ResolveNextAsync();
            next.Show();
            Close();
        }
        catch (Exception ex)
        {
            AppLogger.LogException("Auto-login gagal", ex);
        }
    }

    private async Task<bool> RefreshServerStatusAsync()
    {
        try
        {
            if (!ApiClient.Instance.TryConfigure(AppConfig.Instance.GetBaseUrl(), out _))
            {
                ServerLabel.Text = "Server (URL tidak valid ✗)";
                return false;
            }
            var ok = await ApiClient.Instance.HealthAsync();
            ServerLabel.Text = ok ? "Server (Online ✓)" : "Server (Offline ✗)";
            return ok;
        }
        catch (Exception ex)
        {
            AppLogger.LogException("RefreshServerStatus gagal", ex);
            ServerLabel.Text = "Server (Offline ✗)";
            return false;
        }
    }

    private async void OnTestServer(object sender, RoutedEventArgs e)
    {
        var btn = sender as System.Windows.Controls.Button;
        if (btn != null) btn.IsEnabled = false;
        try
        {
            var raw = ServerBox.Text;
            if (!ApiClient.TryNormalizeBaseUrl(raw, out var normalized, out var normErr))
            {
                ServerLabel.Text = "Server (URL tidak valid ✗)";
                Fail(normErr ?? "URL tidak valid — periksa lalu Tes lagi");
                return;
            }
            AppConfig.Instance.SetBaseUrl(normalized);
            ServerBox.Text = normalized; // tampilkan hasil normalisasi (tambah https:// dll)
            var ok = await RefreshServerStatusAsync();
            await RefreshGoogleVisibilityAsync();
            // Hasil tes tampil via ServerLabel + snack (cermin Flutter, tanpa popup).
            M3Snack.Show(this,
                ok ? "Server tersambung ✓" : "Masih tak terjangkau — cek URL / koneksi internet",
                isError: !ok);
        }
        catch (Exception ex)
        {
            AppLogger.LogException("Tes server gagal", ex);
            ServerLabel.Text = "Server (Offline ✗)";
            MessageBox.Show(this,
                $"Tes server gagal: {ex.Message}\n\nLog: {AppLogger.LogFile}",
                "Tes Server", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            if (btn != null) btn.IsEnabled = true;
        }
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
        // Pastikan server valid sebelum tembak API — cegah InvalidOperationException.
        if (!ApiClient.Instance.IsConfigured)
        {
            if (!ApiClient.Instance.TryConfigure(AppConfig.Instance.GetBaseUrl(), out var cfgErr))
            {
                Fail(cfgErr ?? "URL server tidak valid — Tes server dulu");
                return;
            }
        }
        SubmitBtn.IsEnabled = false;
        var oldContent = SubmitBtn.Content;
        SubmitBtn.Content = _reg ? "Mendaftar…" : "Masuk…";
        try
        {
            // Fase 2: daftar dulu (tanpa login), lalu login SEKALI untuk kedua jalur.
            // Cermin _submit() di login_screen.dart.
            if (_reg)
            {
                var name = string.IsNullOrWhiteSpace(NameBox.Text)
                    ? email.Split('@')[0] : NameBox.Text.Trim();
                if (name.Length < 2)
                {
                    Fail("Nama minimal 2 huruf");
                    return;
                }
                var (rok, rerr) = await ApiClient.Instance.RegisterAsync(name, email, pass);
                if (!rok) { Fail(rerr ?? "Gagal daftar"); return; }
            }

            // Fase 3: Bearer dulu; fallback cookie bila server lama (404).
            var (dok, derr, notSupported) =
                await ApiClient.Instance.AuthorizeDeviceAsync(email, pass);
            if (!dok && !notSupported)
            {
                Fail(derr ?? "Gagal masuk");
                return;
            }
            if (notSupported)
            {
                var (ok, err) = await ApiClient.Instance.LoginEmailAsync(email, pass);
                if (!ok) { Fail(err ?? "Gagal masuk"); return; }
                // Migrasi: tukar cookie valid menjadi token (best-effort).
                await ApiClient.Instance.UpgradeToDeviceTokenAsync();
            }

            await FinishLoginAsync(email);
        }
        catch (Exception ex)
        {
            AppLogger.LogException("Login submit gagal", ex);
            Fail($"Gagal masuk: {ex.Message}");
        }
        finally { SubmitBtn.IsEnabled = true; try { SubmitBtn.Content = oldContent; } catch { } }
    }

    /// Ekor login bersama (email / Google / kode manual): simpan user → alur PIN.
    private async Task FinishLoginAsync(string emailFallback)
    {
        var s = await ApiClient.Instance.SessionAsync();
        var userJson = s?.RootElement.GetProperty("user").GetRawText()
            ?? JsonSerializer.Serialize(new { email = emailFallback });
        AppConfig.Instance.SaveUser(userJson);

        // Alur PIN sama seperti APK: wajib PIN lokal → ke daftar acara.
        var next = await PinFlow.ResolveNextAsync();
        next.Show();
        Close();
    }

    // ---------- Fase 4: Google desktop via browser + loopback ----------

    private async void OnGoogle(object sender, RoutedEventArgs e)
    {
        ErrText.Visibility = Visibility.Collapsed;
        if (!ApiClient.Instance.IsConfigured)
        {
            Fail("Tes server dulu sebelum login Google");
            return;
        }
        GoogleBtn.IsEnabled = false;
        var oldContent = GoogleBtn.Content;
        GoogleBtn.Content = "Menunggu browser…";
        try { _googleCts?.Cancel(); } catch { }
        _googleCts = new CancellationTokenSource();
        GoogleLoopback? loop = null;
        try
        {
            try
            {
                loop = GoogleLoopback.Start();
                AppLogger.Info($"[GoogleDesktop] loopback siap di port {loop.Port}");
            }
            catch (Exception ex)
            {
                AppLogger.LogException("Loopback start gagal", ex);
                Fail($"Tidak bisa buka port lokal: {ex.Message}");
                return;
            }
            var startUrl = GoogleLoopback.BuildStartUrl(
                ApiClient.Instance.BaseUrl, loop.Port, loop.State,
                AppConfig.DeviceLabel());
            AppLogger.Info($"[GoogleDesktop] start URL: {startUrl}");
            var browserOk = false;
            try
            {
                GoogleLoopback.OpenBrowser(startUrl);
                browserOk = true;
            }
            catch (Exception ex)
            {
                AppLogger.LogException("OpenBrowser gagal", ex);
            }
            AppLogger.Info($"[GoogleDesktop] browser opened={browserOk}");
            if (!browserOk)
            {
                // Fallback kasat mata: tampilkan tautan + tombol salin.
                new LinkCopyDialog(startUrl) { Owner = this }.ShowDialog();
                Fail("Browser tidak terbuka otomatis — salin tautan, selesaikan login di browser, lalu coba lagi");
                return;
            }
            AppLogger.Info("[GoogleDesktop] menunggu callback loopback…");
            var hit = await loop.WaitAsync(_googleCts.Token);
            AppLogger.Info(hit == null
                ? "[GoogleDesktop] callback: TIMEOUT/BATAL"
                : "[GoogleDesktop] callback diterima, state cocok");
            if (hit == null)
            {
                Fail("Login Google dibatalkan / timeout (5 menit) — coba lagi");
                return;
            }
            var (ok, err) = await ApiClient.Instance.ExchangeDeviceCodeAsync(hit.Code);
            AppLogger.Info($"[GoogleDesktop] tukar kode: ok={ok} err={err}");
            if (!ok) { Fail(err ?? "Gagal tukar kode"); return; }
            await FinishLoginAsync("");
        }
        catch (Exception ex)
        {
            AppLogger.LogException("Login Google gagal", ex);
            Fail($"Login Google gagal: {ex.Message}");
        }
        finally
        {
            try { loop?.Dispose(); } catch { }
            GoogleBtn.Content = oldContent;
            GoogleBtn.IsEnabled = true;
        }
    }

    private async void OnPasteCode(object sender, RoutedEventArgs e)
    {
        ErrText.Visibility = Visibility.Collapsed;
        if (!ApiClient.Instance.IsConfigured)
        {
            Fail("Tes server dulu sebelum tempel kode");
            return;
        }
        var d = new CodePasteDialog { Owner = this };
        if (d.ShowDialog() != true || string.IsNullOrWhiteSpace(d.Code)) return;
        GoogleBtn.IsEnabled = false;
        try
        {
            var (ok, err) = await ApiClient.Instance.ExchangeDeviceCodeAsync(d.Code);
            if (!ok) { Fail(err ?? "Gagal tukar kode"); return; }
            await FinishLoginAsync("");
        }
        catch (Exception ex)
        {
            AppLogger.LogException("Tempel kode gagal", ex);
            Fail($"Gagal tukar kode: {ex.Message}");
        }
        finally { GoogleBtn.IsEnabled = true; }
    }
}
