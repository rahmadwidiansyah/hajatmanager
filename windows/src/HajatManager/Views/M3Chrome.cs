using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shell;

namespace HajatManager.Views;

// Title-bar kustom M3 (cermin header-bar desktop Linux/GTK): drag, minimize,
// maximize/restore, close — selalu ikut tema aplikasi (bukan frame OS).
// Dipasang via Attach() setelah Content diisi; idempoten per Window.
//   Attach(w)              → jendela utama (min/max/close, resizable)
//   Attach(w, dialog: true) → dialog (hanya close, tidak resizable)
public static class M3Chrome
{
    private static readonly DependencyProperty AttachedProp =
        DependencyProperty.RegisterAttached(
            "M3Attached", typeof(bool), typeof(M3Chrome),
            new PropertyMetadata(false));

    public const double BarHeight = 40;

    public static void Attach(Window w, bool dialog = false)
    {
        try
        {
            if (w == null) return;
            if (w.GetValue(AttachedProp) is true) return;
            w.SetValue(AttachedProp, true);

            w.WindowStyle = WindowStyle.None;
            if (dialog) w.ResizeMode = ResizeMode.NoResize;
            WindowChrome.SetWindowChrome(w, new WindowChrome
            {
                CaptionHeight = BarHeight,
                ResizeBorderThickness = dialog ? new Thickness(0) : new Thickness(6),
                GlassFrameThickness = new Thickness(0),
                CornerRadius = new CornerRadius(0),
                UseAeroCaptionButtons = false,
            });

            var bar = BuildBar(w, dialog);

            // Bungkus konten lama agar title-bar di luar ScrollViewer/konten.
            var old = w.Content as UIElement;
            w.Content = null;
            var dock = new DockPanel { LastChildFill = true };
            DockPanel.SetDock(bar, Dock.Top);
            dock.Children.Add(bar);
            if (old != null) dock.Children.Add(old);
            w.Content = dock;
        }
        catch { /* chrome gagal = window tetap jalan dengan konten asli */ }
    }

    private static UIElement BuildBar(Window w, bool dialog)
    {
        var bar = new DockPanel
        {
            Height = BarHeight,
            LastChildFill = true,
        };
        bar.SetResourceReference(Control.BackgroundProperty, "SurfaceBrush");
        // Garis bawah 1px cermin pemisah header.
        var frame = new Border
        {
            BorderThickness = new Thickness(0, 0, 0, 1),
            Child = bar,
        };
        frame.SetResourceReference(Border.BorderBrushProperty, "OutlineBrush");

        var title = new TextBlock
        {
            Text = string.IsNullOrEmpty(w.Title) ? "Hajat Manager" : w.Title,
            FontWeight = FontWeights.SemiBold,
            FontSize = 14,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(16, 0, 0, 0),
        };
        title.SetResourceReference(TextBlock.ForegroundProperty, "OnSurfaceBrush");
        bar.Children.Add(title);

        var btns = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Right,
        };
        // Tombol caption harus hit-testable (jangan jadi area drag).
        WindowChrome.SetIsHitTestVisibleInChrome(btns, true);
        DockPanel.SetDock(btns, Dock.Right);
        bar.Children.Add(btns);

        if (!dialog)
        {
            btns.Children.Add(CaptionBtn("\uE921", "Minimize", () =>
            {
                try { SystemCommands.MinimizeWindow(w); } catch { }
            }));
            var maxBtn = CaptionBtn("\uE922", "Maximize", () =>
            {
                try
                {
                    if (w.WindowState == WindowState.Maximized) SystemCommands.RestoreWindow(w);
                    else SystemCommands.MaximizeWindow(w);
                }
                catch { }
            });
            btns.Children.Add(maxBtn);
            w.StateChanged += (_, _) =>
            {
                try { maxBtn.Content = w.WindowState == WindowState.Maximized ? "\uE923" : "\uE922"; }
                catch { }
            };
        }
        var closeBtn = CaptionBtn("\uE8BB", "Close", () =>
        {
            try { SystemCommands.CloseWindow(w); } catch { }
        }, close: true);
        btns.Children.Add(closeBtn);

        bar.MouseLeftButtonDown += (_, e) =>
        {
            try
            {
                if (e.ClickCount == 2 && !dialog)
                {
                    if (w.WindowState == WindowState.Maximized) SystemCommands.RestoreWindow(w);
                    else SystemCommands.MaximizeWindow(w);
                }
                else if (w.WindowState == WindowState.Normal) w.DragMove();
            }
            catch { }
        };

        // Kembalikan frame (dengan garis bawah) sebagai elemen dock.
        return frame;
    }

    private static Button CaptionBtn(string glyph, string tip, Action onClick, bool close = false)
    {
        var b = new Button
        {
            Content = glyph,
            ToolTip = tip,
            Cursor = Cursors.Hand,
        };
        try
        {
            if (Application.Current?.TryFindResource(close ? "M3CaptionCloseButton" : "M3CaptionButton") is Style s)
                b.Style = s;
            else
            {
                b.Width = 46; b.Height = 32;
                b.FontFamily = new FontFamily("Segoe MDL2 Assets");
                b.FontSize = 10;
            }
        }
        catch { }
        b.Click += (_, _) => { try { onClick(); } catch { } };
        return b;
    }
}
