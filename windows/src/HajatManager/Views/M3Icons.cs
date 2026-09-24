using System.Windows.Controls;
using System.Windows.Media;

namespace HajatManager.Views;

// Peta ikon Segoe MDL2 Assets 1:1 dari Material Icons yang dipakai UI Linux
// (Flutter). Satu-satunya font ikon yang dipakai — JANGAN pakai emoji
// (☁/›/✓/✕) sebagai ikon karena tidak ikut tema & tidak konsisten.
public static class M3Icons
{
    public const string Font = "Segoe MDL2 Assets";

    // Navigasi / aksi umum
    public const string Back = "\uE72B";
    public const string ChevronRight = "\uE76C";
    public const string ChevronDown = "\uE70D";
    public const string Add = "\uE710";
    public const string Edit = "\uE70F";
    public const string Delete = "\uE74D";
    public const string Save = "\uE74E";
    public const string Search = "\uE71E";
    public const string Download = "\uE896";
    public const string Upload = "\uE898";
    public const string Settings = "\uE713";
    public const string Close = "\uE711";
    public const string Check = "\uE73E";

    // Domain hajatan (cermin tab/rail Flutter: bolt/book/bar_chart)
    public const string Bolt = "\uE945";      // Input/pemberian (petir)
    public const string Book = "\uE82D";      // Buku tamu
    public const string Chart = "\uE9D9";     // Rekap
    public const string People = "\uE716";    // Anggota/acara
    public const string Calendar = "\uE787";  // Tanggal
    public const string History = "\uE81C";   // Log aktivitas
    public const string Home = "\uE80F";      // Acara/beranda

    // Sync (cermin SyncButton Flutter): satu glyph, state via warna + badge.
    public const string Sync = "\uE117";
    public const string SyncError = "\uE117";  // sama, beda warna + tooltip
    public const string CloudOff = "\uE753";   // offline

    // Status / akun
    public const string Lock = "\uE72E";
    public const string Person = "\uE77B";
    public const string Mail = "\uE715";
    public const string Info = "\uE946";
    public const string Warning = "\uE7BA";
    public const string ErrorBadge = "\uE783";
    public const string Logout = "\uE8AC";

    public static TextBlock Glyph(string icon, double size = 16)
    {
        return new TextBlock
        {
            Text = icon,
            FontFamily = new FontFamily(Font),
            FontSize = size,
            VerticalAlignment = System.Windows.VerticalAlignment.Center,
        };
    }
}
