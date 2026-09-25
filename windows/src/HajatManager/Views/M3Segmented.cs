using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace HajatManager.Views;

// Segmented control M3 cermin Flutter SegmentedButton (dipakai untuk
// pilihan Terang/Gelap/Sistem). Single-select; callback saat pilihan berubah.
public sealed class M3Segmented : Border
{
    private readonly List<Button> _buttons = new();
    private int _selected;

    public int Selected
    {
        get => _selected;
        set { if (value >= 0 && value < _buttons.Count) Select(value, fire: false); }
    }

    public event Action<int>? SelectionChanged;

    private M3Segmented()
    {
        CornerRadius = new CornerRadius(8);
        Padding = new Thickness(4);
        SetResourceReference(BackgroundProperty, "SurfaceContainerHighBrush");
        BorderThickness = new Thickness(0);
        SnapsToDevicePixels = true;
        _panel = new StackPanel { Orientation = Orientation.Horizontal };
        Child = _panel;
    }

    private readonly StackPanel _panel;

    public static M3Segmented Build(IList<(string label, string? icon)> segments, int selected, Action<int> onSelect)
    {
        var seg = new M3Segmented();
        for (var i = 0; i < segments.Count; i++)
        {
            var idx = i;
            var (label, icon) = segments[i];
            var btn = new Button
            {
                Margin = new Thickness(2),
                Padding = new Thickness(10, 5, 10, 5),
                FontWeight = FontWeights.SemiBold,
                Cursor = System.Windows.Input.Cursors.Hand,
            };
            if (Application.Current?.TryFindResource("PrimaryButton") is Style s)
                btn.Style = s;
            if (icon != null)
            {
                var sp = new StackPanel { Orientation = Orientation.Horizontal };
                sp.Children.Add(new TextBlock
                {
                    Text = icon,
                    FontFamily = new FontFamily(M3Icons.Font),
                    FontSize = 14,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(0, 0, 4, 0),
                });
                sp.Children.Add(new TextBlock { Text = label, VerticalAlignment = VerticalAlignment.Center });
                btn.Content = sp;
            }
            else btn.Content = label;
            btn.Click += (_, _) => seg.Select(idx, fire: true);
            seg._buttons.Add(btn);
            seg._panel.Children.Add(btn);
        }
        seg.SelectionChanged += onSelect;
        seg.Select(selected, fire: false);
        return seg;
    }

    private static Brush Res(string key)
    {
        try
        {
            if (Application.Current?.TryFindResource(key) is Brush b) return b;
        }
        catch { }
        return Brushes.Gray;
    }

    private void Select(int idx, bool fire)
    {
        _selected = idx;
        for (var i = 0; i < _buttons.Count; i++)
        {
            var b = _buttons[i];
            if (i == idx)
            {
                b.Background = Res("PrimaryBrush");
                b.Foreground = Res("OnPrimaryBrush");
            }
            else
            {
                b.Background = Brushes.Transparent;
                b.Foreground = Res("OnVariantBrush");
            }
        }
        if (fire)
        {
            try { SelectionChanged?.Invoke(idx); } catch { }
        }
    }
}
