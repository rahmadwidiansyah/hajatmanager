using System.Windows;
using System.Windows.Controls;

namespace HajatManager.Views;

// Pembangun field + kartu form cermin pola Flutter (label kecil + kartu M3).
public static class M3Field
{
    public static TextBlock Label(string text)
    {
        var t = new TextBlock { Text = text.ToUpperInvariant(), Margin = new Thickness(0, 0, 0, 4) };
        try
        {
            if (Application.Current?.TryFindResource("M3SectionTitle") is Style s) t.Style = s;
            else t.FontWeight = FontWeights.SemiBold;
        }
        catch { }
        return t;
    }

    public static Border Card(UIElement content)
    {
        var b = new Border { Child = content };
        try
        {
            if (Application.Current?.TryFindResource("M3Card") is Style s) b.Style = s;
            else b.Padding = new Thickness(12);
        }
        catch { }
        return b;
    }
}
