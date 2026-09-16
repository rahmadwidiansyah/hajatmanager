using System.Windows;
using System.Windows.Controls;

namespace HajatManager.Views;

public sealed class CreateEventDialog : Window
{
    public string Nama = "";
    public string Tuan = "";
    public string Lokasi = "";
    private readonly TextBox _n = new();
    private readonly TextBox _t = new();
    private readonly TextBox _l = new();

    public CreateEventDialog()
    {
        Title = "Acara baru";
        Width = 400; Height = 320;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        var p = new StackPanel { Margin = new Thickness(20) };
        p.Children.Add(new TextBlock { Text = "Nama acara *" });
        p.Children.Add(_n);
        p.Children.Add(new TextBlock { Text = "Tuan rumah", Margin = new Thickness(0, 8, 0, 0) });
        p.Children.Add(_t);
        p.Children.Add(new TextBlock { Text = "Lokasi", Margin = new Thickness(0, 8, 0, 0) });
        p.Children.Add(_l);
        p.Children.Add(new TextBlock
        {
            Text = "Jika offline, acara disimpan lokal lalu auto-push saat online.",
            FontSize = 12, Margin = new Thickness(0, 8, 0, 0), TextWrapping = TextWrapping.Wrap
        });
        var row = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(0, 12, 0, 0)
        };
        var batal = new Button { Content = "Batal", Margin = new Thickness(0, 0, 8, 0) };
        batal.Click += (_, _) => DialogResult = false;
        var simpan = new Button { Content = "Simpan" };
        simpan.Click += (_, _) =>
        {
            if (_n.Text.Trim().Length < 2) return;
            Nama = _n.Text.Trim(); Tuan = _t.Text.Trim(); Lokasi = _l.Text.Trim();
            DialogResult = true;
        };
        row.Children.Add(batal);
        row.Children.Add(simpan);
        p.Children.Add(row);
        Content = p;
    }
}
