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
    private readonly List<MemberModel> _members = new();
    private readonly List<NameAddrTop> _alamatTops = new();
    private readonly List<NominalTop> _nominalTops = new();
    private string _guestQ = "";
    private string? _mejaFilter;
    private string? _kasirFilter;
    private string _sortBy = "Waktu";
    private bool _sortDesc = true;
    private int _guestLimit = 50;
    private int _bookLimit = 50;
    private string _metode = "AMPLOP";
    private string _meja = "MEJA-1";
    private TextBox? _namaBox, _alamatBox, _nominalBox, _catatanBox, _guestSearchBox;
    private TextBlock? _nominalPreview, _dupBannerText, _guestFooter;
    private Border? _dupBanner;
    private Button? _saveBtn, _guestMoreBtn;
    private ComboBox? _metodeBox, _mejaBox, _mejaFilterBox, _kasirFilterBox, _sortBox, _orderBox;
    private WrapPanel? _alamatChips, _nominalChips;
    private Popup? _suggestPopup;
    private ListBox? _suggestList;
    private List<GuestBookModel> _suggestItems = new();
    private int _suggestHi = -1;
    private System.Windows.Threading.DispatcherTimer? _suggestTimer, _dupTimer;
    private (string nama, string nominalFormatted)? _liveDup;
    private DataGrid? _guestGrid;

    private static readonly string[] Methodes = { "AMPLOP", "QRIS", "TRANSFER" };

    public EventDetailWindow(EventModel ev)
    {
        _ev = ev;
        InitializeComponent();
        Title = ev.NamaAcara;
        TitleText.Text = ev.NamaAcara;
        RoleText.Text = ev.MyRole;
        SizeChanged += (_, e) =>
        {
            if (RekapGrid != null)
                RekapGrid.Columns = e.NewSize.Width < 900 ? 1 : 2;
        };
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
        RecalcTopsLocal();
        ApplyBookFilter();
        AddBookBtn.Visibility = _ev.CanEdit ? Visibility.Visible : Visibility.Collapsed;
        if (BooksGrid.Columns.Count > 3)
            BooksGrid.Columns[3].Visibility =
                _ev.CanEdit ? Visibility.Visible : Visibility.Collapsed;
        BuildInputPanel();
        await LoadMembersAndShortcutsAsync();
        RefreshChips();
        ApplyGuestFilter();
        await RefreshRekapAsync();
        // Fase 5: status online + antre konsisten seperti MainWindow.
        var online = await SyncEngine.Instance.CheckNowAsync();
        PendingText.Text =
            $"Antre: {await LocalDb.Instance.OutboxCountAsync(_ev.Id)} • " +
            (online ? "Online ✓" : "Offline ✗");
    }

    private void RecalcTopsLocal()
    {
        _alamatTops.Clear();
        _nominalTops.Clear();
        foreach (var g in _guests.GroupBy(x => x.Alamat).OrderByDescending(g => g.Count()).Take(4))
            _alamatTops.Add(new NameAddrTop { Label = g.Key, Jumlah = g.Count() });
        foreach (var g in _guests.Where(x => x.Nominal > 0).GroupBy(x => x.Nominal).OrderByDescending(g => g.Count()).Take(4))
            _nominalTops.Add(new NominalTop { Nominal = g.Key, Jumlah = g.Count() });
    }

    private async Task LoadMembersAndShortcutsAsync()
    {
        try
        {
            var doc = await ApiClient.Instance.GetAsync($"/api/events/{_ev.Id}");
            if (doc != null)
            {
                using (doc)
                {
                    var r = doc.RootElement;
                    if (r.TryGetProperty("mejaList", out var ml) && ml.ValueKind == JsonValueKind.Array)
                    {
                        var lists = ml.EnumerateArray().Select(x => x.GetString() ?? "").Where(s => s != "").ToList();
                        if (lists.Count > 0)
                        {
                            _ev.MejaList = lists;
                            if (!_ev.MejaList.Contains(_meja)) _meja = _ev.MejaList.First();
                        }
                    }
                    if (r.TryGetProperty("members", out var mm) && mm.ValueKind == JsonValueKind.Array)
                    {
                        _members.Clear();
                        foreach (var m in mm.EnumerateArray())
                        {
                            try
                            {
                                var user = m.TryGetProperty("user", out var u) ? u : default;
                                var uid = user.ValueKind == JsonValueKind.Object && user.TryGetProperty("id", out var id)
                                    ? id.GetString() ?? "" : m.TryGetProperty("userId", out var mu) ? mu.GetString() ?? "" : "";
                                var nm = user.ValueKind == JsonValueKind.Object && user.TryGetProperty("name", out var nn)
                                    ? nn.GetString() ?? "" : "";
                                if (string.IsNullOrEmpty(nm) && user.ValueKind == JsonValueKind.Object && user.TryGetProperty("email", out var em))
                                    nm = em.GetString() ?? "";
                                _members.Add(new MemberModel
                                {
                                    UserId = uid,
                                    Role = m.TryGetProperty("role", out var rl) ? rl.GetString() ?? "VIEWER" : "VIEWER",
                                    Name = nm, Email = nm,
                                });
                            }
                            catch { }
                        }
                    }
                }
            }
        }
        catch { }
        try
        {
            var s = await ApiClient.Instance.GetAsync($"/api/events/{_ev.Id}/guests/shortcuts");
            if (s != null)
            {
                using (s)
                {
                    var r = s.RootElement;
                    if (r.TryGetProperty("alamatTop", out var at) && at.ValueKind == JsonValueKind.Array)
                    {
                        _alamatTops.Clear();
                        foreach (var e in at.EnumerateArray().Take(4))
                            _alamatTops.Add(new NameAddrTop
                            {
                                Label = e.TryGetProperty("alamat", out var a) ? a.GetString() ?? "" : "",
                                Jumlah = e.TryGetProperty("jumlah", out var j) ? j.GetInt32() : 0,
                            });
                    }
                    if (r.TryGetProperty("nominalTop", out var nt) && nt.ValueKind == JsonValueKind.Array)
                    {
                        _nominalTops.Clear();
                        foreach (var e in nt.EnumerateArray().Take(4))
                            _nominalTops.Add(new NominalTop
                            {
                                Nominal = e.TryGetProperty("nominal", out var n) ? n.GetInt64() : 0,
                                Jumlah = e.TryGetProperty("jumlah", out var j) ? j.GetInt32() : 0,
                            });
                    }
                }
            }
        }
        catch { }
    }

    private string KasirName(GuestModel g)
    {
        var pid = g.PetugasId ?? "";
        if (string.IsNullOrEmpty(pid)) return "—";
        var m = _members.FirstOrDefault(x => x.UserId == pid);
        if (m != null && !string.IsNullOrEmpty(m.Name)) return m.Name;
        if (pid == "lokal") return "lokal";
        return pid.Length > 12 ? pid[..12] + "…" : pid;
    }

    private static bool IsPendingGuest(GuestModel g) =>
        (g.Id ?? "").StartsWith("gst-", StringComparison.Ordinal) || g.PetugasId == "lokal";

    // ---------- Tab Input (porting Linux/tablet) ----------
    private void BuildInputPanel()
    {
        InputPanel.Children.Clear();
        _suggestTimer?.Stop();
        _dupTimer?.Stop();
        if (!_ev.CanEdit)
        {
            _guestSearchBox = new TextBox { Margin = new Thickness(0, 0, 0, 8) };
            _guestSearchBox.TextChanged += (_, _) => { _guestQ = _guestSearchBox.Text; _guestLimit = 50; ApplyGuestFilter(); };
            InputPanel.Children.Add(_guestSearchBox);
            InputPanel.Children.Add(BuildFilterBar());
        }
        else
        {
            // Meja kasir paling atas.
            _mejaBox = new ComboBox
            {
                ItemsSource = _ev.MejaList,
                SelectedItem = _ev.MejaList.Contains(_meja) ? _meja : _ev.MejaList.FirstOrDefault() ?? "MEJA-1",
                Margin = new Thickness(0, 0, 0, 0)
            };
            _mejaBox.SelectionChanged += (_, _) => { _meja = _mejaBox.SelectedItem as string ?? _meja; };
            var mejaCard = FieldCard("Meja kasir", _mejaBox, null);
            InputPanel.Children.Add(mejaCard);

            var grid = new UniformGrid { Columns = 2 };
            _namaBox = new TextBox();
            _namaBox.ToolTip = "Ketik 2 huruf • ↑↓ pilih • Enter isi • Esc tutup";
            _namaBox.TextChanged += OnNamaTextChanged;
            _namaBox.PreviewKeyDown += OnNamaPreviewKey;
            var namaStack = new StackPanel();
            namaStack.Children.Add(_namaBox);
            _suggestList = new ListBox { MaxHeight = 220, MinWidth = 260 };
            _suggestList.MouseDoubleClick += (_, _) => SelectSuggestHi();
            _suggestList.PreviewKeyDown += OnNamaPreviewKey;
            var suggestBorder = new Border
            {
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(4),
                Child = _suggestList,
            };
            suggestBorder.SetResourceReference(Border.BackgroundProperty, "CardBrush");
            suggestBorder.SetResourceReference(Border.BorderBrushProperty, "OutlineBrush");
            _suggestPopup = new Popup
            {
                Child = suggestBorder,
                PlacementTarget = _namaBox,
                Placement = PlacementMode.Bottom,
                StaysOpen = false,
            };
            // Popup mandiri (jangan masuk StackPanel.Children — Popup bukan UIElement panel).
            grid.Children.Add(FieldCard("Siapa yang memberi? — Nama (huruf saja)", namaStack, null));

            _alamatBox = new TextBox();
            _alamatBox.TextChanged += (_, _) => ScheduleDupCheck();
            var alamatStack = new StackPanel();
            alamatStack.Children.Add(_alamatBox);
            _alamatChips = new WrapPanel { Margin = new Thickness(0, 8, 0, 0) };
            alamatStack.Children.Add(_alamatChips);
            grid.Children.Add(FieldCard("Alamat / Desa", alamatStack, null));
            InputPanel.Children.Add(grid);

            var grid2 = new UniformGrid { Columns = 2, Margin = new Thickness(0, 8, 0, 0) };
            var nomStack = new StackPanel();
            _nominalPreview = new TextBlock { FontWeight = FontWeights.Bold, HorizontalAlignment = HorizontalAlignment.Right };
            nomStack.Children.Add(_nominalPreview);
            _nominalBox = new TextBox();
            PreviewTextInputRegistrar.DigitsOnly(_nominalBox);
            _nominalBox.TextChanged += (_, _) =>
            {
                var t = new string((_nominalBox.Text ?? "").Where(char.IsDigit).ToArray());
                _nominalPreview.Text = long.TryParse(t, out var n) && n > 0 ? GuestRow.FormatRp(n) : "";
                RefreshChips();
            };
            nomStack.Children.Add(_nominalBox);
            _nominalChips = new WrapPanel { Margin = new Thickness(0, 8, 0, 0) };
            nomStack.Children.Add(_nominalChips);
            grid2.Children.Add(FieldCard("Nominal (Rp)", nomStack, "100000"));
            _metodeBox = new ComboBox { ItemsSource = Methodes, SelectedItem = _metode, Margin = new Thickness(0, 0, 0, 8) };
            _metodeBox.SelectionChanged += (_, _) => { _metode = _metodeBox.SelectedItem as string ?? _metode; };
            _catatanBox = new TextBox();
            _catatanBox.TextChanged += (_, _) => RefreshDupBanner();
            var mc = FieldCard("Metode & Catatan", _metodeBox, null);
            var sp = new StackPanel();
            sp.Children.Add(mc);
            sp.Children.Add(FieldCard(null, _catatanBox, "Catatan (wajib jika duplikat)"));
            grid2.Children.Add(sp);
            InputPanel.Children.Add(grid2);

            _dupBanner = new Border
            {
                Padding = new Thickness(12),
                Margin = new Thickness(0, 12, 0, 0),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(12),
                Visibility = Visibility.Collapsed,
            };
            _dupBannerText = new TextBlock { TextWrapping = TextWrapping.Wrap };
            _dupBanner.Child = _dupBannerText;
            _dupBanner.SetResourceReference(Border.BackgroundProperty, "CardBrush");
            _dupBanner.SetResourceReference(Border.BorderBrushProperty, "OutlineBrush");
            InputPanel.Children.Add(_dupBanner);

            _saveBtn = new Button
            {
                Content = "Simpan (offline-first)",
                Style = (Style)FindResource("PrimaryButton"),
                Margin = new Thickness(0, 12, 0, 0),
                HorizontalAlignment = HorizontalAlignment.Right,
                MinWidth = 220,
            };
            _saveBtn.Click += async (_, _) => await SaveGuestAsync();
            InputPanel.Children.Add(_saveBtn);

            // Search + filter editor (cermin web + mobile).
            var title0 = new TextBlock { Text = "Cari & filter", FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 12, 0, 8) };
            InputPanel.Children.Add(title0);
            _guestSearchBox = new TextBox { Margin = new Thickness(0, 0, 0, 8) };
            _guestSearchBox.TextChanged += (_, _) => { _guestQ = _guestSearchBox.Text; _guestLimit = 50; ApplyGuestFilter(); };
            InputPanel.Children.Add(_guestSearchBox);
            InputPanel.Children.Add(BuildFilterBar());
            RefreshChips();
            RefreshDupBanner();
        }
        var title = new TextBlock
        {
            Text = $"Terakhir di perangkat ini",
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
        _guestGrid.Columns.Add(new DataGridTextColumn { Header = "#", Binding = new System.Windows.Data.Binding("No"), Width = 50 });
        _guestGrid.Columns.Add(new DataGridTextColumn { Header = "Nama", Binding = new System.Windows.Data.Binding("NamaFull"), Width = new DataGridLength(1, DataGridLengthUnitType.Star) });
        _guestGrid.Columns.Add(new DataGridTextColumn { Header = "Alamat", Binding = new System.Windows.Data.Binding("Alamat"), Width = new DataGridLength(1, DataGridLengthUnitType.Star) });
        _guestGrid.Columns.Add(new DataGridTextColumn { Header = "Nominal", Binding = new System.Windows.Data.Binding("NominalRp"), Width = 130 });
        _guestGrid.Columns.Add(new DataGridTextColumn { Header = "Meja", Binding = new System.Windows.Data.Binding("Meja"), Width = 90 });
        _guestGrid.Columns.Add(new DataGridTextColumn { Header = "Kasir", Binding = new System.Windows.Data.Binding("Kasir"), Width = 110 });
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
        else if (_guestGrid.Columns.Count > 7)
            _guestGrid.Columns[7].Visibility = Visibility.Collapsed;
        InputPanel.Children.Add(_guestGrid);
        _guestFooter = new TextBlock { Margin = new Thickness(0, 6, 0, 0) };
        InputPanel.Children.Add(_guestFooter);
        _guestMoreBtn = new Button { Content = "Muat 50 lagi", Margin = new Thickness(0, 6, 0, 0), HorizontalAlignment = HorizontalAlignment.Left, Visibility = Visibility.Collapsed };
        _guestMoreBtn.Click += (_, _) => { _guestLimit += 50; ApplyGuestFilter(); };
        InputPanel.Children.Add(_guestMoreBtn);
        ApplyGuestFilter();
    }

    private Border FieldCard(string? title, UIElement field, string? hint)
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
        var card = new Border
        {
            Padding = new Thickness(12),
            Margin = new Thickness(0, 0, 8, 0),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(12),
            Child = sp,
        };
        card.SetResourceReference(Border.BackgroundProperty, "CardBrush");
        card.SetResourceReference(Border.BorderBrushProperty, "OutlineBrush");
        return card;
    }

    private StackPanel BuildFilterBar()
    {
        var bar = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 4) };
        bar.Children.Add(new TextBlock { Text = "Meja:", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 6, 0) });
        var mejaItems = new List<string?> { null }.Concat(_ev.MejaList).ToList();
        _mejaFilterBox = new ComboBox { Width = 120, ItemsSource = mejaItems, SelectedItem = _mejaFilter, Margin = new Thickness(0, 0, 12, 0) };
        _mejaFilterBox.SelectionChanged += (_, _) => { _mejaFilter = _mejaFilterBox.SelectedItem as string; _guestLimit = 50; ApplyGuestFilter(); };
        bar.Children.Add(_mejaFilterBox);
        bar.Children.Add(new TextBlock { Text = "Kasir:", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 6, 0) });
        var kasirIds = _guests.Select(g => g.PetugasId ?? "").Where(s => s != "").Distinct().Take(8).ToList();
        var kasirItems = new List<string?> { null }.Concat(kasirIds).ToList();
        _kasirFilterBox = new ComboBox { Width = 140, ItemsSource = kasirItems, SelectedItem = _kasirFilter, Margin = new Thickness(0, 0, 12, 0) };
        _kasirFilterBox.SelectionChanged += (_, _) => { _kasirFilter = _kasirFilterBox.SelectedItem as string; _guestLimit = 50; ApplyGuestFilter(); };
        bar.Children.Add(_kasirFilterBox);
        _sortBox = new ComboBox { Width = 100, ItemsSource = new[] { "Waktu", "Nama", "Nominal" }, SelectedItem = _sortBy, Margin = new Thickness(0, 0, 8, 0) };
        _sortBox.SelectionChanged += (_, _) => { _sortBy = _sortBox.SelectedItem as string ?? "Waktu"; ApplyGuestFilter(); };
        bar.Children.Add(_sortBox);
        _orderBox = new ComboBox { Width = 90, ItemsSource = new[] { "↓ Desc", "↑ Asc" }, SelectedIndex = _sortDesc ? 0 : 1 };
        _orderBox.SelectionChanged += (_, _) => { _sortDesc = _orderBox.SelectedIndex == 0; ApplyGuestFilter(); };
        bar.Children.Add(_orderBox);
        var reset = new Button { Content = "Reset", Margin = new Thickness(8, 0, 0, 0), Padding = new Thickness(12, 4, 12, 4) };
        reset.Click += (_, _) => { _mejaFilter = null; _kasirFilter = null; _guestQ = ""; if (_guestSearchBox != null) _guestSearchBox.Text = ""; _guestLimit = 50; BuildInputPanel(); };
        bar.Children.Add(reset);
        return bar;
    }

    private List<GuestModel> ShownGuests()
    {
        var q = _guestQ.Trim().ToLowerInvariant();
        var list = _guests.Where(g =>
        {
            if (_mejaFilter != null && (g.MejaLabel ?? "") != _mejaFilter) return false;
            if (_kasirFilter != null && (g.PetugasId ?? "") != _kasirFilter) return false;
            if (string.IsNullOrEmpty(q)) return true;
            return (g.Nama ?? "").ToLowerInvariant().Contains(q) ||
                (g.Alamat ?? "").ToLowerInvariant().Contains(q) ||
                (g.MejaLabel ?? "").ToLowerInvariant().Contains(q) ||
                (g.Catatan ?? "").ToLowerInvariant().Contains(q);
        }).ToList();
        Comparison<GuestModel> cmp = _sortBy switch
        {
            "Nama" => (a, b) => string.Compare(a.Nama, b.Nama, StringComparison.OrdinalIgnoreCase),
            "Nominal" => (a, b) => a.Nominal.CompareTo(b.Nominal),
            _ => (a, b) => a.CreatedAt.CompareTo(b.CreatedAt),
        };
        list.Sort(cmp);
        if (_sortDesc) list.Reverse();
        return list;
    }

    private void ApplyGuestFilter()
    {
        if (_guestGrid == null) return;
        var all = ShownGuests();
        var total = all.Sum(g => g.Nominal);
        var data = all.Take(_guestLimit).ToList();
        _guestGrid.ItemsSource = data.Select((g, i) => new GuestRow(g, i + 1, KasirName(g), IsPendingGuest(g))).ToList();
        if (_guestFooter != null)
            _guestFooter.Text = $"Total tampil: {GuestRow.FormatRp(total)} • {all.Count} data";
        if (_guestMoreBtn != null)
        {
            _guestMoreBtn.Visibility = all.Count > data.Count ? Visibility.Visible : Visibility.Collapsed;
            _guestMoreBtn.Content = $"Muat 50 lagi ({all.Count - data.Count} sisa)";
        }
    }

    public sealed class GuestRow
    {
        private readonly GuestModel _g;
        public GuestRow(GuestModel g, int no, string kasir, bool pending)
        {
            _g = g; No = no; Kasir = kasir;
            NamaFull = pending ? $"{g.Nama} [pending]" : g.Nama;
            if (!string.IsNullOrEmpty(g.Catatan)) NamaFull += $" ↳ {g.Catatan}";
        }
        public GuestModel Model => _g;
        public int No { get; }
        public string NamaFull { get; }
        public string Nama => _g.Nama;
        public string Alamat => _g.Alamat;
        public string NominalRp => FormatRp(_g.Nominal);
        public string Meja => string.IsNullOrEmpty(_g.MejaLabel) ? "—" : _g.MejaLabel;
        public string Kasir { get; }
        public string Metode => _g.Metode;
        public static string FormatRp(long v) => $"Rp{v:N0}".Replace(",", ".");
    }

    public sealed class BookRow
    {
        public BookRow(GuestBookModel b, int no) { Model = b; No = no; }
        public GuestBookModel Model { get; }
        public int No { get; }
        public string Nama => Model.Nama;
        public string Alamat => Model.Alamat;
    }

    // ---------- Suggest nama + chips + duplikat (porting mobile) ----------
    private void OnNamaTextChanged(object sender, TextChangedEventArgs e)
    {
        ScheduleDupCheck();
        var q = (_namaBox?.Text ?? "").Trim();
        _suggestTimer?.Stop();
        if (q.Length < 2)
        {
            _suggestItems.Clear();
            if (_suggestPopup != null) _suggestPopup.IsOpen = false;
            return;
        }
        var ql = q.ToLowerInvariant();
        _suggestItems = _books
            .Where(b => (b.Nama ?? "").ToLowerInvariant().Contains(ql))
            .Take(6).ToList();
        ShowSuggest();
        _suggestTimer = new System.Windows.Threading.DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(300),
        };
        _suggestTimer.Tick += async (_, _) =>
        {
            _suggestTimer?.Stop();
            try
            {
                var doc = await ApiClient.Instance.GetAsync(
                    $"/api/events/{_ev.Id}/guests/suggest?q={Uri.EscapeDataString(q)}");
                if (doc == null) return;
                using (doc)
                {
                    if (doc.RootElement.ValueKind != JsonValueKind.Array) return;
                    var list = new List<GuestBookModel>();
                    foreach (var el in doc.RootElement.EnumerateArray().Take(8))
                    {
                        list.Add(new GuestBookModel
                        {
                            Id = "",
                            EventId = _ev.Id,
                            Nama = el.TryGetProperty("nama", out var n) ? n.GetString() ?? "" : "",
                            Alamat = el.TryGetProperty("alamat", out var a) ? a.GetString() ?? "" : "",
                        });
                    }
                    if (list.Count > 0)
                    {
                        _suggestItems = list;
                        ShowSuggest();
                    }
                }
            }
            catch { }
        };
        _suggestTimer.Start();
    }

    private void ShowSuggest()
    {
        if (_suggestList == null || _suggestPopup == null) return;
        _suggestHi = -1;
        _suggestList.ItemsSource = _suggestItems.Select(b => $"{b.Nama} — {b.Alamat}").ToList();
        _suggestPopup.IsOpen = _suggestItems.Count > 0;
    }

    private void SelectSuggestHi()
    {
        if (_suggestHi >= 0 && _suggestHi < _suggestItems.Count)
            SelectSuggest(_suggestItems[_suggestHi]);
        else if (_suggestList != null && _suggestList.SelectedIndex >= 0 && _suggestList.SelectedIndex < _suggestItems.Count)
            SelectSuggest(_suggestItems[_suggestList.SelectedIndex]);
    }

    private void SelectSuggest(GuestBookModel s)
    {
        if (_namaBox != null) _namaBox.Text = s.Nama;
        if (!string.IsNullOrEmpty(s.Alamat) && _alamatBox != null) _alamatBox.Text = s.Alamat;
        if (_suggestPopup != null) _suggestPopup.IsOpen = false;
        ScheduleDupCheck();
        _alamatBox?.Focus();
    }

    private void OnNamaPreviewKey(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (_suggestPopup?.IsOpen != true || _suggestItems.Count == 0)
        {
            if (e.Key == System.Windows.Input.Key.Escape && _suggestPopup != null)
                _suggestPopup.IsOpen = false;
            return;
        }
        if (e.Key == System.Windows.Input.Key.Down)
        {
            _suggestHi = (_suggestHi + 1) % _suggestItems.Count;
            if (_suggestList != null) _suggestList.SelectedIndex = _suggestHi;
            e.Handled = true;
        }
        else if (e.Key == System.Windows.Input.Key.Up)
        {
            _suggestHi = (_suggestHi - 1 + _suggestItems.Count) % _suggestItems.Count;
            if (_suggestList != null) _suggestList.SelectedIndex = _suggestHi;
            e.Handled = true;
        }
        else if (e.Key == System.Windows.Input.Key.Enter && _suggestHi >= 0)
        {
            SelectSuggest(_suggestItems[_suggestHi]);
            e.Handled = true;
        }
        else if (e.Key == System.Windows.Input.Key.Escape)
        {
            if (_suggestPopup != null) _suggestPopup.IsOpen = false;
            e.Handled = true;
        }
    }

    private void RefreshChips()
    {
        if (_alamatChips != null)
        {
            _alamatChips.Children.Clear();
            foreach (var t in _alamatTops.Take(4))
            {
                var active = (_alamatBox?.Text ?? "").Trim() == t.Label;
                var b = new Button
                {
                    Content = t.Jumlah > 0 ? $"{t.Label} • {t.Jumlah}" : t.Label,
                    Margin = new Thickness(0, 0, 6, 6),
                    Padding = new Thickness(10, 4, 10, 4),
                    Tag = t.Label,
                };
                if (active) b.FontWeight = FontWeights.Bold;
                b.Click += (s, _) =>
                {
                    if (_alamatBox != null && s is Button btn && btn.Tag is string tag)
                        _alamatBox.Text = tag;
                    ScheduleDupCheck();
                    RefreshChips();
                };
                _alamatChips.Children.Add(b);
            }
        }
        if (_nominalChips != null)
        {
            _nominalChips.Children.Clear();
            foreach (var t in _nominalTops.Take(4))
            {
                var active = (_nominalBox?.Text ?? "").Trim() == t.Nominal.ToString();
                var b = new Button
                {
                    Content = t.Jumlah > 0 ? $"{GuestRow.FormatRp(t.Nominal)} • {t.Jumlah}" : GuestRow.FormatRp(t.Nominal),
                    Margin = new Thickness(0, 0, 6, 6),
                    Padding = new Thickness(10, 4, 10, 4),
                    Tag = t.Nominal.ToString(),
                };
                if (active) b.FontWeight = FontWeights.Bold;
                b.Click += (s, _) =>
                {
                    if (_nominalBox != null && s is Button btn && btn.Tag is string tag)
                        _nominalBox.Text = tag;
                    RefreshChips();
                };
                _nominalChips.Children.Add(b);
            }
        }
    }

    private void ScheduleDupCheck()
    {
        _dupTimer?.Stop();
        _dupTimer = new System.Windows.Threading.DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(400),
        };
        _dupTimer.Tick += async (_, _) =>
        {
            _dupTimer?.Stop();
            var nama = (_namaBox?.Text ?? "").Trim();
            var alamat = (_alamatBox?.Text ?? "").Trim();
            if (nama.Length < 2 || alamat.Length < 2)
            {
                _liveDup = null;
                RefreshDupBanner();
                return;
            }
            var local = _guests.FirstOrDefault(g =>
                string.Equals(g.Nama, nama, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(g.Alamat, alamat, StringComparison.OrdinalIgnoreCase));
            _liveDup = local == null ? null : (local.Nama, GuestRow.FormatRp(local.Nominal));
            RefreshDupBanner();
            try
            {
                var doc = await ApiClient.Instance.GetAsync(
                    $"/api/events/{_ev.Id}/guests/check?nama={Uri.EscapeDataString(nama)}&alamat={Uri.EscapeDataString(alamat)}");
                if (doc == null) return;
                using (doc)
                {
                    var r = doc.RootElement;
                    if (r.TryGetProperty("exists", out var ex) && ex.GetBoolean() &&
                        r.TryGetProperty("existing", out var e2) && e2.ValueKind == JsonValueKind.Object)
                    {
                        var nm = e2.TryGetProperty("nama", out var n) ? n.GetString() ?? nama : nama;
                        var fmt = e2.TryGetProperty("nominalFormatted", out var f) ? f.GetString() ?? "" : "";
                        if (string.IsNullOrEmpty(fmt) && e2.TryGetProperty("nominal", out var nn))
                            fmt = GuestRow.FormatRp(nn.GetInt64());
                        _liveDup = (nm, fmt);
                        RefreshDupBanner();
                    }
                    else if (local == null)
                    {
                        _liveDup = null;
                        RefreshDupBanner();
                    }
                }
            }
            catch { }
        };
        _dupTimer.Start();
    }

    private void RefreshDupBanner()
    {
        var dup = _liveDup != null;
        if (_dupBanner != null)
        {
            _dupBanner.Visibility = dup ? Visibility.Visible : Visibility.Collapsed;
            if (dup && _dupBannerText != null && _liveDup.HasValue)
                _dupBannerText.Text =
                    $"{_liveDup.Value.nama} sudah {_liveDup.Value.nominalFormatted} — isi catatan penanda lalu simpan.";
        }
        if (_saveBtn != null)
            _saveBtn.Content = dup ? "Simpan dengan Catatan" : "Simpan (offline-first)";
        if (_catatanBox != null)
            _catatanBox.ToolTip = dup ? "Wajib: bedakan dari data sebelumnya" : "Catatan (wajib jika duplikat)";
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
        if (_namaBox != null) _namaBox.Text = "";
        if (_alamatBox != null) _alamatBox.Text = "";
        if (_nominalBox != null) _nominalBox.Text = "";
        if (_catatanBox != null) _catatanBox.Text = "";
        _liveDup = null;
        _guestLimit = 50;
        if (_suggestPopup != null) _suggestPopup.IsOpen = false;
        RefreshDupBanner();
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
            Title = "Edit Pemberian", Width = 480, Height = 320,
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

    // ---------- Tab Buku (No + footer total + Muat lagi) ----------
    private void OnBookSearch(object sender, TextChangedEventArgs e)
    {
        _bookLimit = 50;
        ApplyBookFilter();
        AddBookBtn.Visibility = _ev.CanEdit ? Visibility.Visible : Visibility.Collapsed;
    }

    private void OnBookMore(object sender, RoutedEventArgs e)
    {
        _bookLimit += 50;
        ApplyBookFilter();
    }

    private void ApplyBookFilter()
    {
        var q = (BookSearch?.Text ?? "").Trim().ToLowerInvariant();
        var shown = string.IsNullOrEmpty(q) ? _books.ToList()
            : _books.Where(b => (b.Nama ?? "").ToLowerInvariant().Contains(q) ||
                (b.Alamat ?? "").ToLowerInvariant().Contains(q)).ToList();
        var data = shown.Take(_bookLimit).ToList();
        BooksGrid.ItemsSource = data.Select((b, i) => new BookRow(b, i + 1)).ToList();
        if (BookFooter != null)
            BookFooter.Text = $"Total: {shown.Count} tamu";
        if (BookMoreBtn != null)
        {
            BookMoreBtn.Visibility = shown.Count > data.Count ? Visibility.Visible : Visibility.Collapsed;
            BookMoreBtn.Content = $"Muat 50 lagi ({shown.Count - data.Count} sisa)";
        }
    }

    private async void OnAddBook(object sender, RoutedEventArgs e)
    {
        var n = new TextBox(); var a = new TextBox();
        var win = new Window
        {
            Title = "Buku tamu baru", Width = 480, Height = 280,
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

    private static GuestBookModel ResolveBook(object? ctx) => ctx switch
    {
        BookRow r => r.Model,
        GuestBookModel m => m,
        _ => throw new InvalidOperationException(),
    };

    private void OnEditBook(object sender, RoutedEventArgs e)
    {
        GuestBookModel b;
        try { b = ResolveBook((sender as FrameworkElement)?.DataContext); }
        catch { return; }
        var n = new TextBox { Text = b.Nama, Margin = new Thickness(0, 0, 0, 8) };
        var a = new TextBox { Text = b.Alamat, Margin = new Thickness(0, 0, 0, 8) };
        var win = new Window
        {
            Title = "Edit buku tamu", Width = 480, Height = 280,
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
        GuestBookModel b;
        try { b = ResolveBook((sender as FrameworkElement)?.DataContext); }
        catch { return; }
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
