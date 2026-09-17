using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Authentication;
using System.Text.Json;
using HajatManager.Models;
using HajatManager.Services;

namespace HajatManager.Api;

// HTTP ke backend Next.js — cermin mobile/lib/core/api_client.dart.
// Auth via cookie session Auth.js (CookieContainer otomatis simpan+kirim).
// Fase 2: login credentials pakai client TANPA auto-redirect (cermin
// followRedirects:false di Flutter) agar ?error= Auth.js tidak hilang.
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
        // Fase 1: 12 detik (dulu 30) agar UI tidak dikira hang saat server mati.
        _http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(12) };

        // Fase 2: khusus auth — jangan follow redirect otomatis.
        // CookieContainer dipakai bersama agar cookie session tetap tersimpan.
        var authHandler = new HttpClientHandler
        {
            CookieContainer = _jar,
            UseCookies = true,
            AllowAutoRedirect = false,
        };
        _authHttp = new HttpClient(authHandler) { Timeout = TimeSpan.FromSeconds(12) };
    }

    private readonly CookieContainer _jar;
    private readonly HttpClient _http;
    private readonly HttpClient _authHttp;
    private string _baseUrl = "";

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public string BaseUrl => _baseUrl;
    public bool IsConfigured => !string.IsNullOrEmpty(_baseUrl) && _http.BaseAddress != null;

    /// Normalisasi input user: trim, tambah https:// bila tanpa skema,
    /// buang trailing '/'. Return false + err bila tetap bukan URL absolut http(s).
    public static bool TryNormalizeBaseUrl(string? raw, out string normalized, out string? err)
    {
        normalized = "";
        var v = (raw ?? "").Trim().TrimEnd('/');
        if (string.IsNullOrWhiteSpace(v))
        {
            err = "URL server kosong — isi dulu, contoh https://hajat.widihhh.my.id";
            return false;
        }
        if (!v.Contains("://", StringComparison.Ordinal))
            v = "https://" + v;
        if (!Uri.TryCreate(v, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            err = $"URL tidak valid: '{raw}'. Contoh: https://hajat.widihhh.my.id";
            return false;
        }
        normalized = uri.ToString().TrimEnd('/');
        err = null;
        return true;
    }

    /// Fase 1: tidak pernah throw — return false bila URL invalid.
    public bool TryConfigure(string? baseUrl, out string? err)
    {
        if (!TryNormalizeBaseUrl(baseUrl, out var normalized, out err))
            return false;
        _baseUrl = normalized;
        var uri = new Uri(_baseUrl);
        _http.BaseAddress = uri;
        _authHttp.BaseAddress = uri;
        err = null;
        return true;
    }

    [Obsolete("Pakai TryConfigure agar URL invalid tidak melempar exception (force-close).")]
    public void Configure(string baseUrl)
    {
        if (!TryConfigure(baseUrl, out var err))
            throw new UriFormatException(err ?? "URL server tidak valid");
    }

    private static string Q(Dictionary<string, string?> p) =>
        string.Join("&", p.Where(kv => kv.Value != null)
            .Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value!)}"));

    public async Task<bool> HealthAsync()
    {
        if (!IsConfigured) return false;
        try
        {
            using var r = await _http.GetAsync("/api/health");
            return r.IsSuccessStatusCode;
        }
        catch (InvalidOperationException) { return false; }
        catch (HttpRequestException) { return false; }
        catch (TaskCanceledException) { return false; } // timeout
        catch (Exception) { return false; }
    }

    // ---------- auth email (replikasi flow credentials Auth.js headless) ----------
    // Fase 2: cermin loginEmail() Flutter — POST tanpa follow-redirect,
    // cek field "url" / header Location mengandung ?error=, lalu konfirmasi session.
    public async Task<(bool ok, string? err)> LoginEmailAsync(string email, string password)
    {
        if (!IsConfigured)
            return (false, "Server belum dikonfigurasi — isi URL lalu tap Tes");
        email = (email ?? "").Trim().ToLowerInvariant();
        try
        {
            JsonDocument? csrfDoc;
            try
            {
                csrfDoc = await _http.GetFromJsonAsync<JsonDocument>("/api/auth/csrf", JsonOpts);
            }
            catch (HttpRequestException ex) { return (false, ClassifyNetworkError(ex)); }
            catch (TaskCanceledException) { return (false, "Server timeout — cek koneksi lalu Tes lagi"); }
            catch (Exception ex)
            {
                AppLogger.Warn($"Ambil CSRF gagal: {ex.Message}");
                return (false, "Server tidak balas CSRF — cek URL / Tes server dulu");
            }

            var csrf = "";
            try { csrf = csrfDoc?.RootElement.GetProperty("csrfToken").GetString() ?? ""; }
            catch { }
            if (string.IsNullOrEmpty(csrf))
                return (false, "CSRF kosong — server tidak balas token. Cek URL / Tes server dulu");

            var form = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["csrfToken"] = csrf,
                ["email"] = email,
                ["password"] = password,
                ["callbackUrl"] = "/dashboard",
                ["json"] = "true",
            });

            HttpResponseMessage r;
            try
            {
                r = await _authHttp.PostAsync("/api/auth/callback/credentials", form);
            }
            catch (HttpRequestException ex) { return (false, ClassifyNetworkError(ex)); }
            catch (TaskCanceledException) { return (false, "Server timeout — cek koneksi lalu Tes lagi"); }

            using (r)
            {
                var status = (int)r.StatusCode;
                var body = "";
                try { body = await r.Content.ReadAsStringAsync(); } catch { }
                var loc = r.Headers.Location?.ToString();
                if (string.IsNullOrEmpty(loc) &&
                    r.Headers.TryGetValues("Location", out var vs))
                    loc = vs.FirstOrDefault();

                // Auth.js sukses: 200 + JSON {url} TANPA ?error=.
                if (status == 200)
                {
                    if (BodyIndicatesAuthError(body))
                        return (false, "Email / password salah");
                }
                else if (status is 301 or 302 or 303 or 307 or 308)
                {
                    if ((loc ?? "").Contains("error=", StringComparison.OrdinalIgnoreCase) ||
                        BodyIndicatesAuthError(body))
                        return (false, "Email / password salah");
                    // redirect sukses tanpa error → lanjut cek session di bawah.
                }
                else if (status is 400 or 401 or 403)
                {
                    var detail = TryExtractErrorJson(body);
                    AppLogger.Warn($"Login ditolak ({status}): {detail ?? Clip(body, 200)}");
                    return (false, detail ?? "Email / password salah");
                }
                else if (status >= 500)
                {
                    AppLogger.Warn($"Login server error ({status}): {Clip(body, 200)}");
                    return (false, $"Server error ({status}) — coba lagi / hubungi admin");
                }
                else if (status is < 200 or >= 400)
                {
                    return (false, $"Login gagal ({status})");
                }

                var s = await SessionAsync();
                if (s != null) return (true, null);
                AppLogger.Warn($"Session null pasca-login {email} (status {status})");
                return (false, SessionNullHint());
            }
        }
        catch (HttpRequestException ex) { return (false, ClassifyNetworkError(ex)); }
        catch (TaskCanceledException) { return (false, "Server timeout — cek koneksi lalu Tes lagi"); }
        catch (Exception ex)
        {
            AppLogger.LogException("LoginEmail gagal", ex);
            return (false, $"Login gagal: {ex.Message}");
        }
    }

    // Fase 2: cermin register() Flutter — HANYA daftar (201/200 = sukses),
    // tanpa login ganda. LoginWindow yang memanggil LoginEmailAsync sekali setelahnya.
    public async Task<(bool ok, string? err)> RegisterAsync(string name, string email, string password)
    {
        if (!IsConfigured)
            return (false, "Server belum dikonfigurasi — isi URL lalu tap Tes");
        name = (name ?? "").Trim();
        email = (email ?? "").Trim().ToLowerInvariant();
        if (name.Length < 2) name = email; // backend: name min 2 huruf
        try
        {
            using var r = await _http.PostAsJsonAsync("/api/register",
                new { name, email, password });
            var status = (int)r.StatusCode;
            if (status is 200 or 201) return (true, null);
            var msg = await TryErrAsync(r, "Gagal daftar");
            AppLogger.Warn($"Register ditolak ({status}): {msg}");
            return (false, msg);
        }
        catch (HttpRequestException ex) { return (false, ClassifyNetworkError(ex)); }
        catch (TaskCanceledException) { return (false, "Server timeout — cek koneksi lalu Tes lagi"); }
        catch (Exception ex)
        {
            AppLogger.LogException("Register gagal", ex);
            return (false, $"Gagal daftar: {ex.Message}");
        }
    }

    public async Task<JsonDocument?> SessionAsync()
    {
        if (!IsConfigured) return null;
        // Fase 3: bila token perangkat ada, validasi via /device/me dulu.
        if (HasDeviceToken)
        {
            var me = await DeviceMeAsync();
            if (me != null) return me;
            // Token mati (revoked/expired) → jatuh ke cek cookie di bawah.
        }
        try
        {
            var doc = await _http.GetFromJsonAsync<JsonDocument>("/api/auth/session", JsonOpts);
            if (doc == null) return null;
            if (!doc.RootElement.TryGetProperty("user", out var u) ||
                u.ValueKind == JsonValueKind.Null) return null;
            return doc;
        }
        catch (InvalidOperationException) { return null; }
        catch (HttpRequestException) { return null; }
        catch (TaskCanceledException) { return null; }
        catch (JsonException) { return null; }
        catch (NotSupportedException) { return null; }
        catch (Exception) { return null; }
    }

    public async Task LogoutAsync()
    {
        if (!IsConfigured) return;
        // Fase 3: revoke token perangkat best-effort, lalu hapus lokal.
        if (HasDeviceToken)
        {
            try
            {
                using var r = await _http.PostAsJsonAsync("/api/auth/device/revoke",
                    new { self = true }, JsonOpts);
                _ = r;
            }
            catch { }
            ClearDeviceTokenLocal();
        }
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

    // ---------- Fase 3: Bearer device-token ----------

    public string? DeviceToken { get; private set; }
    public bool HasDeviceToken => !string.IsNullOrEmpty(DeviceToken);

    /// Dipanggil saat startup / setelah TryConfigure: pulihkan token dari DPAPI
    /// dan pasang header Authorization di kedua HttpClient.
    public void RestoreDeviceToken()
    {
        try
        {
            var saved = AppConfig.Instance.GetDeviceToken();
            ApplyDeviceToken(string.IsNullOrWhiteSpace(saved) ? null : saved);
        }
        catch (Exception ex)
        {
            AppLogger.Warn($"Restore token gagal: {ex.Message}");
            ApplyDeviceToken(null);
        }
    }

    private void ApplyDeviceToken(string? token)
    {
        DeviceToken = token;
        foreach (var client in new[] { _http, _authHttp })
        {
            if (string.IsNullOrEmpty(token))
                client.DefaultRequestHeaders.Authorization = null;
            else
                client.DefaultRequestHeaders.Authorization =
                    new AuthenticationHeaderValue("Bearer", token);
        }
    }

    private void SaveDeviceToken(string token)
    {
        ApplyDeviceToken(token);
        try { AppConfig.Instance.SetDeviceToken(token); }
        catch (Exception ex) { AppLogger.Warn($"Simpan token gagal: {ex.Message}"); }
    }

    private void ClearDeviceTokenLocal()
    {
        ApplyDeviceToken(null);
        try { AppConfig.Instance.ClearDeviceToken(); } catch { }
    }

    private static Dictionary<string, object?> DeviceMeta() =>
        new()
        {
            ["deviceName"] = AppConfig.DeviceLabel(),
            ["platform"] = "windows",
        };

    /// Login via /api/auth/device/authorize (tanpa cookie).
    /// notSupported=true bila server belum punya endpoint (404) → caller fallback ke cookie.
    public async Task<(bool ok, string? err, bool notSupported)> AuthorizeDeviceAsync(
        string email, string password)
    {
        if (!IsConfigured)
            return (false, "Server belum dikonfigurasi — isi URL lalu tap Tes", false);
        email = (email ?? "").Trim().ToLowerInvariant();
        var payload = new Dictionary<string, object?>
        {
            ["email"] = email,
            ["password"] = password,
            ["deviceName"] = AppConfig.DeviceLabel(),
            ["platform"] = "windows",
        };
        HttpResponseMessage r;
        try
        {
            r = await _http.PostAsJsonAsync("/api/auth/device/authorize", payload, JsonOpts);
        }
        catch (HttpRequestException ex) { return (false, ClassifyNetworkError(ex), false); }
        catch (TaskCanceledException) { return (false, "Server timeout — cek koneksi lalu Tes lagi", false); }
        catch (Exception ex)
        {
            AppLogger.LogException("AuthorizeDevice gagal", ex);
            return (false, $"Login gagal: {ex.Message}", false);
        }

        using (r)
        {
            var status = (int)r.StatusCode;
            if (status == 404)
                return (false, null, true); // server lama → fallback cookie
            var body = "";
            try { body = await r.Content.ReadAsStringAsync(); } catch { }
            if (status is 200 or 201)
            {
                try
                {
                    using var doc = JsonDocument.Parse(body);
                    var token = doc.RootElement.TryGetProperty("token", out var t)
                        ? t.GetString() ?? "" : "";
                    if (string.IsNullOrEmpty(token))
                        return (false, "Server tidak mengembalikan token", false);
                    SaveDeviceToken(token);
                    return (true, null, false);
                }
                catch (Exception ex)
                {
                    AppLogger.Warn($"Parse authorize gagal: {ex.Message}");
                    return (false, "Respons server tidak valid", false);
                }
            }
            if (status is 401 or 403) return (false, "Email / password salah", false);
            if (status == 429)
                return (false, "Terlalu banyak percobaan — tunggu 1 menit", false);
            if (status >= 500)
                return (false, $"Server error ({status}) — coba lagi / hubungi admin", false);
            return (false, TryExtractErrorJson(body) ?? $"Login gagal ({status})", false);
        }
    }

    /// Tukar cookie session valid menjadi token (migrasi sekali jalan, best-effort).
    public async Task<bool> UpgradeToDeviceTokenAsync()
    {
        if (!IsConfigured || HasDeviceToken) return HasDeviceToken;
        try
        {
            using var r = await _http.PostAsJsonAsync(
                "/api/auth/device/upgrade", DeviceMeta(), JsonOpts);
            if (!r.IsSuccessStatusCode) return false;
            var body = await r.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(body);
            var token = doc.RootElement.TryGetProperty("token", out var t)
                ? t.GetString() ?? "" : "";
            if (string.IsNullOrEmpty(token)) return false;
            SaveDeviceToken(token);
            AppLogger.Info("Upgrade cookie → device-token OK");
            return true;
        }
        catch (Exception ex)
        {
            AppLogger.Warn($"Upgrade token gagal (best-effort): {ex.Message}");
            return false;
        }
    }

    /// Fase 4: true bila server mengiklankan Google OAuth untuk native.
    public async Task<bool> GoogleAvailableAsync()
    {
        if (!IsConfigured) return false;
        try
        {
            var doc = await _http.GetFromJsonAsync<JsonDocument>(
                "/api/auth/mobile/config", JsonOpts);
            if (doc == null) return false;
            using (doc)
            {
                return doc.RootElement.TryGetProperty("googleServerClientId", out var id) &&
                       id.ValueKind == JsonValueKind.String &&
                       !string.IsNullOrEmpty(id.GetString());
            }
        }
        catch { return false; }
    }

    /// Fase 4: tukar grant (loopback browser / tempel manual) menjadi Bearer.
    public async Task<(bool ok, string? err)> ExchangeDeviceCodeAsync(string code)
    {
        if (!IsConfigured)
            return (false, "Server belum dikonfigurasi — isi URL lalu tap Tes");
        code = (code ?? "").Trim();
        if (code.Length < 20)
            return (false, "Kode tidak valid — salin ulang dari browser");
        try
        {
            using var r = await _http.PostAsJsonAsync("/api/auth/device/code",
                new Dictionary<string, object?>
                {
                    ["code"] = code,
                    ["deviceName"] = AppConfig.DeviceLabel(),
                    ["platform"] = "windows",
                }, JsonOpts);
            var status = (int)r.StatusCode;
            var body = "";
            try { body = await r.Content.ReadAsStringAsync(); } catch { }
            if (status is 200 or 201)
            {
                try
                {
                    using var doc = JsonDocument.Parse(body);
                    var token = doc.RootElement.TryGetProperty("token", out var t)
                        ? t.GetString() ?? "" : "";
                    if (string.IsNullOrEmpty(token))
                        return (false, "Server tidak mengembalikan token");
                    SaveDeviceToken(token);
                    return (true, null);
                }
                catch (Exception ex)
                {
                    AppLogger.Warn($"Parse device/code gagal: {ex.Message}");
                    return (false, "Respons server tidak valid");
                }
            }
            if (status == 429)
                return (false, "Terlalu banyak percobaan — tunggu 1 menit");
            if (status is 400 or 401)
                return (false, TryExtractErrorJson(body) ?? "Kode tidak valid / kedaluwarsa — ulangi login Google");
            if (status >= 500)
                return (false, $"Server error ({status}) — coba lagi / hubungi admin");
            return (false, TryExtractErrorJson(body) ?? $"Gagal tukar kode ({status})");
        }
        catch (HttpRequestException ex) { return (false, ClassifyNetworkError(ex)); }
        catch (TaskCanceledException) { return (false, "Server timeout — cek koneksi lalu Tes lagi"); }
        catch (Exception ex)
        {
            AppLogger.LogException("ExchangeDeviceCode gagal", ex);
            return (false, $"Gagal tukar kode: {ex.Message}");
        }
    }

    /// Validasi Bearer via /device/me. Return doc {user} atau null.
    /// 401 → token dibersihkan lokal (revoked/expired).
    public async Task<JsonDocument?> DeviceMeAsync()
    {
        if (!IsConfigured || !HasDeviceToken) return null;
        try
        {
            using var r = await _http.GetAsync("/api/auth/device/me");
            if (r.StatusCode == System.Net.HttpStatusCode.Unauthorized)
            {
                AppLogger.Warn("Device-token ditolak server (401) — dihapus lokal");
                ClearDeviceTokenLocal();
                return null;
            }
            if (!r.IsSuccessStatusCode) return null;
            var doc = await r.Content.ReadFromJsonAsync<JsonDocument>(JsonOpts);
            if (doc == null) return null;
            if (!doc.RootElement.TryGetProperty("user", out var u) ||
                u.ValueKind == JsonValueKind.Null) { doc.Dispose(); return null; }
            return doc;
        }
        catch { return null; }
    }

    // ---------- generic helpers ----------
    public async Task<JsonDocument?> GetAsync(string path)
    {
        if (!IsConfigured)
            throw new InvalidOperationException("Server belum dikonfigurasi — Tes server dulu.");
        return await _http.GetFromJsonAsync<JsonDocument>(path, JsonOpts);
    }

    private void EnsureConfigured()
    {
        if (!IsConfigured)
            throw new InvalidOperationException("Server belum dikonfigurasi — Tes server dulu.");
    }

    public async Task<HttpResponseMessage> PostJsonAsync(string path, object body)
    {
        EnsureConfigured();
        return await _http.PostAsJsonAsync(path, body, JsonOpts);
    }

    public async Task<HttpResponseMessage> PatchJsonAsync(string path, object body)
    {
        EnsureConfigured();
        return await _http.PatchAsJsonAsync(path, body, JsonOpts);
    }

    public async Task<HttpResponseMessage> DeleteAsync(string path)
    {
        EnsureConfigured();
        return await _http.DeleteAsync(path);
    }

    public async Task<string?> TryErrAsync(HttpResponseMessage r, string fallback)
    {
        try
        {
            var body = await r.Content.ReadAsStringAsync();
            return TryExtractErrorJson(body) ?? $"{fallback} ({(int)r.StatusCode})";
        }
        catch { }
        return $"{fallback} ({(int)r.StatusCode})";
    }

    public static string BuildQuery(Dictionary<string, string?> p) => Q(p);

    // ---------- Fase 2 helpers (diagnosa login/daftar) ----------

    /// True bila body Auth.js menandakan kredensial salah:
    /// JSON {url: "...?error=..."}, {error: "..."} non-null, atau redirect ke /api/auth/error.
    private static bool BodyIndicatesAuthError(string body)
    {
        if (string.IsNullOrEmpty(body)) return false;
        if (body.Contains("error=", StringComparison.OrdinalIgnoreCase)) return true;
        if (body.Contains("/api/auth/error", StringComparison.OrdinalIgnoreCase)) return true;
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.TryGetProperty("url", out var u) &&
                (u.GetString() ?? "").Contains("error=", StringComparison.OrdinalIgnoreCase))
                return true;
            if (root.TryGetProperty("error", out var e) &&
                e.ValueKind != JsonValueKind.Null &&
                e.ValueKind != JsonValueKind.Undefined)
            {
                var s = e.ValueKind == JsonValueKind.String ? e.GetString() ?? "" : e.ToString();
                if (!string.IsNullOrEmpty(s) && s != "null") return true;
            }
        }
        catch { }
        return false;
    }

    /// Ambil pesan error manusiawi dari body JSON backend
    /// ({error}, {message}, atau zod VALIDATION_ERROR {details}).
    private static string? TryExtractErrorJson(string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return null;
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.TryGetProperty("url", out var u))
            {
                var url = u.GetString() ?? "";
                if (url.Contains("error=", StringComparison.OrdinalIgnoreCase))
                    return "Email / password salah";
            }
            if (root.TryGetProperty("error", out var e))
            {
                if (e.ValueKind == JsonValueKind.String)
                {
                    var s = e.GetString() ?? "";
                    if (s == "VALIDATION_ERROR")
                        return FormatValidationDetails(root);
                    if (!string.IsNullOrEmpty(s)) return s;
                }
                else if (e.ValueKind is JsonValueKind.Object or JsonValueKind.Array)
                {
                    return e.ToString();
                }
            }
            if (root.TryGetProperty("message", out var m) &&
                m.ValueKind == JsonValueKind.String)
            {
                var s = m.GetString() ?? "";
                if (!string.IsNullOrEmpty(s)) return s;
            }
        }
        catch
        {
            var t = body.Trim();
            if (t.Length is > 0 and <= 200 && !t.StartsWith('<')) return t;
        }
        return null;
    }

    /// Ubah zod flatten {details:{fieldErrors:{name:[...],email:[...]},formErrors:[...]}}
    /// menjadi "Nama: ...; Email: ..." agar bisa ditampilkan di ErrText.
    private static string? FormatValidationDetails(JsonElement root)
    {
        try
        {
            if (!root.TryGetProperty("details", out var d)) return "Data tidak valid";
            var parts = new List<string>();
            if (d.TryGetProperty("fieldErrors", out var fe) &&
                fe.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in fe.EnumerateObject())
                {
                    var msgs = prop.Value.ValueKind == JsonValueKind.Array
                        ? string.Join(", ", prop.Value.EnumerateArray()
                            .Select(x => x.GetString() ?? x.ToString()))
                        : prop.Value.ToString();
                    if (!string.IsNullOrWhiteSpace(msgs))
                        parts.Add($"{prop.Name}: {msgs}");
                }
            }
            if (d.TryGetProperty("formErrors", out var form) &&
                form.ValueKind == JsonValueKind.Array)
            {
                foreach (var x in form.EnumerateArray())
                {
                    var s = x.GetString() ?? x.ToString();
                    if (!string.IsNullOrWhiteSpace(s)) parts.Add(s);
                }
            }
            return parts.Count > 0 ? string.Join("; ", parts) : "Data tidak valid";
        }
        catch { return "Data tidak valid"; }
    }

    /// Hint saat cookie session tidak terbentuk — penyebab klasik native:
    /// cookie __Secure- ditolak di http / proxy tanpa AUTH_TRUST_HOST.
    private static string SessionNullHint() =>
        "Session tidak terbentuk — cookie login tidak tersimpan. " +
        "Umumnya karena URL masih http (cookie __Secure- butuh https) " +
        "atau server di balik proxy tanpa AUTH_TRUST_HOST=true. " +
        "Coba URL https + Tes server, lalu login lagi";

    /// Bedakan SSL/TLS vs offline biasa agar user tidak disuruh cek WiFi
    /// padahal masalahnya sertifikat / http-vs-https.
    private static string ClassifyNetworkError(HttpRequestException ex)
    {
        var all = ex.Message + " | " + ex.InnerException?.Message;
        if (all.Contains("SSL", StringComparison.OrdinalIgnoreCase) ||
            all.Contains("TLS", StringComparison.OrdinalIgnoreCase) ||
            all.Contains("certificate", StringComparison.OrdinalIgnoreCase) ||
            all.Contains("cert", StringComparison.OrdinalIgnoreCase) ||
            all.Contains("authentication", StringComparison.OrdinalIgnoreCase) ||
            ex.InnerException is AuthenticationException)
        {
            AppLogger.Warn($"TLS gagal: {all}");
            return "Koneksi aman gagal (SSL/TLS) — pastikan URL https benar & sertifikat valid. " +
                   "Lihat log untuk detail";
        }
        return "Tidak ada koneksi ke server — cek URL / Tes server / koneksi internet";
    }

    private static string Clip(string? s, int max) =>
        string.IsNullOrEmpty(s) ? "" : (s.Length <= max ? s : s[..max] + "…");
}
