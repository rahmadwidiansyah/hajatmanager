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
    private ComboBox? _mejaBox, _mejaFilterBox, _kasirFilterBox, _sortBox, _orderBox;
    private WrapPanel? _alamatChips, _nominalChips, _metodeChips;
    private Popup? _suggestPopup;
    private ListBox? _suggestList;
    private TextBlock? _suggestHeader;
    private List<GuestBookModel> _suggestItems = new();
    private int _suggestHi = -1;
    private System.Windows.Threading.DispatcherTimer? _suggestTimer, _dupTimer;
    private (string nama, string nominalFormatted)? _liveDup;
    private DataGrid? _guestGrid;
    // Anti-double-submit (cermin mobile _saveToken/_lastSig/saving + web isAddingBook).
    private bool _guestSaving, _bookSaving, _bookDialogOpen, _syncing, _exporting;
    private int _saveToken;
    private string _lastGuestSig = "";
    private long _lastGuestAt;
    private string _lastBookSig = "";
    private long _lastBookAt;

    private static readonly string[] Methodes = { "CASH", "AMPLOP", "QRIS", "TRANSFER", "BARANG" };

    public EventDetailWindow(EventModel ev)
    {
        _ev = ev;
        // Pulihkan pilihan meja terakhir (cermin web localStorage + mobile SharedPrefs).
        // Tanpa ini tiap buka jendela balik ke MEJA-1.
        try
        {
            var saved = AppConfig.Instance.GetMejaFor(ev.Id);
            if (!string.IsNullOrEmpty(saved)) _meja = saved;
        }
        catch { }
        InitializeComponent();
        Title = ev.NamaAcara;
        TitleText.Text = ev.NamaAcara;
        RoleText.Text = ev.MyRole;
        M3Chrome.Attach(this);
        SizeChanged += (_, e) =>
        {
            if (RekapGrid != null)
                RekapGrid.Columns = e.NewSize.Width < 900 ? 1 : 2;
        };
        Loaded += async (_, _) => await RefreshAsync();
        // Ctrl+S simpan dari tab Input cermin mobile CallbackShortcuts.
        KeyDown += (_, e) =>
        {
            try
            {
                if (e.Key == System.Windows.Input.Key.S &&
                    (System.Windows.Input.Keyboard.Modifiers & System.Windows.Input.ModifierKeys.Control) != 0 &&
                    Tabs.SelectedIndex == 0 && _ev.CanEdit && !_guestSaving)
                {
                    e.Handled = true;
                    _ = SaveGuestAsync();
                }
            }
            catch { }
        };
        // Auto-refresh saat background sync selesai / online berubah.
        SyncEngine.Instance.Changed += OnSyncChanged;
        System.Net.NetworkInformation.NetworkChange.NetworkAvailabilityChanged += OnNetChanged;
        Closed += (_, _) =>
        {
            try { SyncEngine.Instance.Changed -= OnSyncChanged; } catch { }
            try { System.Net.NetworkInformation.NetworkChange.NetworkAvailabilityChanged -= OnNetChanged; } catch { }
        };
    }

    private void OnSyncChanged()
    {
        try { Dispatcher.InvokeAsync(async () => await RefreshStatusOnlyAsync()); } catch { }
    }

    private void OnNetChanged(object? s, System.Net.NetworkInformation.NetworkAvailabilityEventArgs e)
    {
        try { Dispatcher.InvokeAsync(async () => await RefreshAsync()); } catch { }
    }

    private async Task RefreshStatusOnlyAsync()
    {
        try
        {
            var online = SyncEngine.Instance.Online;
            var pending = await LocalDb.Instance.OutboxCountAsync(_ev.Id);
            PendingText.Text =
                $"Antre: {pending} • " +
                (online ? "Online ✓" : "Offline ✗");
            UpdateSyncCloud(pending, online);
            ApplyGuestFilter();
        }
        catch { }
    }

    // Ikon awan sync cermin web TopBar (syncBtn): hijau = tersinkron,
    // kuning = ada pending, abu = offline + badge jumlah antre.
    private void UpdateSyncCloud(int pending, bool online)
    {
        try
        {
            if (SyncCloudBtn == null || SyncCloudIcon == null) return;
            if (_syncing)
            {
                SyncCloudIcon.Text = M3Icons.Sync;
                SyncCloudBtn.ToolTip = "Sinkronisasi berjalan…";
                SyncCloudBtn.IsEnabled = false;
            }
            else
            {
                SyncCloudBtn.IsEnabled = true;
                // Satu glyph sync (cermin SyncButton Flutter); state via warna + badge.
                SyncCloudIcon.Text = M3Icons.Sync;
                if (!online)
                {
                    SyncCloudBtn.Background = BrushOf("SurfaceContainerBrush");
                    SyncCloudBtn.Foreground = BrushOf("OnVariantBrush");
                    SyncCloudBtn.ToolTip = $"Offline — data tersimpan di perangkat{(pending > 0 ? $" ({pending} menunggu sync)" : "")}. Klik untuk coba sync.";
                }
                else if (pending > 0)
                {
                    SyncCloudBtn.Background = BrushOf("WarningBrush");
                    SyncCloudBtn.Foreground = BrushOf("OnPrimaryBrush");
                    SyncCloudBtn.ToolTip = $"{pending} data belum sync — klik untuk sync sekarang";
                }
                else
                {
                    SyncCloudBtn.Background = BrushOf("PrimaryBrush");
                    SyncCloudBtn.Foreground = BrushOf("OnPrimaryBrush");
                    SyncCloudBtn.ToolTip = "Sudah tersinkron — klik untuk refresh";
                }
            }
            if (SyncBadgeBorder != null && SyncBadgeText != null)
            {
                if (pending > 0)
                {
                    SyncBadgeBorder.Visibility = Visibility.Visible;
                    SyncBadgeText.Text = pending > 9 ? "9+" : pending.ToString();
                }
                else SyncBadgeBorder.Visibility = Visibility.Collapsed;
            }
        }
        catch { }
    }

    private static System.Windows.Media.Brush BrushOf(string key)
    {
        try
        {
            if (Application.Current?.TryFindResource(key) is System.Windows.Media.Brush b) return b;
        }
        catch { }
        return System.Windows.Media.Brushes.Gray;
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
        var pendingCount = await LocalDb.Instance.OutboxCountAsync(_ev.Id);
        PendingText.Text =
            $"Antre: {pendingCount} • " +
            (online ? "Online ✓" : "Offline ✗");
        UpdateSyncCloud(pendingCount, online);
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
                            // Hormati pilihan tersimpan; fallback ke pertama bila tak valid.
                            string? saved = null;
                            try { saved = AppConfig.Instance.GetMejaFor(_ev.Id); } catch { }
                            if (!string.IsNullOrEmpty(saved) && _ev.MejaList.Contains(saved))
                                _meja = saved;
                            else if (!_ev.MejaList.Contains(_meja)) _meja = _ev.MejaList.First();
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
        catch (System.Net.Http.HttpRequestException ex) when (
            ex.StatusCode == System.Net.HttpStatusCode.Forbidden ||
            ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // Event sudah tidak ada di server (dihapus/di-kick).
            if (await HandleGoneEventAsync()) return;
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

    /// Event sudah tidak ada di server (dihapus/di-kick).
    /// Hapus cache lokal lalu tutup halaman — kecuali masih ada antrean
    /// outbox (acara offline yang belum sync, jangan dihapus).
    /// Returns true bila halaman ditutup.
    private async Task<bool> HandleGoneEventAsync()
    {
        try
        {
            if (await LocalDb.Instance.OutboxCountAsync(_ev.Id) > 0) return false;
            await LocalDb.Instance.DeleteEventLocalAsync(_ev.Id);
        }
        catch { return false; }
        try { M3Snack.Show(this, "Acara sudah dihapus di server"); } catch { }
        try { Close(); } catch { }
        return true;
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

    // Pending per-baris dihapus (badge count saja ikut mobile):
    // source of truth = COUNT(outbox), bukan prefix gst-.

    // ---------- Tab Input (porting Linux/tablet) ----------
    private void BuildInputPanel()
    {
        InputPanel.Children.Clear();
        _suggestTimer?.Stop();
        _dupTimer?.Stop();
        if (!_ev.CanEdit)
        {
            _guestSearchBox = new TextBox { Margin = new Thickness(0, 0, 0, 6) };
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
            _mejaBox.SelectionChanged += (_, _) => { _meja = _mejaBox.SelectedItem as string ?? _meja; try { AppConfig.Instance.SetMejaFor(_ev.Id, _meja); } catch { } };
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
            _suggestHeader = new TextBlock { Margin = new Thickness(8, 4, 8, 4) };
            _suggestHeader.SetResourceReference(TextBlock.ForegroundProperty, "OnVariantBrush");
            _suggestHeader.FontSize = 11;
            var suggestStack = new StackPanel();
            suggestStack.Children.Add(_suggestHeader);
            suggestStack.Children.Add(_suggestList);
            var suggestBorder = new Border
            {
                Padding = new Thickness(4),
                Child = suggestStack,
            };
            ApplyM3Card(suggestBorder);
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
            _alamatChips = new WrapPanel { Margin = new Thickness(0, 6, 0, 0) };
            alamatStack.Children.Add(_alamatChips);
            grid.Children.Add(FieldCard("Alamat / Desa", alamatStack, null));
            InputPanel.Children.Add(grid);

            var grid2 = new UniformGrid { Columns = 2, Margin = new Thickness(0, 6, 0, 0) };
            var nomStack = new StackPanel();
            _nominalPreview = new TextBlock { FontWeight = FontWeights.Bold, HorizontalAlignment = HorizontalAlignment.Right };
            if (Application.Current?.TryFindResource("NumericFont") is System.Windows.Media.FontFamily nf)
                _nominalPreview.FontFamily = nf;
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
            _nominalChips = new WrapPanel { Margin = new Thickness(0, 6, 0, 0) };
            nomStack.Children.Add(_nominalChips);
            grid2.Children.Add(FieldCard("Nominal (Rp)", nomStack, "100000"));
            // Metode = ChoiceChip cermin Flutter (AMPLOP/QRIS/TRANSFER + fallback
            // "(lama)" bila nilai tersimpan di luar ketiganya, cermin web).
            _metodeChips = new WrapPanel { Margin = new Thickness(0, 0, 0, 6) };
            RefreshMetodeChips();
            _catatanBox = new TextBox();
            _catatanBox.TextChanged += (_, _) => RefreshDupBanner();
            var mc = FieldCard("Metode & Catatan", _metodeChips, null);
            var sp = new StackPanel();
            sp.Children.Add(mc);
            sp.Children.Add(FieldCard(null, _catatanBox, "Catatan (wajib jika duplikat)"));
            grid2.Children.Add(sp);
            InputPanel.Children.Add(grid2);

            _dupBanner = new Border
            {
                Margin = new Thickness(0, 8, 0, 0),
                Visibility = Visibility.Collapsed,
            };
            _dupBannerText = new TextBlock { TextWrapping = TextWrapping.Wrap };
            _dupBanner.Child = _dupBannerText;
            ApplyM3Card(_dupBanner);
            // Banner duplikat memakai errorContainer cermin Flutter.
            _dupBanner.SetResourceReference(Border.BackgroundProperty, "ErrorContainerBrush");
            _dupBannerText.SetResourceReference(TextBlock.ForegroundProperty, "OnErrorContainerBrush");
            InputPanel.Children.Add(_dupBanner);

            _saveBtn = new Button
            {
                Content = "Simpan (offline-first)",
                Style = M3("PrimaryButton") ?? (Style)FindResource("PrimaryButton"),
                Margin = new Thickness(0, 8, 0, 0),
                HorizontalAlignment = HorizontalAlignment.Right,
                MinWidth = 220,
            };
            _saveBtn.Click += async (_, _) => await SaveGuestAsync();
            InputPanel.Children.Add(_saveBtn);

            // Search + filter editor (cermin web + mobile).
            var title0 = new TextBlock { Text = "CARI & FILTER", Margin = new Thickness(0, 8, 0, 6) };
            if (M3("M3SectionTitle") is Style sts) title0.Style = sts;
            else title0.FontWeight = FontWeights.SemiBold;
            InputPanel.Children.Add(title0);
            _guestSearchBox = new TextBox { Margin = new Thickness(0, 0, 0, 6) };
            _guestSearchBox.TextChanged += (_, _) => { _guestQ = _guestSearchBox.Text; _guestLimit = 50; ApplyGuestFilter(); };
            InputPanel.Children.Add(_guestSearchBox);
            InputPanel.Children.Add(BuildFilterBar());
            RefreshChips();
            RefreshDupBanner();
        }
        var title = new TextBlock
        {
            Text = "TERAKHIR DI PERANGKAT INI",
            Margin = new Thickness(0, 8, 0, 6)
        };
        if (M3("M3SectionTitle") is Style m3st) title.Style = m3st;
        else title.FontWeight = FontWeights.SemiBold;
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
        if (M3("OutlineButton") is Style ob) _guestMoreBtn.Style = ob;
        _guestMoreBtn.Click += (_, _) => { _guestLimit += 50; ApplyGuestFilter(); };
        InputPanel.Children.Add(_guestMoreBtn);
        ApplyGuestFilter();
    }

    private static void ApplyM3Card(Border b)
    {
        if (Application.Current?.TryFindResource("M3Card") is Style s)
            b.Style = s;
        else
        {
            b.SetResourceReference(Border.BackgroundProperty, "CardBrush");
            b.SetResourceReference(Border.BorderBrushProperty, "OutlineBrush");
        }
    }

    private static Style? M3(string key) =>
        Application.Current?.TryFindResource(key) as Style;

    private Border FieldCard(string? title, UIElement field, string? hint)
    {
        var sp = new StackPanel { Margin = new Thickness(4) };
        if (title != null)
        {
            var t = new TextBlock { Text = title.ToUpperInvariant(), Margin = new Thickness(0, 0, 0, 6) };
            if (M3("M3SectionTitle") is Style ts) t.Style = ts;
            else t.FontWeight = FontWeights.SemiBold;
            sp.Children.Add(t);
        }
        if (field is TextBox tb && hint != null)
        {
            var tip = new ToolTip { Content = hint };
            tb.ToolTip = tip;
        }
        sp.Children.Add(field);
        var card = new Border
        {
            Margin = new Thickness(0, 0, 6, 6),
            Child = sp,
        };
        ApplyM3Card(card);
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
        var reset = new Button { Content = "Reset", Margin = new Thickness(8, 0, 0, 0) };
        if (M3("TextButton") is Style tbs) reset.Style = tbs;
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
        _guestGrid.ItemsSource = data.Select((g, i) => new GuestRow(g, i + 1, KasirName(g))).ToList();
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
        public GuestRow(GuestModel g, int no, string kasir)
        {
            _g = g; No = no; Kasir = kasir;
            NamaFull = g.Nama;
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
        public static string FormatRp(long v) => $"Rp {v:N0}".Replace(",", ".");
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
        // Header cermin Flutter: "Buku Tamu (n)".
        if (_suggestHeader != null)
            _suggestHeader.Text = $"Buku Tamu ({_suggestItems.Count}) — klik / Enter untuk isi";
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

    private static void ApplyChip(Button b, bool active)
    {
        var key = active ? "M3ChipActive" : "M3Chip";
        if (M3(key) is Style s) b.Style = s;
        else if (active) b.FontWeight = FontWeights.Bold;
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
                    Tag = t.Label,
                };
                ApplyChip(b, active);
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
                    Tag = t.Nominal.ToString(),
                };
                ApplyChip(b, active);
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

    // ChoiceChip metode cermin Flutter (AMPLOP/QRIS/TRANSFER). Nilai lama
    // (CASH/BARANG) tetap bisa dipilih via chip "(lama)" cermin web.
    private static readonly string[] MetodeChips = { "AMPLOP", "QRIS", "TRANSFER" };

    private void RefreshMetodeChips()
    {
        if (_metodeChips == null) return;
        _metodeChips.Children.Clear();
        var opts = MetodeChips.Contains(_metode)
            ? MetodeChips.AsEnumerable()
            : MetodeChips.Concat(new[] { _metode });
        foreach (var m in opts)
        {
            var legacy = !MetodeChips.Contains(m);
            var b = new Button
            {
                Content = legacy ? $"{m} (lama)" : m,
                Tag = m,
            };
            ApplyChip(b, _metode == m);
            b.Click += (s, _) =>
            {
                if (s is Button btn && btn.Tag is string tag)
                {
                    _metode = tag;
                    RefreshMetodeChips();
                }
            };
            _metodeChips.Children.Add(b);
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
        var btn = sender as System.Windows.Controls.Button;
        if (btn != null && !btn.IsEnabled) return;
        if (MessageBox.Show(this, $"Hapus {r.Nama}?", "Hapus",
                MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        if (btn != null) btn.IsEnabled = false;
        try
        {
        await LocalDb.Instance.DeleteGuestLocalAsync(r.Model.Id);
        await LocalDb.Instance.EnqueueAsync(new OutboxOp
        {
            Id = r.Model.Id, EventId = _ev.Id, Action = "DELETE_GUEST", TableName = "guests",
            Payload = JsonSerializer.Serialize(new { id = r.Model.Id }),
        });
        try
        {
            using var response = await ApiClient.Instance.DeleteAsync($"/api/guests/{r.Model.Id}");
            if (response.IsSuccessStatusCode || (int)response.StatusCode == 404)
                await LocalDb.Instance.OutboxRemoveAsync(new[] { r.Model.Id });
        }
        catch (Exception ex) { AppLogger.Warn($"Hapus guest online gagal: {ex.Message}"); }
        await RefreshAsync();
        }
        finally { if (btn != null) btn.IsEnabled = true; }
    }

    private async Task SaveGuestAsync()
    {
        var nama = TitleCase(_namaBox?.Text ?? "");
        var alamat = (_alamatBox?.Text ?? "").Trim();
        var nominalTxt = new string((_nominalBox?.Text ?? "").Where(char.IsDigit).ToArray());
        if (!long.TryParse(nominalTxt, out var nominal) || nominal <= 0 ||
            nama.Length < 2 || alamat.Length < 2)
        {
            M3Snack.Show(this, "Lengkapi nama (min 2), alamat (min 2), nominal > 0.", isError: true);
            return;
        }
        var metode = _metode;
        var catatan = (_catatanBox?.Text ?? "").Trim();
        var sig = $"{_ev.Id}|{nama}|{alamat}|{nominal}|{metode}|{catatan}";
        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (_guestSaving || (sig == _lastGuestSig && nowMs - _lastGuestAt < 3000)) return;
        var token = ++_saveToken;
        _guestSaving = true;
        _lastGuestSig = sig;
        _lastGuestAt = nowMs;
        if (_saveBtn != null) { _saveBtn.IsEnabled = false; _saveBtn.Content = "Menyimpan…"; }
        try
        {
        // Idempoten cermin mobile/web: id lokal AWAL == localId (UUID murni).
        // Server lookup by localId dulu → retry / POST-langsung + flush tidak dobel.
        // (Sebelumnya id = "gst-GUID" tanpa localId → server buat cuid baru → 2 baris.)
        var localId = Guid.NewGuid().ToString();
        var id = localId;
        var now = DateTime.Now;
        var email = UserEmail();
        var payload = new Dictionary<string, object?>
        {
            ["id"] = id, ["localId"] = localId, ["eventId"] = _ev.Id, ["nama"] = nama, ["alamat"] = alamat,
            ["nominal"] = nominal, ["metode"] = metode,
            ["catatan"] = string.IsNullOrEmpty(catatan) ? null : catatan,
            ["petugasId"] = email, ["mejaLabel"] = _mejaBox?.SelectedItem as string ?? _meja,
            ["deviceId"] = AppConfig.Instance.GetDeviceId(),
            ["createdAt"] = now.ToString("o"), ["updatedAt"] = now.ToString("o"),
        };
        await LocalDb.Instance.InsertGuestAsync(new GuestModel
        {
            Id = id, LocalId = localId, EventId = _ev.Id, Nama = nama, Alamat = alamat, Nominal = nominal,
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
            if (r.IsSuccessStatusCode)
            {
                // Rekonsiliasi langsung: server bisa balikin id berbeda (cuid).
                // Update baris lokal → pull berikutnya tidak insert baris kedua.
                try
                {
                    var body = await r.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(body);
                    var srv = doc.RootElement.TryGetProperty("id", out var sid) ? sid.GetString() ?? "" : "";
                    if (!string.IsNullOrEmpty(srv) && srv != localId)
                        await LocalDb.Instance.UpdateGuestServerIdAsync(localId, srv);
                }
                catch { }
                await LocalDb.Instance.OutboxRemoveAsync(new[] { id });
            }
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
        finally
        {
            if (token == _saveToken)
            {
                _guestSaving = false;
                if (_saveBtn != null) { _saveBtn.IsEnabled = true; RefreshDupBanner(); }
            }
        }
    }

    private Window M3Dialog(string title, UIElement content, int height = 320)
    {
        var win = new Window
        {
            Title = title, Width = 480, Height = height,
            WindowStartupLocation = WindowStartupLocation.CenterOwner, Owner = this,
            Content = content,
        };
        win.SetResourceReference(System.Windows.Controls.Control.BackgroundProperty, "SurfaceBrush");
        M3Chrome.Attach(win, dialog: true);
        return win;
    }

    private static TextBlock M3Label(string text, Thickness? margin = null)
    {
        var t = new TextBlock { Text = text.ToUpperInvariant(), Margin = margin ?? new Thickness(0, 0, 0, 4) };
        if (M3("M3SectionTitle") is Style s) t.Style = s;
        return t;
    }

    private static Button M3Primary(string content)
    {
        var b = new Button { Content = content, Margin = new Thickness(0, 12, 0, 0) };
        if (M3("PrimaryButton") is Style s) b.Style = s;
        return b;
    }

    private void EditGuestDialog(GuestModel g)
    {
        var nb = new TextBox { Text = g.Nama, Margin = new Thickness(0, 0, 0, 6) };
        var ab = new TextBox { Text = g.Alamat, Margin = new Thickness(0, 0, 0, 6) };
        var nob = new TextBox { Text = g.Nominal.ToString(), Margin = new Thickness(0, 0, 0, 6) };
        PreviewTextInputRegistrar.DigitsOnly(nob);
        var save = M3Primary("Simpan");
        var win = M3Dialog("Edit Pemberian", new StackPanel
        {
            Margin = new Thickness(16),
            Children = {
                    M3Label("Nama"), nb,
                    M3Label("Alamat"), ab,
                    M3Label("Nominal"), nob,
                    save,
                }
        });
        save.Click += async (_, _) =>
        {
            save.IsEnabled = false;
            try
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
            try
            {
                using var response = await ApiClient.Instance.PatchJsonAsync($"/api/guests/{g.Id}", fields);
                if (response.IsSuccessStatusCode || (int)response.StatusCode == 404)
                    await LocalDb.Instance.OutboxRemoveAsync(
                        (await LocalDb.Instance.OutboxListAsync(_ev.Id))
                        .Where(x => x.Action == "UPDATE_GUEST" && x.Payload.Contains($"\"id\":\"{g.Id}\""))
                        .Select(x => x.Id));
            }
            catch (Exception ex) { AppLogger.Warn($"Update guest online gagal: {ex.Message}"); }
            win.Close();
            await RefreshAsync();
            }
            finally { try { save.IsEnabled = true; } catch { } }
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
        if (_bookDialogOpen || _bookSaving) return;
        _bookDialogOpen = true;
        var n = new TextBox(); var a = new TextBox();
        var errBk = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 8, 0, 0) };
        errBk.SetResourceReference(TextBlock.ForegroundProperty, "ErrorBrush");
        var save = M3Primary("Simpan");
        var win = M3Dialog("Buku tamu baru", new StackPanel
        {
            Margin = new Thickness(16),
            Children = {
                    M3Label("Nama"), n,
                    M3Label("Alamat", new Thickness(0,8,0,4)), a,
                    errBk,
                    save,
                }
        }, 300);
        win.Closed += (_, _) => { _bookDialogOpen = false; };
        save.Click += async (_, _) =>
        {
            if (n.Text.Trim().Length < 2 || a.Text.Trim().Length < 2) return;
            var namaBk = TitleCase(n.Text);
            var alamatBk = a.Text.Trim();
            if (_books.Any(b => string.Equals(b.Nama, namaBk, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(b.Alamat, alamatBk, StringComparison.OrdinalIgnoreCase)))
            {
                errBk.Text = "Nama dan alamat sudah tercatat di buku tamu.";
                return;
            }
            var sig = $"{_ev.Id}|{namaBk}|{alamatBk}";
            var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (_bookSaving || (sig == _lastBookSig && nowMs - _lastBookAt < 3000)) return;
            _bookSaving = true;
            _lastBookSig = sig;
            _lastBookAt = nowMs;
            save.IsEnabled = false;
            try
            {
            var localId = Guid.NewGuid().ToString();
            var id = localId;
            var payload = new Dictionary<string, object?>
            {
                ["id"] = id, ["localId"] = localId, ["eventId"] = _ev.Id,
                ["nama"] = TitleCase(n.Text), ["alamat"] = a.Text.Trim(),
                ["createdAt"] = DateTime.Now.ToString("o"),
            };
            await LocalDb.Instance.InsertBookAsync(new GuestBookModel
            {
                Id = id, LocalId = localId, EventId = _ev.Id, Nama = TitleCase(n.Text),
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
                    new { nama = payload["nama"], alamat = payload["alamat"], localId });
                if (r.IsSuccessStatusCode)
                {
                    try
                    {
                        var body = await r.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(body);
                        var srv = doc.RootElement.TryGetProperty("id", out var sid) ? sid.GetString() ?? "" : "";
                        if (!string.IsNullOrEmpty(srv) && srv != localId)
                            await LocalDb.Instance.UpdateBookServerIdAsync(localId, srv);
                    }
                    catch { }
                    await LocalDb.Instance.OutboxRemoveAsync(new[] { id });
                }
            }
            catch { }
            win.Close();
            await RefreshAsync();
            }
            finally
            {
                _bookSaving = false;
                try { save.IsEnabled = true; } catch { }
            }
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
        var n = new TextBox { Text = b.Nama, Margin = new Thickness(0, 0, 0, 6) };
        var a = new TextBox { Text = b.Alamat, Margin = new Thickness(0, 0, 0, 6) };
        var save = M3Primary("Simpan");
        var win = M3Dialog("Edit buku tamu", new StackPanel
        {
            Margin = new Thickness(16),
            Children = { M3Label("Nama"), n,
                    M3Label("Alamat", new Thickness(0,8,0,4)), a,
                    save }
        }, 280);
        save.Click += async (_, _) =>
        {
            save.IsEnabled = false;
            try
            {
            var fields = new Dictionary<string, object?>
                { ["nama"] = TitleCase(n.Text), ["alamat"] = a.Text.Trim() };
            await LocalDb.Instance.UpdateBookLocalAsync(b.Id, TitleCase(n.Text), a.Text.Trim());
            await LocalDb.Instance.EnqueueAsync(new OutboxOp
            {
                EventId = _ev.Id, Action = "UPDATE_BOOK", TableName = "guest_books",
                Payload = JsonSerializer.Serialize(new { id = b.Id, fields }),
            });
            try
            {
                using var response = await ApiClient.Instance.PatchJsonAsync($"/api/guestbooks/{b.Id}", fields);
                if (response.IsSuccessStatusCode || (int)response.StatusCode == 404)
                    await LocalDb.Instance.OutboxRemoveAsync(
                        (await LocalDb.Instance.OutboxListAsync(_ev.Id))
                        .Where(x => x.Action == "UPDATE_BOOK" && x.Payload.Contains($"\"id\":\"{b.Id}\""))
                        .Select(x => x.Id));
            }
            catch (Exception ex) { AppLogger.Warn($"Update buku tamu online gagal: {ex.Message}"); }
            win.Close();
            await RefreshAsync();
            }
            finally { try { save.IsEnabled = true; } catch { } }
        };
        win.ShowDialog();
    }

    private async void OnDeleteBook(object sender, RoutedEventArgs e)
    {
        GuestBookModel b;
        try { b = ResolveBook((sender as FrameworkElement)?.DataContext); }
        catch { return; }
        var delBtn = sender as System.Windows.Controls.Button;
        if (delBtn != null && !delBtn.IsEnabled) return;
        if (MessageBox.Show(this, $"Hapus {b.Nama}?", "Hapus",
                MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        if (delBtn != null) delBtn.IsEnabled = false;
        try
        {
        await LocalDb.Instance.DeleteBookLocalAsync(b.Id);
        await LocalDb.Instance.EnqueueAsync(new OutboxOp
        {
            Id = b.Id, EventId = _ev.Id, Action = "DELETE_BOOK", TableName = "guest_books",
            Payload = JsonSerializer.Serialize(new { id = b.Id }),
        });
        try
        {
            using var response = await ApiClient.Instance.DeleteAsync($"/api/guestbooks/{b.Id}");
            if (response.IsSuccessStatusCode || (int)response.StatusCode == 404)
                await LocalDb.Instance.OutboxRemoveAsync(
                    (await LocalDb.Instance.OutboxListAsync(_ev.Id))
                    .Where(x => x.Action == "DELETE_BOOK" && x.Payload.Contains($"\"id\":\"{b.Id}\""))
                    .Select(x => x.Id));
        }
        catch (Exception ex) { AppLogger.Warn($"Hapus buku tamu online gagal: {ex.Message}"); }
        await RefreshAsync();
        }
        finally { if (delBtn != null) delBtn.IsEnabled = true; }
    }

    private async void OnSync(object sender, RoutedEventArgs e)
    {
        if (_syncing) return;
        _syncing = true;
        var btn = sender as System.Windows.Controls.Button;
        if (btn != null) btn.IsEnabled = false;
        try { UpdateSyncCloud(await LocalDb.Instance.OutboxCountAsync(_ev.Id), SyncEngine.Instance.Online); } catch { }
        try
        {
            await SyncEngine.Instance.SyncInBackgroundAsync(_ev.Id);
            await RefreshAsync();
        }
        finally
        {
            _syncing = false;
            if (btn != null) btn.IsEnabled = true;
        }
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
        if (_exporting) return;
        _exporting = true;
        var btn = sender as System.Windows.Controls.Button;
        if (btn != null) btn.IsEnabled = false;
        try
        {
            var dlg = new Microsoft.Win32.SaveFileDialog
            {
                FileName = $"{_ev.NamaAcara}-pemberian-{DateTime.Now:yyyy-MM-dd}.pdf",
                Filter = "PDF (*.pdf)|*.pdf|Excel (*.xlsx)|*.xlsx",
            };
            if (dlg.ShowDialog() != true) return;
            var snapshot = _guests.ToList();
            var isXlsx = dlg.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase);
            var email = UserEmail();
            var meja = _meja;
            await Task.Run(() =>
            {
                if (isXlsx)
                    Services.Exporter.ExportXlsx(dlg.FileName, _ev, snapshot);
                else
                    Services.Exporter.ExportPdf(dlg.FileName, _ev, snapshot, email, meja);
            });
            M3Snack.Show(this, $"Tersimpan: {dlg.FileName}");
        }
        catch (Exception ex)
        {
            M3Snack.Show(this, $"Export gagal: {ex.Message}", isError: true);
        }
        finally
        {
            _exporting = false;
            if (btn != null) btn.IsEnabled = true;
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
