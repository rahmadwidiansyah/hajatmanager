using System.Windows;
using Microsoft.Win32;

namespace HajatManager.Services;

// Fase A: pilihan tema Terang/Gelap/Sistem (cermin ThemeController Flutter).
// Tema = ResourceDictionary yang ditukar runtime; XAML memakai
// DynamicResource sehingga seluruh window ikut tanpa restart.
public static class ThemeManager
{
    public const string System = "system";
    public const string Light = "light";
    public const string Dark = "dark";

    private const string PersonalizeKey =
        @"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";

    private static bool _hooked;

    /// Pilihan tersimpan ("system" default). Bukan hasil resolved.
    public static string Current => AppConfig.Instance.GetThemeMode();

    /// True bila tema efektif saat ini gelap.
    public static bool IsDarkEffective()
    {
        var c = Current;
        if (c == Dark) return true;
        if (c == Light) return false;
        return ResolveSystemIsDark();
    }

    /// Dipanggil sekali di awal OnStartup SEBELUM window pertama dibuat.
    public static void ApplyStartup()
    {
        try
        {
            Apply(AppConfig.Instance.GetThemeMode(), save: false);
        }
        catch (Exception ex)
        {
            AppLogger.Warn($"ApplyStartup tema gagal: {ex.Message}");
        }
        if (!_hooked)
        {
            _hooked = true;
            try { SystemEvents.UserPreferenceChanged += OnUserPreferenceChanged; }
            catch (Exception ex) { AppLogger.Warn($"Hook tema sistem gagal: {ex.Message}"); }
        }
    }

    /// Terapkan pilihan ("system"/"light"/"dark") + simpan.
    /// DynamicResource membuat seluruh window ikut tanpa restart.
    public static void Apply(string choice, bool save = true)
    {
        var c = choice == Dark ? Dark : choice == Light ? Light : System;
        var dict = c == Dark ? "Themes/Dark.xaml"
            : c == Light ? "Themes/Light.xaml"
            : ResolveSystemIsDark() ? "Themes/Dark.xaml" : "Themes/Light.xaml";
        try
        {
            var app = Application.Current;
            if (app != null)
            {
                var merged = app.Resources.MergedDictionaries;
                var themeDict = new ResourceDictionary
                {
                    Source = new Uri(dict, UriKind.Relative),
                };
                if (merged.Count == 0)
                {
                    merged.Add(themeDict);
                    merged.Add(new ResourceDictionary
                    {
                        Source = new Uri("Themes/M3Styles.xaml", UriKind.Relative),
                    });
                }
                else
                {
                    // Index 0 = token Light/Dark, sisanya (M3Styles) dipertahankan.
                    merged[0] = themeDict;
                    var hasM3 = false;
                    foreach (var m in merged)
                    {
                        if (m.Source != null && m.Source.OriginalString.Contains("M3Styles"))
                        { hasM3 = true; break; }
                    }
                    if (!hasM3)
                        merged.Add(new ResourceDictionary
                        {
                            Source = new Uri("Themes/M3Styles.xaml", UriKind.Relative),
                        });
                }
            }
        }
        catch (Exception ex)
        {
            AppLogger.LogException("Tukar tema gagal", ex);
            return;
        }
        if (save)
        {
            try { AppConfig.Instance.SetThemeMode(c); } catch { }
        }
        AppLogger.Info($"Tema: {c}");
    }

    private static void OnUserPreferenceChanged(object sender, UserPreferenceChangedEventArgs e)
    {
        // Ikut sistem secara live bila pilihan = system.
        if (e.Category is UserPreferenceCategory.General or UserPreferenceCategory.Color)
        {
            try
            {
                if (Current == System)
                    Apply(System, save: false);
            }
            catch (Exception ex)
            {
                AppLogger.Warn($"Ikut tema sistem gagal: {ex.Message}");
            }
        }
    }

    /// Baca AppsUseLightTheme (0 = gelap). Gagal baca = terang.
    public static bool ResolveSystemIsDark()
    {
        try
        {
            var v = Registry.GetValue(PersonalizeKey, "AppsUseLightTheme", 1);
            return Convert.ToInt32(v) == 0;
        }
        catch { return false; }
    }
}
