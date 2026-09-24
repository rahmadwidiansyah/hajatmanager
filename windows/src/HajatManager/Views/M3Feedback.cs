using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;

namespace HajatManager.Views;

// Umpan-balik non-modal cermin Flutter: showTopSnack (atas, auto-hilang),
// EmptyState (lingkaran ikon + aksi), SkeletonList (placeholder berdenyut).
// Dipakai bertahap menggantikan MessageBox untuk info/validasi ringan.
public static class M3Snack
{
    private static Window? _current;

    /// Tampilkan toast atas-tengah pemilik, hilang otomatis ±2,8 dtk.
    /// Thread-safe: boleh dipanggil dari thread mana pun.
    public static void Show(Window? owner, string message, bool isError = false)
    {
        try
        {
            var run = new Action(() => ShowInner(owner, message, isError));
            var disp = owner?.Dispatcher ?? Application.Current?.Dispatcher;
            if (disp != null && !disp.CheckAccess()) disp.Invoke(run);
            else run();
        }
        catch { }
    }

    private static Brush Res(string key, Brush fallback)
    {
        try
        {
            if (Application.Current?.TryFindResource(key) is Brush b) return b;
        }
        catch { }
        return fallback;
    }

    private static void ShowInner(Window? owner, string message, bool isError)
    {
        try { _current?.Close(); } catch { }
        _current = null;
        var text = new TextBlock
        {
            Text = message,
            Foreground = isError ? Res("OnErrorContainerBrush", Brushes.White) : Res("InverseOnSurfaceBrush", Brushes.White),
            FontFamily = new FontFamily("Segoe UI"),
            FontSize = 13,
            TextWrapping = TextWrapping.Wrap,
            MaxWidth = 400,
        };
        var card = new Border
        {
            Background = isError ? Res("ErrorContainerBrush", Brushes.DarkRed) : Res("InverseSurfaceBrush", Brushes.Black),
            BorderBrush = isError ? Res("ErrorBrush", Brushes.Red) : Res("OutlineBrush", Brushes.Gray),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(12, 8, 12, 8),
            MaxWidth = 440,
            Effect = new System.Windows.Media.Effects.DropShadowEffect
            {
                BlurRadius = 16,
                ShadowDepth = 4,
                Opacity = 0.25,
            },
            Child = text,
            Cursor = System.Windows.Input.Cursors.Hand,
        };
        var win = new Window
        {
            WindowStyle = WindowStyle.None,
            AllowsTransparency = true,
            Background = Brushes.Transparent,
            ShowInTaskbar = false,
            Topmost = true,
            ResizeMode = ResizeMode.NoResize,
            SizeToContent = SizeToContent.WidthAndHeight,
            Content = card,
        };
        card.MouseLeftButtonUp += (_, _) => { try { win.Close(); } catch { } };
        win.Loaded += (_, _) =>
        {
            try
            {
                if (owner != null)
                {
                    // Cermin showTopSnack: margin atas ~76 (di bawah top-bar).
                    win.Left = owner.Left + Math.Max(0, (owner.Width - win.ActualWidth) / 2);
                    win.Top = owner.Top + 76;
                }
            }
            catch { }
            var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(2800) };
            t.Tick += (_, _) => { t.Stop(); try { win.Close(); } catch { } };
            t.Start();
        };
        win.Closed += (_, _) => { if (ReferenceEquals(_current, win)) _current = null; };
        _current = win;
        try { win.Show(); } catch { }
    }
}

// Panel kosong cermin Flutter EmptyState: lingkaran ikon 88 + judul +
// subjudul + tombol aksi opsional.
public static class M3Empty
{
    private static Brush Res(string key, Brush fallback)
    {
        try
        {
            if (Application.Current?.TryFindResource(key) is Brush b) return b;
        }
        catch { }
        return fallback;
    }

    public static StackPanel Panel(string iconGlyph, string title, string? subtitle = null,
        string? actionText = null, Action? onAction = null)
    {
        var sp = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
        var circle = new Border
        {
            Width = 88, Height = 88, CornerRadius = new CornerRadius(44),
            Background = Res("SecondaryContainerBrush", Brushes.LightGray),
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 12),
            Child = new TextBlock
            {
                Text = iconGlyph,
                FontFamily = new FontFamily(M3Icons.Font),
                FontSize = 40,
                Foreground = Res("OnSecondaryContainerBrush", Brushes.Black),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            },
        };
        sp.Children.Add(circle);
        sp.Children.Add(new TextBlock
        {
            Text = title,
            FontWeight = FontWeights.SemiBold,
            FontSize = 15,
            Foreground = Res("OnSurfaceBrush", Brushes.Black),
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
        });
        if (!string.IsNullOrEmpty(subtitle))
            sp.Children.Add(new TextBlock
            {
                Text = subtitle,
                FontSize = 13,
                Foreground = Res("OnVariantBrush", Brushes.Gray),
                HorizontalAlignment = HorizontalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
                MaxWidth = 360,
                Margin = new Thickness(0, 4, 0, 0),
            });
        if (!string.IsNullOrEmpty(actionText) && onAction != null)
        {
            var btn = new Button
            {
                Content = actionText,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 12, 0, 0),
                MinWidth = 160,
            };
            if (Application.Current?.TryFindResource("PrimaryButton") is Style s)
                btn.Style = s;
            btn.Click += (_, _) => { try { onAction(); } catch { } };
            sp.Children.Add(btn);
        }
        return sp;
    }
}

// Placeholder loading cermin SkeletonList (denyut via animasi Opacity).
public static class M3Skeleton
{
    private static Brush Res(string key, Brush fallback)
    {
        try
        {
            if (Application.Current?.TryFindResource(key) is Brush b) return b;
        }
        catch { }
        return fallback;
    }

    public static Border Block(double width, double height, double radius = 8)
    {
        var b = new Border
        {
            Width = width, Height = height,
            CornerRadius = new CornerRadius(radius),
            Background = Res("SurfaceContainerHighBrush", Brushes.LightGray),
        };
        Pulse(b);
        return b;
    }

    public static void Pulse(FrameworkElement el)
    {
        try
        {
            var anim = new DoubleAnimation(1.0, 0.45, new Duration(TimeSpan.FromMilliseconds(900)))
            {
                AutoReverse = true,
                RepeatBehavior = RepeatBehavior.Forever,
            };
            el.BeginAnimation(UIElement.OpacityProperty, anim);
        }
        catch { }
    }
}
