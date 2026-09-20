using System.Net.NetworkInformation;
using System.Text.Json;
using System.Text.Json.Nodes;
using HajatManager.Api;
using HajatManager.Data;
using HajatManager.Models;

namespace HajatManager.Services;

// Outbox offline-first — cermin mobile/lib/core/sync_engine.dart.
// Batch CREATE_* via /api/sync/push; sisanya satu-per-satu; pull delta.
public sealed class SyncEngine
{
    public static SyncEngine Instance { get; } = new();
    private SyncEngine() { }

    private System.Threading.Timer? _timer;
    public bool Online { get; private set; } = true;
    public event Action? Changed;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private bool _netHooked;
    // Anti-overlap: satu pintu coalesced cermin mobile syncInBackground.
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly HashSet<string> _inFlight = new();
    private Task? _activeFlushAll;

    public void Start()
    {
        _timer ??= new System.Threading.Timer(
            _ => { try { _ = SyncInBackgroundAsync(null); } catch { } },
            null, TimeSpan.FromSeconds(30), TimeSpan.FromMinutes(1));
        // Instant trigger saat OS lapor jaringan berubah (cermin mobile connectivity).
        if (!_netHooked)
        {
            _netHooked = true;
            try
            {
                NetworkChange.NetworkAvailabilityChanged += (_, _) =>
                {
                    try { _ = SyncInBackgroundAsync(null); }
                    catch { }
                };
            }
            catch { }
        }
    }

    /// Satu pintu untuk timer / NetworkChange / tombol manual.
    /// Pemanggil kedua saat masih jalan ikut task yang sama (tidak overlap).
    public Task SyncInBackgroundAsync(string? eventId)
    {
        if (eventId != null)
        {
            lock (_inFlight)
            {
                if (!_inFlight.Add(eventId)) return Task.CompletedTask;
            }
            return FlushOneGuardedAsync(eventId);
        }
        var t = _activeFlushAll;
        if (t != null && !t.IsCompleted) return t;
        t = FlushAllGuardedAsync();
        _activeFlushAll = t;
        _ = t.ContinueWith(_ => { _activeFlushAll = null; }, TaskScheduler.Default);
        return t;
    }

    private async Task FlushOneGuardedAsync(string eventId)
    {
        try
        {
            await _gate.WaitAsync();
            try { await CheckNowAsync(); await FlushAsync(eventId); }
            finally { _gate.Release(); }
        }
        catch { }
        finally { lock (_inFlight) { _inFlight.Remove(eventId); } }
    }

    private async Task FlushAllGuardedAsync()
    {
        try
        {
            await _gate.WaitAsync();
            try { await CheckNowAsync(); await FlushAllAsync(); }
            finally { _gate.Release(); }
        }
        catch { }
    }

    public async Task<bool> CheckNowAsync()
    {
        try
        {
            var nic = NetworkInterface.GetIsNetworkAvailable();
            if (!nic) { SetOnline(false); return false; }
            if (!ApiClient.Instance.IsConfigured) { SetOnline(false); return false; }
            var ok = await ApiClient.Instance.HealthAsync();
            SetOnline(ok);
            return ok;
        }
        catch (Exception)
        {
            SetOnline(false);
            return false;
        }
    }

    private void SetOnline(bool ok)
    {
        if (ok != Online) { Online = ok; try { Changed?.Invoke(); } catch { } }
    }

    public async Task<int> PendingAsync(string eventId) =>
        await LocalDb.Instance.OutboxCountAsync(eventId);

    // Returns (flushed, conflicts, error).
    public async Task<(int flushed, int conflicts, string? error)> FlushAsync(string eventId)
    {
        try
        {
            var ops = await LocalDb.Instance.OutboxListAsync(eventId);
            if (ops.Count == 0)
            {
                try { await PullAsync(eventId); }
                catch (Exception ex) { return (0, 0, ex.Message); }
                return (0, 0, null);
            }

            var creates = ops.Where(o => o.Action.StartsWith("CREATE_")).ToList();
            var rest = ops.Where(o => !o.Action.StartsWith("CREATE_")).ToList();
            var guests = new List<JsonObject>();
            var books = new List<JsonObject>();
            var events = new List<JsonObject>();
            foreach (var o in creates)
            {
                var p = JsonNode.Parse(o.Payload)?.AsObject();
                if (p == null) continue;
                if (o.Action == "CREATE_GUEST") guests.Add(p);
                else if (o.Action == "CREATE_BOOK") books.Add(p);
                else if (o.Action == "CREATE_EVENT") events.Add(p);
            }

            int flushed = 0, conflicts = 0;
            string? err = null;

            if (creates.Count > 0)
            {
                try
                {
                    using var res = await ApiClient.Instance.PostJsonAsync(
                        "/api/sync/push",
                        new { guests, guestBooks = books, events });
                    if (!res.IsSuccessStatusCode)
                    {
                        var status = (int)res.StatusCode;
                        return (0, 0, status >= 500 ? "server-error" : $"rejected-{status}");
                    }
                    var doc = await res.Content.ReadFromJsonAsync<JsonDocument>(JsonOpts);
                    var cfl = doc?.RootElement.TryGetProperty("conflicts", out var c) == true
                        ? c.EnumerateArray().ToList() : new List<JsonElement>();
                    var cIds = cfl.Select(e => e.GetProperty("id").GetString() ?? "").ToHashSet();
                    var forbidden = cfl
                        .Where(e => e.TryGetProperty("reason", out var r) &&
                                    r.GetString() == "FORBIDDEN")
                        .Select(e => e.GetProperty("id").GetString() ?? "")
                        .ToList();
                    var done = creates.Select(o => o.Id).Where(id => !cIds.Contains(id)).ToList();
                    await LocalDb.Instance.OutboxRemoveAsync(done);
                    if (forbidden.Count > 0)
                        await LocalDb.Instance.OutboxRemoveAsync(forbidden);
                    flushed = (doc?.RootElement.TryGetProperty("synced", out var s) == true)
                        ? (s.TryGetProperty("guests", out var g) ? g.GetInt32() : 0)
                        + (s.TryGetProperty("guestBooks", out var b) ? b.GetInt32() : 0)
                        + (s.TryGetProperty("events", out var e2) ? e2.GetInt32() : 0)
                        : done.Count;
                    conflicts = cIds.Count;
                    foreach (var id in cIds)
                    {
                        if (forbidden.Contains(id)) continue;
                        await LocalDb.Instance.OutboxBumpAsync(id, "DUPLICATE_NEED_NOTE");
                    }
                }
                catch (HttpRequestException)
                {
                    return (0, 0, "offline");
                }
            }

            foreach (var op in rest)
            {
                if (op.Attempts > 25)
                {
                    await LocalDb.Instance.OutboxRemoveAsync(new[] { op.Id });
                    err ??= "too-many-attempts";
                    continue;
                }
                var r = await FlushSingleAsync(op);
                if (r.done) { await LocalDb.Instance.OutboxRemoveAsync(new[] { op.Id }); flushed++; }
                else if (r.conflict)
                {
                    conflicts++;
                    await LocalDb.Instance.OutboxBumpAsync(op.Id, "DUPLICATE_NEED_NOTE");
                    err ??= "DUPLICATE_NEED_NOTE";
                }
                else
                {
                    await LocalDb.Instance.OutboxBumpAsync(op.Id, r.error ?? "flush-failed");
                    err ??= r.error;
                    if (r.error == "offline") break;
                }
            }

            // Pull delta best-effort.
            try { await PullAsync(eventId); } catch { }
            Changed?.Invoke();
            return (flushed, conflicts, err);
        }
        catch { return (0, 0, "offline"); }
    }

    private async Task<(bool done, bool conflict, string? error)> FlushSingleAsync(OutboxOp op)
    {
        try
        {
            var payload = JsonNode.Parse(op.Payload)?.AsObject();
            var api = ApiClient.Instance;
            HttpResponseMessage r = op.Action switch
            {
                "UPDATE_GUEST" => await api.PatchJsonAsync(
                    $"/api/guests/{payload?["id"]}", payload?["fields"] ?? new JsonObject()),
                "DELETE_GUEST" => await api.DeleteAsync(
                    $"/api/guests/{payload?["id"]}"),
                "UPDATE_BOOK" => await api.PatchJsonAsync(
                    $"/api/guestbooks/{payload?["id"]}", payload?["fields"] ?? new JsonObject()),
                "DELETE_BOOK" => await api.DeleteAsync(
                    $"/api/guestbooks/{payload?["id"]}"),
                "UPDATE_EVENT" => await api.PatchJsonAsync(
                    $"/api/events/{payload?["id"]}", payload?["fields"] ?? new JsonObject()),
                "ADD_MEMBER" => await api.PostJsonAsync(
                    $"/api/events/{op.EventId}/members", payload ?? new JsonObject()),
                "SET_ROLE" => await api.PatchJsonAsync(
                    $"/api/events/{op.EventId}/members", payload ?? new JsonObject()),
                "REMOVE_MEMBER" => await api.DeleteAsync(
                    $"/api/events/{op.EventId}/members?userId={Uri.EscapeDataString($"{payload?["userId"]}")}"),
                _ => throw new InvalidOperationException($"unknown-action {op.Action}"),
            };
            var s = (int)r.StatusCode;
            if (r.IsSuccessStatusCode || s == 404) return (true, false, null);
            if (s == 409) return (false, true, null);
            if (s >= 400 && s < 500) return (true, false, $"rejected-{s}");
            return (false, false, $"HTTP {s}");
        }
        catch (HttpRequestException) { return (false, false, "offline"); }
        catch (Exception ex) { return (false, false, ex.Message); }
    }

    public async Task FlushAllAsync()
    {
        var eventIds = await LocalDb.Instance.EventIdsAsync();
        foreach (var eventId in eventIds)
        {
            try { await FlushAsync(eventId); }
            catch (Exception ex)
            {
                AppLogger.Warn($"Flush event {eventId} gagal: {ex.Message}");
            }
        }
    }

    public async Task PullAsync(string eventId)
    {
        var since = await LocalDb.Instance.GetMetaAsync($"lastPull:{eventId}") ?? "";
        var q = new Dictionary<string, string?> { ["eventId"] = eventId };
        if (!string.IsNullOrEmpty(since)) q["since"] = since;
        var doc = await ApiClient.Instance.GetAsync("/api/sync/pull?" + ApiClient.BuildQuery(q));
        if (doc == null) return;
        var root = doc.RootElement;
        EventModel? eventModel = null;
        if (root.TryGetProperty("event", out var eventJson) &&
            eventJson.ValueKind != JsonValueKind.Null)
            eventModel = eventJson.Deserialize<EventModel>(JsonOpts);

        var guests = root.TryGetProperty("guests", out var guestsJson) &&
                     guestsJson.ValueKind == JsonValueKind.Array
            ? guestsJson.Deserialize<List<GuestModel>>(JsonOpts) ?? new()
            : new List<GuestModel>();
        var books = root.TryGetProperty("guestBooks", out var booksJson) &&
                    booksJson.ValueKind == JsonValueKind.Array
            ? booksJson.Deserialize<List<GuestBookModel>>(JsonOpts) ?? new()
            : new List<GuestBookModel>();
        var deletedGuestIds = root.TryGetProperty("deletedGuestIds", out var deletedGuestsJson) &&
                              deletedGuestsJson.ValueKind == JsonValueKind.Array
            ? deletedGuestsJson.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x.Length > 0).ToList()
            : new List<string>();
        var deletedBookIds = root.TryGetProperty("deletedGuestBookIds", out var deletedBooksJson) &&
                             deletedBooksJson.ValueKind == JsonValueKind.Array
            ? deletedBooksJson.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x.Length > 0).ToList()
            : new List<string>();

        await LocalDb.Instance.MergePulledAsync(eventModel, guests, books, deletedGuestIds, deletedBookIds);
        if (root.TryGetProperty("pulledAt", out var pa))
            await LocalDb.Instance.SetMetaAsync($"lastPull:{eventId}", pa.GetString() ?? "");
    }
}
