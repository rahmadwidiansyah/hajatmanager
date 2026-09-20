using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Input;
using HajatManager.Api;
using HajatManager.Data;
using HajatManager.Models;
using HajatManager.Services;

namespace HajatManager.Views;

public partial class EventsView : UserControl
{
    private List<EventModel> _items = new();
    private bool _creating;

    public EventsView()
    {
        InitializeComponent();
        Loaded += async (_, _) =>
        {
            try { await ReloadAsync(); }
            catch (Exception ex)
            {
                AppLogger.LogException("EventsView.Load gagal", ex);
                try { ApplyFilter(); } catch { }
            }
        };
        // Ctrl+F fokus ke pencarian (cermin mobile CallbackShortcuts).
        try
        {
            KeyDown += (_, e) =>
            {
                if (e.Key == System.Windows.Input.Key.F &&
                    (System.Windows.Input.Keyboard.Modifiers & System.Windows.Input.ModifierKeys.Control) != 0)
                {
                    try { SearchBox.Focus(); } catch { }
                    e.Handled = true;
                }
            };
            Focusable = true;
        }
        catch { }
    }

    public async Task ReloadAsync()
    {
        try { LoadingBar.Visibility = Visibility.Visible; } catch { }
        var myId = "";
        try
        {
            var u = AppConfig.Instance.GetCachedUser() ?? "{}";
            myId = JsonDocument.Parse(u).RootElement.GetProperty("id").GetString() ?? "";
        }
        catch { }
        try
        {
            var doc = await ApiClient.Instance.GetAsync("/api/events");
            var list = doc?.RootElement.EnumerateArray().ToList() ?? new();
            var items = new List<EventModel>();
            foreach (var m in list)
            {
                var ev = ParseEvent(m, myId);
                items.Add(ev);
                try { await LocalDb.Instance.SetMyRoleAsync(ev.Id, ev.MyRole); }
                catch (Exception ex) { AppLogger.LogException("SetMyRole gagal", ex); }
            }
            _items = items;
            try { await LocalDb.Instance.PutEventsAsync(items); }
            catch (Exception ex) { AppLogger.LogException("PutEvents gagal", ex); }
        }
        catch (Exception ex)
        {
            // Offline / server belum dikonfigurasi → fallback cache lokal.
            AppLogger.Warn($"Events pull gagal, pakai cache lokal: {ex.Message}");
            try { _items = await LocalDb.Instance.GetEventsAsync(); }
            catch (Exception ex2)
            {
                AppLogger.LogException("GetEvents lokal gagal", ex2);
                _items = new();
            }
        }
        try { ApplyFilter(); } catch (Exception ex) { AppLogger.LogException("ApplyFilter gagal", ex); }
        try { LoadingBar.Visibility = Visibility.Collapsed; } catch { }
    }

    internal static EventModel ParseEvent(JsonElement m, string myId)
    {
        var ev = new EventModel
        {
            Id = m.GetProperty("id").GetString() ?? "",
            NamaAcara = m.TryGetProperty("namaAcara", out var n) ? n.GetString() ?? "" : "",
            Tanggal = m.TryGetProperty("tanggal", out var t) && t.TryGetDateTime(out var d)
                ? d : DateTime.Now,
        };
        if (m.TryGetProperty("namaTuanRumah", out var th) && th.ValueKind != JsonValueKind.Null)
            ev.NamaTuanRumah = th.GetString();
        if (m.TryGetProperty("lokasi", out var l) && l.ValueKind != JsonValueKind.Null)
            ev.Lokasi = l.GetString();
        if (m.TryGetProperty("mejaList", out var ml) && ml.ValueKind == JsonValueKind.Array)
            ev.MejaList = ml.EnumerateArray().Select(x => x.GetString() ?? "").Where(s => s != "").ToList();
        var role = "VIEWER";
        if (m.TryGetProperty("members", out var ms))
        {
            foreach (var mem in ms.EnumerateArray())
            {
                string? uid = mem.TryGetProperty("userId", out var u) ? u.GetString()
                    : mem.TryGetProperty("user", out var usr) && usr.TryGetProperty("id", out var id)
                        ? id.GetString() : null;
                if (uid == myId && mem.TryGetProperty("role", out var r))
                {
                    role = r.GetString() ?? "VIEWER";
                    break;
                }
            }
        }
        else if (m.TryGetProperty("myRole", out var mr))
        {
            role = mr.GetString() ?? "VIEWER";
        }
        ev.MyRole = role;
        return ev;
    }

    private void OnSearch(object sender, TextChangedEventArgs e) => ApplyFilter();

    private void ApplyFilter()
    {
        var q = (SearchBox.Text ?? "").Trim();
        var shown = string.IsNullOrEmpty(q)
            ? _items
            : _items.Where(x => x.NamaAcara.ToLowerInvariant().Contains(q.ToLowerInvariant()) ||
                (x.Lokasi ?? "").ToLowerInvariant().Contains(q.ToLowerInvariant())).ToList();
        List.ItemsSource = shown;
        try
        {
            CountText.Text = $"{_items.Count} acara";
            var empty = shown.Count == 0;
            EmptyPanel.Visibility = empty ? Visibility.Visible : Visibility.Collapsed;
            EmptyCreateBtn.Visibility = _items.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
            EmptyTitle.Text = _items.Count == 0 ? "Belum ada acara" : $"Tidak ketemu \"{q}\"";
            EmptySub.Text = _items.Count == 0
                ? "Buat acara pertama atau minta panitia menambahkanmu."
                : "Coba kata kunci lain.";
        }
        catch { }
    }

    private void OnOpen(object sender, MouseButtonEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is EventModel ev)
            new EventDetailWindow(ev).ShowDialog();
    }

    private void OnOpenKey(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == System.Windows.Input.Key.Enter &&
            (sender as FrameworkElement)?.DataContext is EventModel ev)
            new EventDetailWindow(ev).ShowDialog();
    }

    private async void OnCreate(object sender, RoutedEventArgs e)
    {
        if (_creating) return;
        var d = new CreateEventDialog();
        if (d.ShowDialog() != true || d.Tanggal == null) return;
        _creating = true;
        var btn = sender as System.Windows.Controls.Button;
        if (btn != null) btn.IsEnabled = false;
        try
        {
        var id = $"evt-{Guid.NewGuid()}";
        var tgl = d.Tanggal.Value;
        var cat = string.IsNullOrWhiteSpace(d.Catatan) ? null : d.Catatan;
        var payload = new Dictionary<string, object?>
        {
            ["id"] = id,
            ["namaAcara"] = d.Nama,
            ["namaTuanRumah"] = string.IsNullOrWhiteSpace(d.Tuan) ? null : d.Tuan,
            ["tanggal"] = tgl.ToString("o"),
            ["lokasi"] = string.IsNullOrWhiteSpace(d.Lokasi) ? null : d.Lokasi,
            ["catatan"] = cat,
            ["mejaList"] = new[] { "MEJA-1", "MEJA-2" },
        };
        await LocalDb.Instance.PutEventsAsync(new[]
        {
            new EventModel { Id = id, NamaAcara = d.Nama, NamaTuanRumah = d.Tuan,
                Lokasi = d.Lokasi, Catatan = cat, Tanggal = tgl, MyRole = "OWNER" },
        });
        await LocalDb.Instance.EnqueueAsync(new OutboxOp
        {
            Id = id, EventId = id, Action = "CREATE_EVENT",
            TableName = "events",
            Payload = JsonSerializer.Serialize(payload),
        });
        try
        {
            using var r = await ApiClient.Instance.PostJsonAsync("/api/events", new
            {
                namaAcara = d.Nama,
                namaTuanRumah = d.Tuan,
                tanggal = tgl.ToString("o"),
                lokasi = d.Lokasi,
                catatan = cat,
            });
            if (r.IsSuccessStatusCode)
                await LocalDb.Instance.OutboxRemoveAsync(new[] { id });
        }
        catch (Exception ex) { AppLogger.Warn($"Create event push gagal (masuk outbox): {ex.Message}"); }
        try { await SyncEngine.Instance.SyncInBackgroundAsync(id); }
        catch (Exception ex) { AppLogger.LogException("Flush create-event gagal", ex); }
        await ReloadAsync();
        }
        catch (Exception ex)
        {
            AppLogger.LogException("OnCreate gagal", ex);
            MessageBox.Show($"Gagal buat acara: {ex.Message}\n\nLog: {AppLogger.LogFile}",
                "Hajat Manager", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            _creating = false;
            if (btn != null) btn.IsEnabled = true;
        }
    }
}
