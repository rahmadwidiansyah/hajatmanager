using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using HajatManager.Api;
using HajatManager.Models;
using HajatManager.Services;

namespace HajatManager.Views;

public partial class SettingsWindow : Window
{
    private EventModel _ev;
    private readonly List<string> _meja = new();
    private CancellationTokenSource? _searchCts;

    public SettingsWindow(EventModel ev)
    {
        _ev = ev;
        InitializeComponent();
        Title = $"Pengaturan — {ev.NamaAcara}";
        MemberBox.Visibility = ev.IsOwner ? Visibility.Visible : Visibility.Collapsed;
        DeleteBtn.Visibility = ev.IsOwner ? Visibility.Visible : Visibility.Collapsed;
        SaveInfoBtn.IsEnabled = ev.CanEdit;
        // RoleChip + catatan viewer cermin Flutter AppBar.
        try
        {
            RoleChipText.Text = ev.MyRole;
            if (ev.MyRole == "OWNER")
            {
                RoleChip.SetResourceReference(Border.BackgroundProperty, "PrimaryContainerBrush");
                RoleChipText.SetResourceReference(TextBlock.ForegroundProperty, "OnPrimaryContainerBrush");
            }
            else if (ev.MyRole == "ADMIN")
            {
                RoleChip.SetResourceReference(Border.BackgroundProperty, "WarningContainerBrush");
                RoleChipText.SetResourceReference(TextBlock.ForegroundProperty, "OnWarningContainerBrush");
            }
            ViewerNote.Visibility = ev.CanEdit ? Visibility.Collapsed : Visibility.Visible;
        }
        catch { }
        M3Chrome.Attach(this);
        Loaded += async (_, _) => await LoadAsync();
    }

    private async Task LoadAsync()
    {
        try { LoadingBar.Visibility = Visibility.Visible; } catch { }
        try
        {
            var doc = await ApiClient.Instance.GetAsync($"/api/events/{_ev.Id}");
            if (doc == null) return;
            var r = doc.RootElement;
            NamaBox.Text = r.TryGetProperty("namaAcara", out var n) ? n.GetString() ?? "" : "";
            TuanBox.Text = r.TryGetProperty("namaTuanRumah", out var t) && t.ValueKind != JsonValueKind.Null ? t.GetString() ?? "" : "";
            LokBox.Text = r.TryGetProperty("lokasi", out var l) && l.ValueKind != JsonValueKind.Null ? l.GetString() ?? "" : "";
            CatBox.Text = r.TryGetProperty("catatan", out var c) && c.ValueKind != JsonValueKind.Null ? c.GetString() ?? "" : "";
            try
            {
                if (r.TryGetProperty("tanggal", out var tg) && tg.ValueKind == JsonValueKind.String &&
                    DateTime.TryParse(tg.GetString(), out var d))
                    TglPicker.SelectedDate = d;
            }
            catch { }
            _meja.Clear();
            if (r.TryGetProperty("mejaList", out var ml))
                foreach (var m in ml.EnumerateArray())
                    _meja.Add(m.GetString() ?? "");
            RefreshMejaChips();
            var total = r.TryGetProperty("totalTamu", out var tt) ? tt.GetInt32() : 0;
            SummaryText.Text = $"{total} tamu";
            if (r.TryGetProperty("members", out var ms))
            {
                _membersLoading = true;
                try
                {
                    MemberGrid.ItemsSource = ms.EnumerateArray().Select(m => new MemberModel
                    {
                        UserId = MemberUid(m),
                        Role = m.TryGetProperty("role", out var ro) ? ro.GetString() ?? "VIEWER" : "VIEWER",
                        Name = m.TryGetProperty("user", out var u) && u.TryGetProperty("name", out var nm) ? nm.GetString() ?? "" : "",
                        Email = m.TryGetProperty("user", out var u2) && u2.TryGetProperty("email", out var em) ? em.GetString() ?? "" : "",
                    }).ToList();
                }
                finally { _membersLoading = false; }
            }
        }
        catch { }
        finally { try { LoadingBar.Visibility = Visibility.Collapsed; } catch { } }
    }

    private static string MemberUid(JsonElement m)
    {
        if (m.TryGetProperty("userId", out var u)) return u.GetString() ?? "";
        if (m.TryGetProperty("user", out var usr) && usr.TryGetProperty("id", out var id))
            return id.GetString() ?? "";
        return "";
    }

    private bool _savingInfo;
    private bool _membersLoading;

    // Chips meja deletable cermin Flutter (× per chip + PATCH).
    private async void RefreshMejaChips(bool push = false)
    {
        try
        {
            MejaChips.Children.Clear();
            foreach (var m in _meja.ToList())
            {
                var chip = new Border
                {
                    Margin = new Thickness(0, 0, 6, 4),
                    Padding = new Thickness(10, 4, 4, 4),
                    CornerRadius = new CornerRadius(999),
                    BorderThickness = new Thickness(1),
                };
                chip.SetResourceReference(Border.BackgroundProperty, "SurfaceContainerHighBrush");
                chip.SetResourceReference(Border.BorderBrushProperty, "OutlineBrush");
                var row = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
                var label = new TextBlock { Text = m, VerticalAlignment = VerticalAlignment.Center };
                label.SetResourceReference(TextBlock.ForegroundProperty, "OnSurfaceBrush");
                row.Children.Add(label);
                var x = new Button
                {
                    Content = new TextBlock
                    {
                        Text = "\uE711",
                        FontFamily = new System.Windows.Media.FontFamily("Segoe MDL2 Assets"),
                        FontSize = 9,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                    },
                    Width = 22, Height = 22,
                    Margin = new Thickness(6, 0, 0, 0),
                    Padding = new Thickness(0),
                    Tag = m,
                    ToolTip = $"Hapus {m}",
                };
                if (TryFindResource("TextButton") is Style tbs) x.Style = tbs;
                x.Click += (s, _) =>
                {
                    if (s is Button btn && btn.Tag is string tag)
                    {
                        _meja.Remove(tag);
                        RefreshMejaChips(push: true);
                    }
                };
                row.Children.Add(x);
                chip.Child = row;
                MejaChips.Children.Add(chip);
            }
        }
        catch { }
        if (push)
        {
            try
            {
                using var _ = await ApiClient.Instance.PatchJsonAsync($"/api/events/{_ev.Id}",
                    new { mejaList = _meja });
            }
            catch { }
        }
    }

    private async void OnSaveInfo(object sender, RoutedEventArgs e)
    {
        if (_savingInfo) return;
        _savingInfo = true;
        var btn = sender as System.Windows.Controls.Button;
        if (btn != null) btn.IsEnabled = false;
        try
        {
            var payload = new Dictionary<string, object?>
            {
                ["namaAcara"] = NamaBox.Text,
                ["namaTuanRumah"] = TuanBox.Text,
                ["lokasi"] = LokBox.Text,
                ["catatan"] = string.IsNullOrWhiteSpace(CatBox.Text) ? null : CatBox.Text,
                ["mejaList"] = _meja,
            };
            if (TglPicker.SelectedDate is DateTime tgl)
                payload["tanggal"] = tgl.ToString("yyyy-MM-dd");
            using var r = await ApiClient.Instance.PatchJsonAsync($"/api/events/{_ev.Id}", payload);
            if (r.IsSuccessStatusCode) M3Snack.Show(this, "Tersimpan");
            else M3Snack.Show(this, "Gagal simpan", isError: true);
        }
        catch { M3Snack.Show(this, "Tidak ada koneksi", isError: true); }
        finally { _savingInfo = false; if (btn != null) btn.IsEnabled = true; }
    }

    private async void OnAddMeja(object sender, RoutedEventArgs e)
    {
        var v = MejaBox.Text.Trim().ToUpperInvariant();
        if (v.Length == 0 || _meja.Contains(v) || _meja.Count >= 10) return;
        _meja.Add(v);
        RefreshMejaChips();
        MejaBox.Text = "";
        try
        {
            using var _ = await ApiClient.Instance.PatchJsonAsync($"/api/events/{_ev.Id}",
                new { mejaList = _meja });
        }
        catch { }
    }

    private async void OnSearch(object sender, TextChangedEventArgs e)
    {
        _searchCts?.Cancel();
        var cts = _searchCts = new CancellationTokenSource();
        var q = SearchBox.Text.Trim();
        if (q.Length < 2) { ResultList.ItemsSource = null; return; }
        try
        {
            await Task.Delay(350, cts.Token);
            var doc = await ApiClient.Instance.GetAsync(
                "/api/users/search?" + ApiClient.BuildQuery(new() { ["q"] = q }));
            if (cts.IsCancellationRequested) return;
            ResultList.ItemsSource = doc?.RootElement.EnumerateArray()
                .Select(u =>
                {
                    var nm = u.TryGetProperty("name", out var n) ? n.GetString() : "";
                    var em = u.TryGetProperty("email", out var e2) ? e2.GetString() : "";
                    return $"{nm} <{em}>|{u.GetProperty("id").GetString()}";
                })
                .ToList();
        }
        catch { }
    }

    private bool _addingMember;

    /// Role terpilih di ComboBox baris tambah (default ADMIN cermin web/Flutter).
    private string SelectedAddRole()
    {
        try
        {
            if (AddRoleBox.SelectedItem is ComboBoxItem it &&
                it.Content is string s && (s == "OWNER" || s == "ADMIN" || s == "VIEWER"))
                return s;
        }
        catch { }
        return "ADMIN";
    }

    // Ubah role via dialog Edit di kolom Aksi (jelas + eksplisit).
    private async void OnEditMemberRole(object sender, RoutedEventArgs e)
    {
        MemberModel m;
        try { m = (MemberModel)((FrameworkElement)sender).DataContext; }
        catch { return; }
        var roles = new[] { "VIEWER", "ADMIN", "OWNER" };
        var box = new ComboBox { Margin = new Thickness(0, 8, 0, 0), MinWidth = 200 };
        foreach (var r in roles) box.Items.Add(new ComboBoxItem { Content = r });
        box.SelectedIndex = Math.Max(0, Array.IndexOf(roles, m.Role));
        var err = new TextBlock { Margin = new Thickness(0, 8, 0, 0), TextWrapping = TextWrapping.Wrap };
        err.SetResourceReference(TextBlock.ForegroundProperty, "ErrorBrush");
        var simpan = new Button { Content = "Simpan", MinWidth = 96 };
        if (TryFindResource("PrimaryButton") is Style ps) simpan.Style = ps;
        var batal = new Button { Content = "Batal", Margin = new Thickness(8, 0, 0, 0) };
        if (TryFindResource("TextButton") is Style ts) batal.Style = ts;
        var win = new Window
        {
            Title = $"Ubah role — {m.Name}",
            Width = 380,
            SizeToContent = SizeToContent.Height,
            MaxHeight = 300,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            Owner = this,
            ResizeMode = ResizeMode.NoResize,
        };
        win.SetResourceReference(BackgroundProperty, "SurfaceBrush");
        var p = new StackPanel { Margin = new Thickness(16) };
        p.Children.Add(new TextBlock { Text = $"Role baru untuk {m.Email}:", TextWrapping = TextWrapping.Wrap });
        p.Children.Add(box);
        p.Children.Add(err);
        var row = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(0, 12, 0, 0)
        };
        row.Children.Add(simpan);
        row.Children.Add(batal);
        p.Children.Add(row);
        win.Content = p;
        M3Chrome.Attach(win, dialog: true);
        batal.Click += (_, _) => win.Close();
        simpan.Click += async (_, _) =>
        {
            var role = (box.SelectedItem as ComboBoxItem)?.Content as string ?? m.Role;
            if (role == m.Role) { win.Close(); return; }
            simpan.IsEnabled = false;
            try
            {
                using var r = await ApiClient.Instance.PatchJsonAsync(
                    $"/api/events/{_ev.Id}/members",
                    new { userId = m.UserId, role });
                if (r.IsSuccessStatusCode)
                {
                    win.Close();
                    M3Snack.Show(this, $"Role {m.Name} → {role}");
                    await LoadAsync();
                }
                else
                {
                    err.Text = await ApiClient.Instance.TryErrAsync(r, "Gagal ubah role") ?? "Gagal";
                }
            }
            catch { err.Text = "Butuh online."; }
            finally { try { simpan.IsEnabled = true; } catch { } }
        };
        win.ShowDialog();
    }

    private async void OnRemoveMember(object sender, RoutedEventArgs e)
    {
        MemberModel m;
        try { m = (MemberModel)((FrameworkElement)sender).DataContext; }
        catch { return; }
        if (MessageBox.Show(this, $"Keluarkan {m.Name} dari acara?",
                "Keluarkan anggota", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
            return;
        try
        {
            using var r = await ApiClient.Instance.DeleteAsync(
                $"/api/events/{_ev.Id}/members?userId={Uri.EscapeDataString(m.UserId)}");
            if (r.IsSuccessStatusCode) await LoadAsync();
            else M3Snack.Show(this, "Gagal mengeluarkan anggota.", isError: true);
        }
        catch { M3Snack.Show(this, "Butuh online.", isError: true); }
    }

    private async void OnAddMember(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        await AddSelectedMemberAsync();
    }

    private async void OnAddSelectedMember(object sender, RoutedEventArgs e)
    {
        await AddSelectedMemberAsync();
    }

    private async Task AddSelectedMemberAsync()
    {
        if (_addingMember) return;
        if (ResultList.SelectedItem is not string s) return;
        var id = s.Contains('|') ? s.Split('|')[^1] : "";
        if (string.IsNullOrEmpty(id)) return;
        _addingMember = true;
        try
        {
            using var r = await ApiClient.Instance.PostJsonAsync(
                $"/api/events/{_ev.Id}/members",
                new { userId = id, role = SelectedAddRole() });
            if (r.IsSuccessStatusCode)
            {
                SearchBox.Text = "";
                ResultList.ItemsSource = null;
                await LoadAsync();
            }
            else
            {
                M3Snack.Show(this,
                    await ApiClient.Instance.TryErrAsync(r, "Gagal tambah") ?? "Gagal",
                    isError: true);
            }
        }
        catch { M3Snack.Show(this, "Butuh online.", isError: true); }
        finally { _addingMember = false; }
    }

    // Danger zone cermin Flutter: ketik HAPUS untuk konfirmasi.
    private void OnDelete(object sender, RoutedEventArgs e)
    {
        var box = new TextBox { Margin = new Thickness(0, 8, 0, 0) };
        var err = new TextBlock { Margin = new Thickness(0, 8, 0, 0), TextWrapping = TextWrapping.Wrap };
        err.SetResourceReference(TextBlock.ForegroundProperty, "ErrorBrush");
        var hapus = new Button { Content = "Hapus Permanen", Margin = new Thickness(8, 0, 0, 0), IsEnabled = false };
        if (TryFindResource("DangerButton") is Style ds) hapus.Style = ds;
        var batal = new Button { Content = "Batal" };
        if (TryFindResource("TextButton") is Style ts) batal.Style = ts;
        var win = new Window
        {
            Title = "Hapus Acara Permanen",
            Width = 440, Height = 300,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            Owner = this,
            ResizeMode = ResizeMode.NoResize,
        };
        win.SetResourceReference(BackgroundProperty, "SurfaceBrush");
        var p = new StackPanel { Margin = new Thickness(16) };
        p.Children.Add(new TextBlock
        {
            Text = "Hapus acara ini permanen beserta semua datanya? Tindakan tidak bisa dibatalkan.\n\nKetik HAPUS untuk melanjutkan.",
            TextWrapping = TextWrapping.Wrap,
        });
        p.Children.Add(box);
        p.Children.Add(err);
        var row = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(0, 12, 0, 0),
        };
        row.Children.Add(batal);
        row.Children.Add(hapus);
        p.Children.Add(row);
        win.Content = p;
        M3Chrome.Attach(win, dialog: true);
        box.TextChanged += (_, _) => { hapus.IsEnabled = box.Text.Trim() == "HAPUS"; };
        batal.Click += (_, _) => win.Close();
        hapus.Click += async (_, _) =>
        {
            hapus.IsEnabled = false;
            try
            {
                using var r = await ApiClient.Instance.DeleteAsync($"/api/events/{_ev.Id}");
                if (r.IsSuccessStatusCode)
                {
                    await Data.LocalDb.Instance.DeleteEventLocalAsync(_ev.Id);
                    win.Close();
                    Close();
                    return;
                }
                err.Text = "Gagal menghapus — coba lagi.";
            }
            catch { err.Text = "Hapus butuh online."; }
            finally { try { hapus.IsEnabled = box.Text.Trim() == "HAPUS"; } catch { } }
        };
        win.ShowDialog();
    }
}
