using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;

namespace HajatManager.Views;

public sealed class CreateEventDialog : Window
{
    public string Nama = "";
    public string Tuan = "";
    public string Lokasi = "";
    public string Catatan = "";
    public DateTime? Tanggal;
    private readonly TextBox _n = new();
    private readonly TextBox _t = new();
    private readonly TextBox _l = new();
    private readonly TextBox _c = new() { AcceptsReturn = true, Height = 40 };
    private readonly DatePicker _d = new();

    public CreateEventDialog()
    {
        Title = "Acara baru";
        Width = 440;
        // Jangan fixed Height: konten (~475px) + title-bar kustom M3Chrome
        // (36px) mepet ke batas 520 sehingga baris tombol kepotong di
        // sebagian tema/skala font. Auto-fit + scroll cadangan.
        SizeToContent = SizeToContent.Height;
        try { MaxHeight = Math.Min(680, SystemParameters.WorkArea.Height - 40); }
        catch { MaxHeight = 680; }
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        SetResourceReference(BackgroundProperty, "SurfaceBrush");
        var p = new StackPanel { Margin = new Thickness(12) };
        p.Children.Add(Field("Nama acara *", _n, "Pernikahan Budi & Ani"));
        // Tuan rumah + tanggal sebaris agar dialog pendek.
        var row2 = new UniformGrid { Columns = 2, Margin = new Thickness(0, 6, 0, 0) };
        var left2 = new StackPanel { Margin = new Thickness(0, 0, 4, 0) };
        left2.Children.Add(Field("Tuan rumah *", _t, "H. Slamet"));
        var right2 = new StackPanel { Margin = new Thickness(4, 0, 0, 0) };
        right2.Children.Add(Field("Tanggal *", _d, null));
        row2.Children.Add(left2);
        row2.Children.Add(right2);
        p.Children.Add(row2);
        p.Children.Add(Field("Lokasi", _l, "Balai Desa Krajan"));
        p.Children.Add(Field("Catatan", _c, "Opsional"));
        var info = new TextBlock
        {
            Text = "Jika offline, acara disimpan lokal lalu auto-push saat online.",
            FontSize = 11, Margin = new Thickness(0, 6, 0, 0), TextWrapping = TextWrapping.Wrap
        };
        info.SetResourceReference(ForegroundProperty, "OnVariantBrush");
        p.Children.Add(info);
        var err = new TextBlock();
        err.SetResourceReference(ForegroundProperty, "ErrorBrush");
        p.Children.Add(err);
        var row = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(0, 10, 0, 0)
        };
        var batal = new Button { Content = "Batal", Margin = new Thickness(0, 0, 8, 0), MinWidth = 96, IsCancel = true };
        if (TryFindResource("TextButton") is Style tbs) batal.Style = tbs;
        batal.Click += (_, _) => DialogResult = false;
        var simpan = new Button { Content = "Simpan", MinWidth = 96, IsDefault = true };
        if (TryFindResource("PrimaryButton") is Style ps) simpan.Style = ps;
        simpan.Click += (_, _) =>
        {
            if (_n.Text.Trim().Length < 2) { err.Text = "Nama acara minimal 2 huruf"; return; }
            if (_t.Text.Trim().Length < 2) { err.Text = "Nama tuan rumah minimal 2 huruf"; return; }
            if (_d.SelectedDate == null) { err.Text = "Tanggal wajib dipilih"; return; }
            Nama = _n.Text.Trim(); Tuan = _t.Text.Trim(); Lokasi = _l.Text.Trim();
            Catatan = _c.Text.Trim(); Tanggal = _d.SelectedDate.Value.Date;
            DialogResult = true;
        };
        row.Children.Add(batal);
        row.Children.Add(simpan);
        p.Children.Add(row);
        // ScrollViewer cadangan: bila konten melebihi MaxHeight (layar kecil),
        // tombol tetap bisa dicapai via scroll alih-alih kepotong.
        Content = new ScrollViewer
        {
            Content = p,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
        };
        M3Chrome.Attach(this, dialog: true);
    }

    private static StackPanel Field(string label, Control input, string? hint)
    {
        var box = new StackPanel { Margin = new Thickness(0, 6, 0, 0) };
        var l = new TextBlock { Text = label, Margin = new Thickness(0, 0, 0, 4) };
        if (Application.Current?.TryFindResource("M3SectionTitle") is Style s) l.Style = s;
        box.Children.Add(l);
        box.Children.Add(input);
        if (!string.IsNullOrEmpty(hint))
        {
            var h = new TextBlock { Text = hint, FontSize = 11 };
            h.SetResourceReference(ForegroundProperty, "OnVariantBrush");
            box.Children.Add(h);
        }
        return box;
    }
}
