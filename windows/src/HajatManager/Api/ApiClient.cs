using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using HajatManager.Models;

namespace HajatManager.Api;

// HTTP ke backend Next.js — cermin mobile/lib/core/api_client.dart.
// Auth via cookie session Auth.js (CookieContainer otomatis simpan+kirim).
public sealed class ApiClient
{
    public static ApiClient Instance { get; } = new();
    private ApiClient()
    {
        _jar = new CookieContainer();
        var handler = new HttpClientHandler
        {
            CookieContainer = _jar,
            UseCookies = true,
            AllowAutoRedirect = true,
        };
        _http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(30) };
    }

    private readonly CookieContainer _jar;
    private readonly HttpClient _http;
    private string _baseUrl = "";

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public string BaseUrl => _baseUrl;

    public void Configure(string baseUrl)
    {
        _baseUrl = baseUrl.TrimEnd('/');
        _http.BaseAddress = new Uri(_baseUrl);
    }

    private static string Q(Dictionary<string, string?> p) =>
        string.Join("&", p.Where(kv => kv.Value != null)
            .Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value!)}"));

    public async Task<bool> HealthAsync()
    {
        try
        {
            using var r = await _http.GetAsync("/api/health");
            return r.IsSuccessStatusCode;
        }
        catch { return false; }
    }

    // ---------- auth email (replikasi flow credentials Auth.js headless) ----------
    public async Task<(bool ok, string? err)> LoginEmailAsync(string email, string password)
    {
        try
        {
            var csrfDoc = await _http.GetFromJsonAsync<JsonDocument>("/api/auth/csrf", JsonOpts);
            var csrf = csrfDoc?.RootElement.GetProperty("csrfToken").GetString() ?? "";
            var form = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["csrfToken"] = csrf,
                ["email"] = email,
                ["password"] = password,
                ["callbackUrl"] = "/dashboard",
                ["json"] = "true",
            });
            using var r = await _http.PostAsync("/api/auth/callback/credentials", form);
            if (!r.IsSuccessStatusCode) return (false, "Email / password salah");
            var body = await r.Content.ReadAsStringAsync();
            if (body.Contains("\"error\"") || body.Contains("/api/auth/error"))
                return (false, "Email / password salah");
            var s = await SessionAsync();
            return s != null ? (true, null) : (false, "Session tidak terbentuk, coba lagi");
        }
        catch (HttpRequestException) { return (false, "Tidak ada koneksi ke server"); }
        catch (Exception ex) { return (false, $"Login gagal: {ex.Message}"); }
    }

    public async Task<(bool ok, string? err)> RegisterAsync(string name, string email, string password)
    {
        try
        {
            using var r = await _http.PostAsJsonAsync("/api/register",
                new { name, email, password });
            if (!r.IsSuccessStatusCode)
            {
                var msg = await TryErrAsync(r, "Gagal daftar");
                return (false, msg);
            }
            return await LoginEmailAsync(email, password);
        }
        catch (HttpRequestException) { return (false, "Tidak ada koneksi ke server"); }
        catch (Exception ex) { return (false, $"Gagal daftar: {ex.Message}"); }
    }

    public async Task<JsonDocument?> SessionAsync()
    {
        try
        {
            var doc = await _http.GetFromJsonAsync<JsonDocument>("/api/auth/session", JsonOpts);
            if (doc == null) return null;
            if (!doc.RootElement.TryGetProperty("user", out var u) ||
                u.ValueKind == JsonValueKind.Null) return null;
            return doc;
        }
        catch { return null; }
    }

    public async Task LogoutAsync()
    {
        try
        {
            var csrfDoc = await _http.GetFromJsonAsync<JsonDocument>("/api/auth/csrf", JsonOpts);
            var csrf = csrfDoc?.RootElement.GetProperty("csrfToken").GetString() ?? "";
            var form = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["csrfToken"] = csrf,
                ["callbackUrl"] = "/",
                ["json"] = "true",
            });
            using var _ = await _http.PostAsync("/api/auth/signout", form);
        }
        catch { /* best-effort */ }
    }

    // ---------- generic helpers ----------
    public async Task<JsonDocument?> GetAsync(string path)
    {
        var doc = await _http.GetFromJsonAsync<JsonDocument>(path, JsonOpts);
        return doc;
    }

    public async Task<HttpResponseMessage> PostJsonAsync(string path, object body) =>
        await _http.PostAsJsonAsync(path, body, JsonOpts);

    public async Task<HttpResponseMessage> PatchJsonAsync(string path, object body) =>
        await _http.PatchAsJsonAsync(path, body, JsonOpts);

    public async Task<HttpResponseMessage> DeleteAsync(string path) =>
        await _http.DeleteAsync(path);

    public async Task<string?> TryErrAsync(HttpResponseMessage r, string fallback)
    {
        try
        {
            var doc = await r.Content.ReadFromJsonAsync<JsonDocument>(JsonOpts);
            if (doc != null && doc.RootElement.TryGetProperty("error", out var e))
                return e.GetString() ?? fallback;
            if (doc != null && doc.RootElement.TryGetProperty("message", out var m))
                return m.GetString() ?? fallback;
        }
        catch { }
        return $"{fallback} ({(int)r.StatusCode})";
    }

    public static string BuildQuery(Dictionary<string, string?> p) => Q(p);
}
