using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace HajatManager.Services;

// Config + session + PIN — cermin app_config.dart + auth_store.dart.
// Rahasia PIN dilindungi DPAPI Windows (ganti FlutterSecureStorage).
public static class AppPaths
{
    public static string Dir
    {
        get
        {
            var d = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "HajatManager");
            Directory.CreateDirectory(d);
            return d;
        }
    }
    public static string ConfigFile => Path.Combine(Dir, "config.json");
}

public sealed class AppConfig
{
    public const string DefaultProd = "https://hajat.widihhh.my.id";

    private static readonly string[] LegacyDefaults =
    {
        "http://192.168.1.85:3000",
        "http://127.0.0.1:3000",
        "http://10.0.2.2:3000",
    };

    private Dictionary<string, string> _kv = new();
    private static AppConfig? _instance;
    public static AppConfig Instance => _instance ??= Load();

    private static AppConfig Load()
    {
        var c = new AppConfig();
        try
        {
            if (File.Exists(AppPaths.ConfigFile))
            {
                var j = File.ReadAllText(AppPaths.ConfigFile);
                c._kv = JsonSerializer.Deserialize<Dictionary<string, string>>(j)
                    ?? new();
            }
        }
        catch { }
        return c;
    }

    private void Save()
    {
        try { File.WriteAllText(AppPaths.ConfigFile, JsonSerializer.Serialize(_kv)); }
        catch { }
    }

    public string GetBaseUrl()
    {
        if (_kv.TryGetValue("base_url", out var v) && !string.IsNullOrWhiteSpace(v))
        {
            v = v.Trim();
            if (LegacyDefaults.Contains(v))
            {
                SetBaseUrl(DefaultProd);
                return DefaultProd;
            }
            return v;
        }
        return DefaultProd;
    }

    public void SetBaseUrl(string v)
    {
        _kv["base_url"] = v.Trim().TrimEnd('/');
        Save();
    }

    public string GetDeviceId()
    {
        if (_kv.TryGetValue("device_id", out var v) && !string.IsNullOrWhiteSpace(v))
            return v;
        v = $"windows-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds():x}";
        _kv["device_id"] = v;
        Save();
        return v;
    }

    public string? GetMejaFor(string eventId) =>
        _kv.TryGetValue($"meja:{eventId}", out var v) ? v : null;

    public void SetMejaFor(string eventId, string v)
    {
        _kv[$"meja:{eventId}"] = v;
        Save();
    }

    public string? GetCachedUser() =>
        _kv.TryGetValue("cached_user", out var v) ? v : null;

    public void SaveUser(string json)
    {
        _kv["cached_user"] = json;
        Save();
    }

    public void ClearUser() { _kv.Remove("cached_user"); Save(); }

    public string? GetCachedPinHash() =>
        _kv.TryGetValue(PinStoreKey, out var v) ? v : null;

    public void SetCachedPinHash(string v) { _kv[PinStoreKey] = v; Save(); }

    public void ClearPin() { _kv.Remove(PinStoreKey); Save(); }

    private const string PinStoreKey = "app_pin_hash_dpapi";

    // Fase A: pilihan tema — "system" | "light" | "dark". Default system.
    private const string ThemeModeKey = "theme_mode";

    public string GetThemeMode()
    {
        if (_kv.TryGetValue(ThemeModeKey, out var v) &&
            (v == "light" || v == "dark" || v == "system"))
            return v;
        return "system";
    }

    public void SetThemeMode(string v)
    {
        _kv[ThemeModeKey] = (v == "light" || v == "dark") ? v : "system";
        Save();
    }

    // Fase 3: Bearer device-token, dilindungi DPAPI (ganti secure storage).
    // Token mentah tidak pernah ditulis plain ke disk.
    private const string DeviceTokenKey = "device_token_dpapi";

    public string? GetDeviceToken()
    {
        if (!_kv.TryGetValue(DeviceTokenKey, out var blob)) return null;
        return PinCrypto.Unprotect(blob);
    }

    public void SetDeviceToken(string token)
    {
        _kv[DeviceTokenKey] = PinCrypto.Protect(token);
        Save();
    }

    public void ClearDeviceToken() { _kv.Remove(DeviceTokenKey); Save(); }

    public static string DeviceLabel()
    {
        try
        {
            var name = $"{Environment.MachineName} (Windows)";
            return name.Length <= 100 ? name : name[..100];
        }
        catch { return "PC Windows"; }
    }

    public int GetPinGraceMin()
    {
        if (_kv.TryGetValue("pin_grace_min", out var v) && int.TryParse(v, out var m))
            return m;
        return 5;
    }

    public void SetPinGraceMin(int m) { _kv["pin_grace_min"] = m.ToString(); Save(); }

    public long GetLastUnlockMs()
    {
        if (_kv.TryGetValue("last_unlock_ms", out var v) && long.TryParse(v, out var t))
            return t;
        return 0;
    }

    public void MarkUnlocked()
    {
        _kv["last_unlock_ms"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        Save();
    }

    public bool WithinGrace()
    {
        var g = GetPinGraceMin();
        if (g <= 0) return false;
        var last = GetLastUnlockMs();
        if (last <= 0) return false;
        return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - last < g * 60_000L;
    }
}

public static class PinCrypto
{
    // sha256(email::pin) hex — format sama dengan Flutter agar PIN lama tetap valid.
    public static string Hash(string email, string pin)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{email}::{pin}"));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    public static string Protect(string plain) =>
        Convert.ToBase64String(ProtectedData.Protect(
            Encoding.UTF8.GetBytes(plain), null, DataProtectionScope.CurrentUser));

    public static string? Unprotect(string blob)
    {
        try
        {
            return Encoding.UTF8.GetString(ProtectedData.Unprotect(
                Convert.FromBase64String(blob), null, DataProtectionScope.CurrentUser));
        }
        catch { return null; }
    }
}

public static class AuthStore
{
    public static bool HasPin() =>
        AppConfig.Instance.GetCachedPinHash() != null;

    public static void SetPin(string email, string pin) =>
        AppConfig.Instance.SetCachedPinHash(PinCrypto.Protect(PinCrypto.Hash(email, pin)));

    public static bool VerifyPin(string email, string pin)
    {
        var saved = AppConfig.Instance.GetCachedPinHash();
        if (saved == null) return false;
        return PinCrypto.Unprotect(saved) == PinCrypto.Hash(email, pin);
    }

    public static void Logout(bool keepPin = false)
    {
        AppConfig.Instance.ClearUser();
        // Fase 3: token perangkat selalu dihapus saat logout (sesi berakhir).
        AppConfig.Instance.ClearDeviceToken();
        if (!keepPin) AppConfig.Instance.ClearPin();
    }
}
