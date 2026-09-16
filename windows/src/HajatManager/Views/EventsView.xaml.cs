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

    public EventsView()
    {
        InitializeComponent();
        Loaded += async (_, _) => await ReloadAsync();
    }

    public async Task ReloadAsync()
    {
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
                await LocalDb.Instance.SetMyRoleAsync(ev.Id, ev.MyRole);
            }
            var cfg = AppConfig.Instance;
            _items = items;
            await LocalDb.Instance.PutEventsAsync(items);
        }
        catch
        {
            _items = await LocalDb.Instance.GetEventsAsync();
        }
        ApplyFilter();
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
        var q = SearchBox.Text.Trim().ToLowerInvariant();
        List.ItemsSource = string.IsNullOrEmpty(q)
            ? _items
            : _items.Where(x => x.NamaAcara.ToLowerInvariant().Contains(q) ||
                (x.Lokasi ?? "").ToLowerInvariant().Contains(q)).ToList();
    }

    private void OnOpen(object sender, MouseButtonEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is EventModel ev)
            new EventDetailWindow(ev).ShowDialog();
    }

    private async void OnCreate(object sender, RoutedEventArgs e)
    {
        var d = new CreateEventDialog();
        if (d.ShowDialog() != true) return;
        var id = $"evt-{Guid.NewGuid()}";
        var payload = new Dictionary<string, object?>
        {
            ["id"] = id,
            ["namaAcara"] = d.Nama,
            ["namaTuanRumah"] = string.IsNullOrWhiteSpace(d.Tuan) ? null : d.Tuan,
            ["tanggal"] = DateTime.Now.ToString("o"),
            ["lokasi"] = string.IsNullOrWhiteSpace(d.Lokasi) ? null : d.Lokasi,
            ["mejaList"] = new[] { "MEJA-1", "MEJA-2" },
        };
        await LocalDb.Instance.PutEventsAsync(new[]
        {
            new EventModel { Id = id, NamaAcara = d.Nama, NamaTuanRumah = d.Tuan,
                Lokasi = d.Lokasi, Tanggal = DateTime.Now, MyRole = "OWNER" },
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
                tanggal = DateTime.Now.ToString("o"),
                lokasi = d.Lokasi,
            });
            if (r.IsSuccessStatusCode)
                await LocalDb.Instance.OutboxRemoveAsync(new[] { id });
        }
        catch { }
        await SyncEngine.Instance.FlushAsync(id);
        await ReloadAsync();
    }
}
