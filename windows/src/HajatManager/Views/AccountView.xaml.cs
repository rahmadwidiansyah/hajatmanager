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
        // Tile 1/2 kolom cermin web (Task 8): sempit → 1 kolom.
        try
        {
            SizeChanged += (_, e) =>
            {
                try { if (TileGrid != null) TileGrid.Columns = e.NewSize.Width < 600 ? 1 : 2; } catch { }
            };
        }
        catch { }
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
        // Foto profil bila ada (image/avatar/profilePicture dari /api/users/me).
        try
        {
            string? url = null;
            foreach (var key in new[] { "profilePicture", "avatar", "image" })
            {
                if (u.TryGetProperty(key, out var p) && p.ValueKind == JsonValueKind.String)
                {
                    var v = p.GetString();
                    if (!string.IsNullOrWhiteSpace(v)) { url = v; break; }
                }
            }
            if (url != null) _ = LoadAvatarPhotoAsync(url);
            else if (AvatarCircle != null) AvatarCircle.Child = AvatarText;
        }
        catch { }
    }

    // Unduh foto berautentikasi (cookie-session) lalu tampilkan bulat.
    private async Task LoadAvatarPhotoAsync(string url)
    {
        try
        {
            var bytes = await ApiClient.Instance.GetBytesAsync(url);
            if (bytes == null || bytes.Length == 0) return;
            Dispatcher.BeginInvoke(new Action(() =>
            {
                try
                {
                    var bmp = new System.Windows.Media.Imaging.BitmapImage();
                    using var ms = new System.IO.MemoryStream(bytes);
                    bmp.BeginInit();
                    bmp.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
                    bmp.StreamSource = ms;
                    bmp.EndInit();
                    bmp.Freeze();
                    var img = new System.Windows.Controls.Image
                    {
                        Source = bmp,
                        Stretch = System.Windows.Media.Stretch.UniformToFill,
                        Width = 52, Height = 52,
                    };
                    var clip = new System.Windows.Media.EllipseGeometry(
                        new System.Windows.Point(26, 26), 26, 26);
                    img.Clip = clip;
                    if (AvatarCircle != null) AvatarCircle.Child = img;
                }
                catch { }
            }));
        }
        catch { }
    }

    // Tile aktif ditandai border Primary (ganti chip aktif). null = bersihkan semua.
    private void MarkActive(Border? active)
    {
        foreach (var b in new Border[] { TileProfil, TileKeamanan, TilePin, TileTentang })
        {
            try
            {
                if (active != null && ReferenceEquals(b, active))
                    b.SetResourceReference(Border.BorderBrushProperty, "PrimaryBrush");
                else
                    b.SetResourceReference(Border.BorderBrushProperty, "OutlineBrush");
                b.BorderThickness = new Thickness(active != null && ReferenceEquals(b, active) ? 1.5 : 1);
            }
            catch { }
        }
    }

    // Kembali dari sub-halaman: tutup SubHost + refresh kartu profil.
    private void OnSubBack()
    {
        try
        {
            SubHost.Content = null;
            MarkActive(null);
        }
        catch { }
        _ = LoadAsync();
    }

    private void GoProfile(object s, System.Windows.Input.MouseButtonEventArgs e) { SubHost.Content = new ProfileView(OnSubBack); MarkActive(TileProfil); }
    private void GoSecurity(object s, System.Windows.Input.MouseButtonEventArgs e) { SubHost.Content = new SecurityView(OnSubBack); MarkActive(TileKeamanan); }
    private void GoPin(object s, System.Windows.Input.MouseButtonEventArgs e)
    {
        var email = "";
        try
        {
            email = JsonDocument.Parse(AppConfig.Instance.GetCachedUser() ?? "{}")
                .RootElement.GetProperty("email").GetString() ?? "";
        }
        catch { }
        SubHost.Content = new PinSubView(email, OnSubBack);
        MarkActive(TilePin);
    }
    private void GoAbout(object s, System.Windows.Input.MouseButtonEventArgs e) { SubHost.Content = new AboutView(OnSubBack); MarkActive(TileTentang); }

    private void OnTileKey(object s, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key != System.Windows.Input.Key.Enter) return;
        try
        {
            if (ReferenceEquals(s, TileProfil)) { SubHost.Content = new ProfileView(OnSubBack); MarkActive(TileProfil); }
            else if (ReferenceEquals(s, TileKeamanan)) { SubHost.Content = new SecurityView(OnSubBack); MarkActive(TileKeamanan); }
            else if (ReferenceEquals(s, TilePin)) GoPin(s, new System.Windows.Input.MouseButtonEventArgs(System.Windows.Input.Mouse.PrimaryDevice, 0, System.Windows.Input.MouseButton.Left));
            else if (ReferenceEquals(s, TileTentang)) { SubHost.Content = new AboutView(OnSubBack); MarkActive(TileTentang); }
            e.Handled = true;
        }
        catch { }
    }
}
