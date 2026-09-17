using System.Windows;
using System.Windows.Media;

namespace HajatManager.Views;

// Helper token cermin App.xaml (/globals.css web) — agar code-behind
// tidak hardcode warna (mis. Brushes.Red).
public static class Ui
{
    private static Brush Res(string key, Brush fallback) =>
        (Brush)(Application.Current?.TryFindResource(key) ?? fallback);

    public static Brush ErrorBrush => Res("ErrorBrush", Brushes.Red);
    public static Brush WarnBrush => Res("WarningBrush", Brushes.DarkOrange);
    public static Brush InfoBrush => Res("InfoBrush", Brushes.SteelBlue);
}
