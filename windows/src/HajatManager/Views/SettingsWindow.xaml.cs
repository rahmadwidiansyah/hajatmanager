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
        Loaded += async (_, _) => await LoadAsync();
    }

    private async Task LoadAsync()
    {
        try
        {
            var doc = await ApiClient.Instance.GetAsync($"/api/events/{_ev.Id}");
            if (doc == null) return;
            var r = doc.RootElement;
            NamaBox.Text = r.TryGetProperty("namaAcara", out var n) ? n.GetString() ?? "" : "";
            TuanBox.Text = r.TryGetProperty("namaTuanRumah", out var t) && t.ValueKind != JsonValueKind.Null ? t.GetString() ?? "" : "";
            LokBox.Text = r.TryGetProperty("lokasi", out var l) && l.ValueKind != JsonValueKind.Null ? l.GetString() ?? "" : "";
            CatBox.Text = r.TryGetProperty("catatan", out var c) && c.ValueKind != JsonValueKind.Null ? c.GetString() ?? "" : "";
            _meja.Clear();
            if (r.TryGetProperty("mejaList", out var ml))
                foreach (var m in ml.EnumerateArray())
                    _meja.Add(m.GetString() ?? "");
            MejaList.ItemsSource = _meja.ToList();
            var total = r.TryGetProperty("totalTamu", out var tt) ? tt.GetInt32() : 0;
            SummaryText.Text = $"{total} tamu";
            if (r.TryGetProperty("members", out var ms))
            {
                MemberGrid.ItemsSource = ms.EnumerateArray().Select(m => new MemberModel
                {
                    UserId = MemberUid(m),
                    Role = m.TryGetProperty("role", out var ro) ? ro.GetString() ?? "VIEWER" : "VIEWER",
                    Name = m.TryGetProperty("user", out var u) && u.TryGetProperty("name", out var nm) ? nm.GetString() ?? "" : "",
                    Email = m.TryGetProperty("user", out var u2) && u2.TryGetProperty("email", out var em) ? em.GetString() ?? "" : "",
                }).ToList();
            }
        }
        catch { }
    }

    private static string MemberUid(JsonElement m)
    {
        if (m.TryGetProperty("userId", out var u)) return u.GetString() ?? "";
        if (m.TryGetProperty("user", out var usr) && usr.TryGetProperty("id", out var id))
            return id.GetString() ?? "";
        return "";
    }

    private async void OnSaveInfo(object sender, RoutedEventArgs e)
    {
        try
        {
            using var r = await ApiClient.Instance.PatchJsonAsync($"/api/events/{_ev.Id}",
                new
                {
                    namaAcara = NamaBox.Text,
                    namaTuanRumah = TuanBox.Text,
                    lokasi = LokBox.Text,
                    catatan = string.IsNullOrWhiteSpace(CatBox.Text) ? null : CatBox.Text,
                    mejaList = _meja,
                });
            MessageBox.Show(this, r.IsSuccessStatusCode ? "Tersimpan" : "Gagal simpan",
                "Info", MessageBoxButton.OK,
                r.IsSuccessStatusCode ? MessageBoxImage.Information : MessageBoxImage.Error);
        }
        catch { MessageBox.Show(this, "Tidak ada koneksi", "Info", MessageBoxButton.OK, MessageBoxImage.Warning); }
    }

    private async void OnAddMeja(object sender, RoutedEventArgs e)
    {
        var v = MejaBox.Text.Trim().ToUpperInvariant();
        if (v.Length == 0 || _meja.Contains(v) || _meja.Count >= 10) return;
        _meja.Add(v);
        MejaList.ItemsSource = _meja.ToList();
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

    private async void OnAddMember(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (ResultList.SelectedItem is not string s) return;
        var id = s.Contains('|') ? s.Split('|')[^1] : "";
        if (string.IsNullOrEmpty(id)) return;
        try
        {
            using var r = await ApiClient.Instance.PostJsonAsync(
                $"/api/events/{_ev.Id}/members",
                new { userId = id, role = "ADMIN" });
            if (r.IsSuccessStatusCode)
            {
                SearchBox.Text = "";
                ResultList.ItemsSource = null;
                await LoadAsync();
            }
            else
            {
                MessageBox.Show(this,
                    await ApiClient.Instance.TryErrAsync(r, "Gagal tambah") ?? "Gagal",
                    "Anggota", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }
        catch { MessageBox.Show(this, "Butuh online.", "Anggota", MessageBoxButton.OK, MessageBoxImage.Warning); }
    }

    private async void OnDelete(object sender, RoutedEventArgs e)
    {
        var c = MessageBox.Show(this,
            "Hapus acara ini permanen beserta semua datanya? Tindakan tidak bisa dibatalkan.",
            "Hapus Acara", MessageBoxButton.YesNo, MessageBoxImage.Warning);
        if (c != MessageBoxResult.Yes) return;
        try
        {
            using var r = await ApiClient.Instance.DeleteAsync($"/api/events/{_ev.Id}");
            if (r.IsSuccessStatusCode)
            {
                await Data.LocalDb.Instance.DeleteEventLocalAsync(_ev.Id);
                Close();
            }
        }
        catch { MessageBox.Show(this, "Hapus butuh online.", "Hapus", MessageBoxButton.OK, MessageBoxImage.Warning); }
    }
}
