using System.Collections.ObjectModel;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using HajatManager.Api;
using HajatManager.Data;
using HajatManager.Models;
using HajatManager.Services;

namespace HajatManager.Views;

public partial class EventDetailWindow : Window
{
    private EventModel _ev;
    private readonly ObservableCollection<GuestModel> _guests = new();
    private readonly ObservableCollection<GuestBookModel> _books = new();
    private string _guestQ = "";
    private string _metode = "AMPLOP";
    private string _meja = "MEJA-1";
    private TextBox? _namaBox, _alamatBox, _nominalBox, _catatanBox;
    private ComboBox? _metodeBox, _mejaBox;
    private DataGrid? _guestGrid;

    private static readonly string[] Methodes = { "AMPLOP", "QRIS", "TRANSFER" };

    public EventDetailWindow(EventModel ev)
    {
        _ev = ev;
        InitializeComponent();
        Title = ev.NamaAcara;
        TitleText.Text = ev.NamaAcara;
        RoleText.Text = ev.MyRole;
        Loaded += async (_, _) => await RefreshAsync();
    }

    private async Task RefreshAsync()
    {
        var list = await LocalDb.Instance.GuestsLocalAsync(_ev.Id);
        _guests.Clear();
        foreach (var g in list) _guests.Add(g);
        var books = await LocalDb.Instance.BooksLocalAsync(_ev.Id);
        _books.Clear();
        foreach (var b in books) _books.Add(b);
        BooksGrid.ItemsSource = _books;
        AddBookBtn.Visibility = _ev.CanEdit ? Visibility.Visible : Visibility.Collapsed;
        if (BooksGrid.Columns.Count > 2)
            BooksGrid.Columns[2].Visibility =
                _ev.CanEdit ? Visibility.Visible : Visibility.Collapsed;
        BuildInputPanel();
        await RefreshRekapAsync();
        PendingText.Text = $"Antre: {await LocalDb.Instance.OutboxCountAsync(_ev.Id)}";
    }

    // ---------- Tab Input ----------
    private void BuildInputPanel()
    {
        InputPanel.Children.Clear();
        if (!_ev.CanEdit)
        {
            var s = new TextBox { Margin = new Thickness(0, 0, 0, 8) };
            s.TextChanged += (_, _) => { _guestQ = s.Text; ApplyGuestFilter(); };
            InputPanel.Children.Add(s);
        }
        else
        {
            var grid = new UniformGrid { Columns = 2 };
            grid.Children.Add(FieldCard("Siapa yang memberi?", _namaBox = new TextBox(), "Nama (huruf saja)"));
            grid.Children.Add(FieldCard("Alamat", _alamatBox = new TextBox(), "Alamat / Desa"));
            InputPanel.Children.Add(grid);
            var grid2 = new UniformGrid { Columns = 2, Margin = new Thickness(0, 8, 0, 0) };
            _nominalBox = new TextBox();
            PreviewTextInputRegistrar.DigitsOnly(_nominalBox);
            grid2.Children.Add(FieldCard("Nominal (Rp)", _nominalBox, "100000"));
            _metodeBox = new ComboBox { ItemsSource = Methodes, SelectedItem = _metode, Margin = new Thickness(0, 0, 0, 8) };
            _catatanBox = new TextBox();
            var mc = FieldCard("Metode & Catatan", _metodeBox, null);
            var sp = new StackPanel();
            sp.Children.Add(mc);
            sp.Children.Add(FieldCard(null, _catatanBox, "Catatan (wajib jika duplikat)"));
            grid2.Children.Add(sp);
            InputPanel.Children.Add(grid2);
            _mejaBox = new ComboBox
            {
                ItemsSource = _ev.MejaList,
                SelectedItem = _meja,
                Margin = new Thickness(0, 8, 0, 0)
            };
            InputPanel.Children.Add(new TextBlock { Text = "Meja kasir" });
            InputPanel.Children.Add(_mejaBox);
            var save = new Button
            {
                Content = "Simpan (offline-first)",
                Style = (Style)FindResource("PrimaryButton"),
                Margin = new Thickness(0, 12, 0, 0),
                HorizontalAlignment = HorizontalAlignment.Right,
                MinWidth = 220,
            };
            save.Click += async (_, _) => await SaveGuestAsync();
            InputPanel.Children.Add(save);
        }
        var title = new TextBlock
        {
            Text = $"Terakhir di perangkat ini ({_guests.Count})",
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 12, 0, 8)
        };
        InputPanel.Children.Add(title);
        _guestGrid = new DataGrid
        {
            AutoGenerateColumns = false,
            IsReadOnly = true,
            MaxHeight = 420,
            HeadersVisibility = DataGridHeadersVisibility.Column,
        };
        _guestGrid.Columns.Add(new DataGridTextColumn { Header = "Nama", Binding = new System.Windows.Data.Binding("Nama"), Width = new DataGridLength(1, DataGridLengthUnitType.Star) });
        _guestGrid.Columns.Add(new DataGridTextColumn { Header = "Alamat", Binding = new System.Windows.Data.Binding("Alamat"), Width = new DataGridLength(1, DataGridLengthUnitType.Star) });
        _guestGrid.Columns.Add(new DataGridTextColumn { Header = "Nominal", Binding = new System.Windows.Data.Binding("NominalRp"), Width = 130 });
        _guestGrid.Columns.Add(new DataGridTextColumn { Header = "Metode", Binding = new System.Windows.Data.Binding("Metode"), Width = 100 });
        if (_ev.CanEdit)
        {
            var col = new DataGridTemplateColumn { Header = "Aksi", Width = 150 };
            var f = new FrameworkElementFactory(typeof(StackPanel));
            f.SetValue(StackPanel.OrientationProperty, Orientation.Horizontal);
            var eb = new FrameworkElementFactory(typeof(Button));
            eb.SetValue(Button.ContentProperty, "Edit");
            eb.AddHandler(Button.ClickEvent, new RoutedEventHandler(OnGridEdit));
            var db = new FrameworkElementFactory(typeof(Button));
            db.SetValue(Button.ContentProperty, "Hapus");
            db.SetValue(FrameworkElement.MarginProperty, new Thickness(4, 0, 0, 0));
            db.AddHandler(Button.ClickEvent, new RoutedEventHandler(OnGridDelete));
            f.AppendChild(eb);
            f.AppendChild(db);
            col.CellTemplate = new DataTemplate { VisualTree = f };
            _guestGrid.Columns.Add(col);
        }
        InputPanel.Children.Add(_guestGrid);
        ApplyGuestFilter();
    }

    private Border FieldCard(string? title, Control field, string? hint)
    {
        var sp = new StackPanel { Margin = new Thickness(8) };
        if (title != null)
            sp.Children.Add(new TextBlock { Text = title, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 6) });
        if (field is TextBox tb && hint != null)
        {
            var tip = new ToolTip { Content = hint };
            tb.ToolTip = tip;
        }
        sp.Children.Add(field);
        return new Border
        {
            Padding = new Thickness(12),
            Margin = new Thickness(0, 0, 8, 0),
            Background = (System.Windows.Media.Brush)FindResource("CardBrush"),
            BorderBrush = (System.Windows.Media.Brush)FindResource("OutlineBrush"),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(12),
            Child = sp,
        };
    }

    private void ApplyGuestFilter()
    {
        if (_guestGrid == null) return;
        var q = _guestQ.Trim().ToLowerInvariant();
        var rows = string.IsNullOrEmpty(q) ? _guests.Take(50).ToList()
            : _guests.Where(g => g.Nama.ToLowerInvariant().Contains(q) ||
                g.Alamat.ToLowerInvariant().Contains(q)).Take(50).ToList();
        _guestGrid.ItemsSource = rows.Select(g => new GuestRow(g)).ToList();
    }

    public sealed class GuestRow
    {
        private readonly GuestModel _g;
        public GuestRow(GuestModel g) => _g = g;
        public GuestModel Model => _g;
        public string Nama => _g.Nama;
        public string Alamat => _g.Alamat;
        public string NominalRp => FormatRp(_g.Nominal);
        public string Metode => _g.Metode;
        public static string FormatRp(long v) => $"Rp{v:N0}".Replace(",", ".");
    }

    private void OnGridEdit(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is GuestRow r)
            EditGuestDialog(r.Model);
    }

    private async void OnGridDelete(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is not GuestRow r) return;
        if (MessageBox.Show(this, $"Hapus {r.Nama}?", "Hapus",
                MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        await LocalDb.Instance.DeleteGuestLocalAsync(r.Model.Id);
        await LocalDb.Instance.EnqueueAsync(new OutboxOp
        {
            EventId = _ev.Id, Action = "DELETE_GUEST", TableName = "guests",
            Payload = JsonSerializer.Serialize(new { id = r.Model.Id }),
        });
        try { await ApiClient.Instance.DeleteAsync($"/api/guests/{r.Model.Id}"); } catch { }
        await RefreshAsync();
    }

    private async Task SaveGuestAsync()
    {
        var nama = TitleCase(_namaBox?.Text ?? "");
        var alamat = (_alamatBox?.Text ?? "").Trim();
        var nominalTxt = new string((_nominalBox?.Text ?? "").Where(char.IsDigit).ToArray());
        if (!long.TryParse(nominalTxt, out var nominal) || nominal <= 0 ||
            nama.Length < 2 || alamat.Length < 2)
        {
            MessageBox.Show(this, "Lengkapi nama (min 2), alamat (min 2), nominal > 0.",
                "Validasi", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        var metode = (_metodeBox?.SelectedItem as string) ?? "AMPLOP";
        var catatan = (_catatanBox?.Text ?? "").Trim();
        var id = $"gst-{Guid.NewGuid()}";
        var now = DateTime.Now;
        var email = UserEmail();
        var payload = new Dictionary<string, object?>
        {
            ["id"] = id, ["eventId"] = _ev.Id, ["nama"] = nama, ["alamat"] = alamat,
            ["nominal"] = nominal, ["metode"] = metode,
            ["catatan"] = string.IsNullOrEmpty(catatan) ? null : catatan,
            ["petugasId"] = email, ["mejaLabel"] = _mejaBox?.SelectedItem as string ?? _meja,
            ["deviceId"] = AppConfig.Instance.GetDeviceId(),
            ["createdAt"] = now.ToString("o"), ["updatedAt"] = now.ToString("o"),
        };
        await LocalDb.Instance.InsertGuestAsync(new GuestModel
        {
            Id = id, EventId = _ev.Id, Nama = nama, Alamat = alamat, Nominal = nominal,
            Metode = metode, Catatan = string.IsNullOrEmpty(catatan) ? null : catatan,
            PetugasId = email, MejaLabel = _mejaBox?.SelectedItem as string,
            DeviceId = AppConfig.Instance.GetDeviceId(), CreatedAt = now, UpdatedAt = now,
        });
        await LocalDb.Instance.EnqueueAsync(new OutboxOp
        {
            Id = id, EventId = _ev.Id, Action = "CREATE_GUEST",
            TableName = "guests", Payload = JsonSerializer.Serialize(payload),
        });
        try
        {
            using var r = await ApiClient.Instance.PostJsonAsync(
                $"/api/events/{_ev.Id}/guests", payload);
            if (r.IsSuccessStatusCode) await LocalDb.Instance.OutboxRemoveAsync(new[] { id });
        }
        catch { }
        _namaBox!.Text = ""; _alamatBox!.Text = "";
        _nominalBox!.Text = ""; _catatanBox!.Text = "";
        await RefreshAsync();
    }

    private void EditGuestDialog(GuestModel g)
    {
        var nb = new TextBox { Text = g.Nama, Margin = new Thickness(0, 0, 0, 8) };
        var ab = new TextBox { Text = g.Alamat, Margin = new Thickness(0, 0, 0, 8) };
        var nob = new TextBox { Text = g.Nominal.ToString(), Margin = new Thickness(0, 0, 0, 8) };
        PreviewTextInputRegistrar.DigitsOnly(nob);
        var win = new Window
        {
            Title = "Edit Pemberian", Width = 380, Height = 300,
            WindowStartupLocation = WindowStartupLocation.CenterOwner, Owner = this,
            Content = new StackPanel
            {
                Margin = new Thickness(20),
                Children = {
                    new TextBlock { Text = "Nama" }, nb,
                    new TextBlock { Text = "Alamat" }, ab,
                    new TextBlock { Text = "Nominal" }, nob,
                    new Button { Content = "Simpan", Margin = new Thickness(0, 12, 0, 0) },
                }
            }
        };
        ((Button)((StackPanel)win.Content).Children[^1]).Click += async (_, _) =>
        {
            var fields = new Dictionary<string, object?>
            {
                ["nama"] = TitleCase(nb.Text), ["alamat"] = ab.Text.Trim(),
            };
            if (long.TryParse(new string(nob.Text.Where(char.IsDigit).ToArray()), out var n) && n > 0)
                fields["nominal"] = n;
            await LocalDb.Instance.UpdateGuestLocalAsync(g.Id, fields);
            await LocalDb.Instance.EnqueueAsync(new OutboxOp
            {
                EventId = _ev.Id, Action = "UPDATE_GUEST", TableName = "guests",
                Payload = JsonSerializer.Serialize(new { id = g.Id, fields }),
            });
            try { await ApiClient.Instance.PatchJsonAsync($"/api/guests/{g.Id}", fields); }
            catch { }
            win.Close();
            await RefreshAsync();
        };
        win.ShowDialog();
    }

    // ---------- Tab Buku ----------
    private void OnBookSearch(object sender, TextChangedEventArgs e)
    {
        var q = BookSearch.Text.Trim().ToLowerInvariant();
        BooksGrid.ItemsSource = string.IsNullOrEmpty(q) ? _books
            : _books.Where(b => b.Nama.ToLowerInvariant().Contains(q) ||
                b.Alamat.ToLowerInvariant().Contains(q)).ToList();
        AddBookBtn.Visibility = _ev.CanEdit ? Visibility.Visible : Visibility.Collapsed;
    }

    private async void OnAddBook(object sender, RoutedEventArgs e)
    {
        var n = new TextBox(); var a = new TextBox();
        var win = new Window
        {
            Title = "Buku tamu baru", Width = 360, Height = 260,
            WindowStartupLocation = WindowStartupLocation.CenterOwner, Owner = this,
            Content = new StackPanel
            {
                Margin = new Thickness(20),
                Children = {
                    new TextBlock { Text = "Nama" }, n,
                    new TextBlock { Text = "Alamat", Margin = new Thickness(0,8,0,0) }, a,
                    new Button { Content = "Simpan", Margin = new Thickness(0, 12, 0, 0) },
                }
            }
        };
        ((Button)((StackPanel)win.Content).Children[^1]).Click += async (_, _) =>
        {
            if (n.Text.Trim().Length < 2 || a.Text.Trim().Length < 2) return;
            var id = $"bk-{Guid.NewGuid()}";
            var payload = new Dictionary<string, object?>
            {
                ["id"] = id, ["eventId"] = _ev.Id,
                ["nama"] = TitleCase(n.Text), ["alamat"] = a.Text.Trim(),
                ["createdAt"] = DateTime.Now.ToString("o"),
            };
            await LocalDb.Instance.InsertBookAsync(new GuestBookModel
            {
                Id = id, EventId = _ev.Id, Nama = TitleCase(n.Text),
                Alamat = a.Text.Trim(), CreatedAt = DateTime.Now,
            });
            await LocalDb.Instance.EnqueueAsync(new OutboxOp
            {
                Id = id, EventId = _ev.Id, Action = "CREATE_BOOK",
                TableName = "guest_books", Payload = JsonSerializer.Serialize(payload),
            });
            try
            {
                using var r = await ApiClient.Instance.PostJsonAsync(
                    $"/api/events/{_ev.Id}/guestbooks",
                    new { nama = payload["nama"], alamat = payload["alamat"] });
                if (r.IsSuccessStatusCode) await LocalDb.Instance.OutboxRemoveAsync(new[] { id });
            }
            catch { }
            win.Close();
            await RefreshAsync();
        };
        win.ShowDialog();
    }

    private void OnEditBook(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is not GuestBookModel b) return;
        var n = new TextBox { Text = b.Nama, Margin = new Thickness(0, 0, 0, 8) };
        var a = new TextBox { Text = b.Alamat, Margin = new Thickness(0, 0, 0, 8) };
        var win = new Window
        {
            Title = "Edit buku tamu", Width = 360, Height = 260,
            WindowStartupLocation = WindowStartupLocation.CenterOwner, Owner = this,
            Content = new StackPanel
            {
                Margin = new Thickness(20),
                Children = { new TextBlock { Text = "Nama" }, n,
                    new TextBlock { Text = "Alamat", Margin = new Thickness(0,8,0,0) }, a,
                    new Button { Content = "Simpan", Margin = new Thickness(0, 12, 0, 0) } }
            }
        };
        ((Button)((StackPanel)win.Content).Children[^1]).Click += async (_, _) =>
        {
            var fields = new Dictionary<string, object?>
                { ["nama"] = TitleCase(n.Text), ["alamat"] = a.Text.Trim() };
            await LocalDb.Instance.UpdateBookLocalAsync(b.Id, TitleCase(n.Text), a.Text.Trim());
            await LocalDb.Instance.EnqueueAsync(new OutboxOp
            {
                EventId = _ev.Id, Action = "UPDATE_BOOK", TableName = "guest_books",
                Payload = JsonSerializer.Serialize(new { id = b.Id, fields }),
            });
            try { await ApiClient.Instance.PatchJsonAsync($"/api/guestbooks/{b.Id}", fields); }
            catch { }
            win.Close();
            await RefreshAsync();
        };
        win.ShowDialog();
    }

    private async void OnDeleteBook(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is not GuestBookModel b) return;
        if (MessageBox.Show(this, $"Hapus {b.Nama}?", "Hapus",
                MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        await LocalDb.Instance.DeleteBookLocalAsync(b.Id);
        await LocalDb.Instance.EnqueueAsync(new OutboxOp
        {
            EventId = _ev.Id, Action = "DELETE_BOOK", TableName = "guest_books",
            Payload = JsonSerializer.Serialize(new { id = b.Id }),
        });
        try { await ApiClient.Instance.DeleteAsync($"/api/guestbooks/{b.Id}"); } catch { }
        await RefreshAsync();
    }

    private async void OnSync(object sender, RoutedEventArgs e)
    {
        await SyncEngine.Instance.FlushAsync(_ev.Id);
        await RefreshAsync();
    }

    // ---------- Tab Rekap ----------
    public sealed class RekapRow
    {
        public string Label { get; set; } = "";
        public int Jumlah { get; set; }
        public string TotalRp { get; set; } = "";
    }

    private async Task RefreshRekapAsync()
    {
        try
        {
            var doc = await ApiClient.Instance.GetAsync($"/api/events/{_ev.Id}/rekap");
            if (doc == null) return;
            var r = doc.RootElement;
            TotalTamuText.Text = $"{r.GetProperty("totalTamu").GetInt32()} tamu";
            TotalNominalText.Text = GuestRow.FormatRp(r.GetProperty("totalNominal").GetInt64());
            AlamatGrid.ItemsSource = r.GetProperty("perAlamat").EnumerateArray().Select(x => new RekapRow
            {
                Label = x.GetProperty("alamat").GetString() ?? "",
                Jumlah = x.GetProperty("jumlah").GetInt32(),
                TotalRp = GuestRow.FormatRp(x.GetProperty("total").GetInt64()),
            }).ToList();
            MetodeGrid.ItemsSource = r.GetProperty("perMetode").EnumerateArray().Select(x => new RekapRow
            {
                Label = x.GetProperty("metode").GetString() ?? "",
                Jumlah = x.GetProperty("jumlah").GetInt32(),
                TotalRp = GuestRow.FormatRp(x.GetProperty("total").GetInt64()),
            }).ToList();
        }
        catch
        {
            // Offline: hitung dari SQLite lokal.
            var total = _guests.Sum(g => g.Nominal);
            TotalTamuText.Text = $"{_guests.Count} tamu (lokal)";
            TotalNominalText.Text = GuestRow.FormatRp(total);
            AlamatGrid.ItemsSource = _guests.GroupBy(g => g.Alamat).Select(g => new RekapRow
            {
                Label = g.Key, Jumlah = g.Count(),
                TotalRp = GuestRow.FormatRp(g.Sum(x => x.Nominal)),
            }).ToList();
            MetodeGrid.ItemsSource = _guests.GroupBy(g => g.Metode).Select(g => new RekapRow
            {
                Label = g.Key, Jumlah = g.Count(),
                TotalRp = GuestRow.FormatRp(g.Sum(x => x.Nominal)),
            }).ToList();
        }
    }

    private async void OnExport(object sender, RoutedEventArgs e)
    {
        var dlg = new Microsoft.Win32.SaveFileDialog
        {
            FileName = $"{_ev.NamaAcara}-pemberian-{DateTime.Now:yyyy-MM-dd}.pdf",
            Filter = "PDF (*.pdf)|*.pdf|Excel (*.xlsx)|*.xlsx",
        };
        if (dlg.ShowDialog() != true) return;
        try
        {
            if (dlg.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
                Services.Exporter.ExportXlsx(dlg.FileName, _ev, _guests.ToList());
            else
                Services.Exporter.ExportPdf(dlg.FileName, _ev, _guests.ToList());
            MessageBox.Show(this, $"Tersimpan: {dlg.FileName}", "Export",
                MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, $"Export gagal: {ex.Message}", "Export",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void OnOpenLog(object sender, RoutedEventArgs e) =>
        new LogWindow(_ev.Id, _ev.NamaAcara).ShowDialog();

    private async void OnOpenSettings(object sender, RoutedEventArgs e)
    {
        new SettingsWindow(_ev).ShowDialog();
        await RefreshAsync();
    }

    private static string TitleCase(string s)
    {
        if (string.IsNullOrWhiteSpace(s)) return s;
        return string.Join(" ", s.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(w => char.ToUpperInvariant(w[0]) + (w.Length > 1 ? w[1..].ToLowerInvariant() : "")));
    }

    private static string UserEmail()
    {
        try
        {
            return JsonDocument.Parse(AppConfig.Instance.GetCachedUser() ?? "{}")
                .RootElement.GetProperty("email").GetString() ?? "lokal";
        }
        catch { return "lokal"; }
    }
}

// Batasi input hanya digit (kolom nominal) — cermin digitsOnly Flutter.
public static class PreviewTextInputRegistrar
{
    public static void DigitsOnly(TextBox box)
    {
        box.PreviewTextInput += (_, e) =>
        {
            e.Handled = !e.Text.All(char.IsDigit);
        };
        System.Windows.DataObject.AddPastingHandler(box, (s, e) =>
        {
            if (e.DataObject.GetDataPresent(typeof(string)))
            {
                var t = (e.DataObject.GetData(typeof(string)) as string) ?? "";
                if (!t.All(char.IsDigit)) e.CancelCommand();
            }
            else e.CancelCommand();
        });
    }
}
