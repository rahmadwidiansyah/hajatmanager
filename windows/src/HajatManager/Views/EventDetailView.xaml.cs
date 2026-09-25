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

public partial class EventDetailView : UserControl
{
    private EventModel _ev;
    // Host MainWindow saat embed; null saat di dialog EventDetailWindow (BackBtn disembunyikan).
    private readonly MainWindow? _host;
    // Sembunyikan nominal di pill TopBar (cermin HideNominalBtn web).
    private bool _hideNominal;
    // Total nominal terakhir (dari rekap/server atau lokal) untuk NominalPill.
    private long _lastTotalNominal;
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

    public EventDetailView(EventModel ev, MainWindow? host)
    {
        _ev = ev;
        _host = host;
        // Pulihkan pilihan meja terakhir (cermin web localStorage + mobile SharedPrefs).
        // Tanpa ini tiap buka jendela balik ke MEJA-1.
        try
        {
            var saved = AppConfig.Instance.GetMejaFor(ev.Id);
            if (!string.IsNullOrEmpty(saved)) _meja = saved;
        }
        catch { }
        InitializeComponent();
        try { BackBtn.Visibility = host == null ? Visibility.Collapsed : Visibility.Visible; } catch { }
        TitleText.Text = ev.NamaAcara;
        TopRoleText.Text = ev.MyRole;
        try { InitTopBar(); } catch { }
        try { Focusable = true; } catch { }
        SizeChanged += (_, e) =>
        {
            if (RekapGrid != null)
                RekapGrid.Columns = e.NewSize.Width < 800 ? 1 : 2;
        };
        Loaded += async (_, _) => await RefreshAsync();
        // Shortcut cermin web/Task 9: Ctrl+1–4 tab, Ctrl+S simpan, Ctrl+R sync,
        // Escape tutup suggest, karakter bebas auto-fokus Nama.
        KeyDown += OnKeyDown;
        // Tab Setting dimuat malas saat pertama dibuka (cermin web loadMembers+loadAudit).
        Tabs.SelectionChanged += async (_, _) =>
        {
            if (Tabs.SelectedIndex == 3) await LoadSettingAsync();
        };
        // Auto-refresh saat background sync selesai / online berubah.
        SyncEngine.Instance.Changed += OnSyncChanged;
        System.Net.NetworkInformation.NetworkChange.NetworkAvailabilityChanged += OnNetChanged;
        Unloaded += (_, _) =>
        {
            try { SyncEngine.Instance.Changed -= OnSyncChanged; } catch { }
            try { System.Net.NetworkInformation.NetworkChange.NetworkAvailabilityChanged -= OnNetChanged; } catch { }
        };
    }

    // TopBar cermin TopBar.tsx: meja + nominal pill + kasir + role.
    private void InitTopBar()
    {
        try
        {
            if (MejaBox != null)
            {
                MejaBox.ItemsSource = _ev.MejaList.Count > 0 ? _ev.MejaList : new List<string> { "MEJA-1" };
                MejaBox.SelectedItem = _ev.MejaList.Contains(_meja) ? _meja : MejaBox.ItemsSource.Cast<string>().FirstOrDefault();
            }
        }
        catch { }
        RefreshTopBar();
    }

    private void RefreshTopBar()
    {
        try
        {
            if (TitleText != null) TitleText.Text = _ev.NamaAcara;
            if (TopRoleText != null) TopRoleText.Text = _ev.MyRole;
            try
            {
                // MejaList bisa diperbarui dari server (LoadMembers) setelah ctor.
                if (MejaBox != null)
                {
                    var src = _ev.MejaList.Count > 0 ? _ev.MejaList : new List<string> { "MEJA-1" };
                    MejaBox.ItemsSource = src;
                    MejaBox.SelectedItem = src.Contains(_meja) ? _meja : src.FirstOrDefault();
                }
            }
            catch { }
            try
            {
                var j = AppConfig.Instance.GetCachedUser() ?? "{}";
                using var doc = JsonDocument.Parse(j);
                var r = doc.RootElement;
                var name = r.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                if (string.IsNullOrWhiteSpace(name))
                    name = r.TryGetProperty("email", out var e) ? e.GetString() ?? "" : "";
                if (KasirText != null) KasirText.Text = string.IsNullOrWhiteSpace(name) ? "kasir" : name;
            }
            catch { if (KasirText != null) KasirText.Text = "kasir"; }
            UpdateNominalPill();
        }
        catch { }
    }

    private void UpdateNominalPill()
    {
        try
        {
            if (NominalPill == null) return;
            NominalPill.Text = _hideNominal ? "Rp ••••••" : GuestRow.FormatRp(_lastTotalNominal);
        }
        catch { }
    }

    private void OnToggleHideNominal(object sender, RoutedEventArgs e)
    {
        _hideNominal = !_hideNominal;
        UpdateNominalPill();
        try
        {
            if (TotalNominalText != null)
                TotalNominalText.Text = _hideNominal ? "Rp ••••••" : GuestRow.FormatRp(_lastTotalNominal);
        }
        catch { }
    }

    private void OnMejaChanged(object sender, SelectionChangedEventArgs e)
    {
        try
        {
            var sel = (MejaBox?.SelectedItem as string) ?? _meja;
            if (string.IsNullOrWhiteSpace(sel)) return;
            _meja = sel;
            try { AppConfig.Instance.SetMejaFor(_ev.Id, _meja); } catch { }
            try { if (_mejaBox != null && _mejaBox.Items.Contains(_meja)) _mejaBox.SelectedItem = _meja; } catch { }
        }
        catch { }
    }

    private void OnBack(object sender, RoutedEventArgs e)
    {
        try { _host?.GoEvents(null, new RoutedEventArgs()); } catch { }
    }

    // Menutup diri: kembali ke daftar saat embed, tutup window saat dialog.
    private void CloseSelf()
    {
        try
        {
            if (_host != null) _host.GoEvents(null, new RoutedEventArgs());
            else Window.GetWindow(this)?.Close();
        }
        catch { }
    }

    private void OnKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        try
        {
            var ctrl = (System.Windows.Input.Keyboard.Modifiers & System.Windows.Input.ModifierKeys.Control) != 0;
            if (ctrl)
            {
                if (e.Key == System.Windows.Input.Key.D1) { Tabs.SelectedIndex = 0; e.Handled = true; return; }
                if (e.Key == System.Windows.Input.Key.D2) { Tabs.SelectedIndex = 1; e.Handled = true; return; }
                if (e.Key == System.Windows.Input.Key.D3) { Tabs.SelectedIndex = 2; e.Handled = true; return; }
                if (e.Key == System.Windows.Input.Key.D4) { Tabs.SelectedIndex = 3; e.Handled = true; return; }
                if (e.Key == System.Windows.Input.Key.S)
                {
                    e.Handled = true;
                    if (Tabs.SelectedIndex == 0 && _ev.CanEdit && !_guestSaving)
                        _ = SaveGuestAsync();
                    else if (Tabs.SelectedIndex == 3 && _ev.CanEdit)
                        OnSaveInfo(this, new RoutedEventArgs());
                    return;
                }
                if (e.Key == System.Windows.Input.Key.R)
                {
                    e.Handled = true;
                    OnSync(this, new RoutedEventArgs());
                    return;
                }
            }
            if (!ctrl && !e.Handled && e.Key == System.Windows.Input.Key.Escape)
            {
                if (_suggestPopup?.IsOpen == true)
                {
                    _suggestPopup.IsOpen = false;
                    e.Handled = true;
                    return;
                }
            }
            // ← kembali ke daftar saat embed (Task 9). Diabaikan di dalam
            // input/teks/grid agar navigasi sel tidak terbajak.
            if (!ctrl && !e.Handled && e.Key == System.Windows.Input.Key.Left && _host != null)
            {
                var f = System.Windows.Input.Keyboard.FocusedElement as FrameworkElement;
                if (f is not TextBox && f is not PasswordBox && f is not ComboBox
                    && f is not DataGrid && f is not DatePicker)
                {
                    e.Handled = true;
                    OnBack(this, new RoutedEventArgs());
                    return;
                }
            }
            // Auto-fokus field Nama saat karakter diketik di luar input (tab Input).
            var active = System.Windows.Input.Keyboard.FocusedElement as FrameworkElement;
            if (!ctrl && !e.Handled && Tabs.SelectedIndex == 0
                && active is not TextBox && active is not ComboBox
                && e.Key.ToString().Length == 1 && _namaBox != null)
            {
                e.Handled = true;
                _namaBox.Focus();
            }
        }
        catch { }
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
        try { RefreshTopBar(); } catch { }
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
        try { M3Snack.Show(Window.GetWindow(this), "Acara sudah dihapus di server"); } catch { }
        try { CloseSelf(); } catch { }
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
            _guestSearchBox = new TextBox();
            _guestSearchBox.TextChanged += (_, _) => { _guestQ = _guestSearchBox.Text; _guestLimit = 50; ApplyGuestFilter(); };
            InputPanel.Children.Add(M3SearchField(_guestSearchBox, "Cari nama, alamat, meja…"));
            InputPanel.Children.Add(BuildFilterBar());
        }
        else
        {
            // Form 2 kolom cermin tab pemberian web (Task 5):
            // kiri nama+alamat, kanan nominal+metode, catatan full-width.
            // Pilihan meja milik TopBar (Task 4), tidak lagi di form.
            var grid = new UniformGrid { Columns = 2, Margin = new Thickness(0, 0, 0, 6) };
            // Kolom kiri: Nama (+ suggest) + Alamat (+ chips)
            var left = new StackPanel { Margin = new Thickness(0, 0, 6, 0) };
            left.Children.Add(M3Title("NAMA *"));
            _namaBox = new TextBox { TabIndex = 0 };
            _namaBox.ToolTip = "Ketik 2 huruf • ↑↓ pilih • Enter isi • Esc tutup";
            _namaBox.TextChanged += OnNamaTextChanged;
            _namaBox.PreviewKeyDown += OnNamaPreviewKey;
            left.Children.Add(_namaBox);
            _suggestList = new ListBox
            {
                MaxHeight = 200,
                MinWidth = 300,
                BorderThickness = new Thickness(0),
                Background = System.Windows.Media.Brushes.Transparent,
            };
            _suggestList.ItemTemplate = SuggestTemplate();
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
            // Popup mandiri (jangan masuk panel.Children — Popup bukan UIElement panel).
            left.Children.Add(M3Title("ALAMAT *", new Thickness(0, 6, 0, 4)));
            _alamatBox = new TextBox { TabIndex = 1 };
            _alamatBox.TextChanged += (_, _) => ScheduleDupCheck();
            left.Children.Add(_alamatBox);
            _alamatChips = new WrapPanel { Margin = new Thickness(0, 4, 0, 0) };
            left.Children.Add(_alamatChips);
            grid.Children.Add(left);
            // Kolom kanan: Nominal (preview + input + chips) + Metode
            var right = new StackPanel { Margin = new Thickness(6, 0, 0, 0) };
            right.Children.Add(M3Title("NOMINAL (Rp)"));
            _nominalPreview = new TextBlock
            {
                FontWeight = FontWeights.Bold,
                FontSize = 18,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 0, 0, 4),
            };
            if (Application.Current?.TryFindResource("NumericFont") is System.Windows.Media.FontFamily nf)
                _nominalPreview.FontFamily = nf;
            _nominalPreview.SetResourceReference(TextBlock.ForegroundProperty, "PrimaryBrush");
            right.Children.Add(_nominalPreview);
            _nominalBox = new TextBox { TabIndex = 2 };
            PreviewTextInputRegistrar.DigitsOnly(_nominalBox);
            _nominalBox.TextChanged += (_, _) =>
            {
                var t = new string((_nominalBox.Text ?? "").Where(char.IsDigit).ToArray());
                _nominalPreview.Text = long.TryParse(t, out var n) && n > 0 ? GuestRow.FormatRp(n) : "";
                RefreshChips();
            };
            right.Children.Add(_nominalBox);
            _nominalChips = new WrapPanel { Margin = new Thickness(0, 4, 0, 0) };
            right.Children.Add(_nominalChips);
            right.Children.Add(M3Title("METODE", new Thickness(0, 8, 0, 4)));
            // Metode = ChoiceChip cermin Flutter (AMPLOP/QRIS/TRANSFER + fallback
            // "(lama)" bila nilai tersimpan di luar ketiganya, cermin web).
            _metodeChips = new WrapPanel();
            RefreshMetodeChips();
            right.Children.Add(_metodeChips);
            grid.Children.Add(right);
            // Seluruh form (grid + catatan + banner + simpan) dalam satu kartu panel.
            var formBody = new StackPanel();
            formBody.Children.Add(grid);
            InputPanel.Children.Add(M3Field.Card(formBody));

            // Catatan: full-width di bawah 2 kolom (textarea 2 baris cermin web).
            formBody.Children.Add(M3Title("CATATAN (wajib jika duplikat)"));
            _catatanBox = new TextBox
            {
                TabIndex = 3,
                AcceptsReturn = true,
                MinHeight = 56,
                TextWrapping = TextWrapping.Wrap,
                VerticalContentAlignment = VerticalAlignment.Top,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            };
            _catatanBox.TextChanged += (_, _) => RefreshDupBanner();
            formBody.Children.Add(_catatanBox);

            _dupBanner = new Border
            {
                Margin = new Thickness(0, 6, 0, 0),
                Visibility = Visibility.Collapsed,
            };
            _dupBannerText = new TextBlock { TextWrapping = TextWrapping.Wrap };
            _dupBanner.Child = _dupBannerText;
            // Banner duplikat memakai M3BannerError (Task 1) cermin banner web.
            if (M3("M3BannerError") is Style bannerStyle)
                _dupBanner.Style = bannerStyle;
            else
            {
                ApplyM3Card(_dupBanner);
                _dupBanner.SetResourceReference(Border.BackgroundProperty, "ErrorContainerBrush");
            }
            _dupBannerText.SetResourceReference(TextBlock.ForegroundProperty, "OnErrorContainerBrush");
            formBody.Children.Add(_dupBanner);

            _saveBtn = new Button
            {
                Content = "Simpan (Ctrl+S)",
                Style = M3("PrimaryButton") ?? (Style)FindResource("PrimaryButton"),
                Margin = new Thickness(0, 6, 0, 0),
                HorizontalAlignment = HorizontalAlignment.Stretch,
                TabIndex = 4,
                ToolTip = "Simpan pemberian (Ctrl+S)",
            };
            _saveBtn.Click += async (_, _) => await SaveGuestAsync();
            formBody.Children.Add(_saveBtn);

            // Search + filter editor (cermin web + mobile).
            var title0 = new TextBlock { Text = "CARI & FILTER", Margin = new Thickness(0, 6, 0, 4) };
            if (M3("M3SectionTitle") is Style sts) title0.Style = sts;
            else title0.FontWeight = FontWeights.SemiBold;
            InputPanel.Children.Add(title0);
            _guestSearchBox = new TextBox();
            _guestSearchBox.TextChanged += (_, _) => { _guestQ = _guestSearchBox.Text; _guestLimit = 50; ApplyGuestFilter(); };
            InputPanel.Children.Add(M3SearchField(_guestSearchBox, "Cari nama, alamat, meja…"));
            InputPanel.Children.Add(BuildFilterBar());
            RefreshChips();
            RefreshDupBanner();
        }
        var title = new TextBlock
        {
            Text = "TERAKHIR DI PERANGKAT INI",
            Margin = new Thickness(0, 6, 0, 4)
        };
        if (M3("M3SectionTitle") is Style m3st) title.Style = m3st;
        else title.FontWeight = FontWeights.SemiBold;
        InputPanel.Children.Add(title);
        _guestGrid = new DataGrid
        {
            AutoGenerateColumns = false,
            IsReadOnly = true,
            MaxHeight = 380,
            HeadersVisibility = DataGridHeadersVisibility.Column,
        };
        _guestGrid.Columns.Add(new DataGridTextColumn { Header = "#", Binding = new System.Windows.Data.Binding("No"), Width = 50 });
        _guestGrid.Columns.Add(new DataGridTextColumn { Header = "Nama", Binding = new System.Windows.Data.Binding("NamaFull"), Width = new DataGridLength(1, DataGridLengthUnitType.Star) });
        _guestGrid.Columns.Add(new DataGridTextColumn { Header = "Alamat", Binding = new System.Windows.Data.Binding("Alamat"), Width = new DataGridLength(1, DataGridLengthUnitType.Star) });
        var nominalCol = new DataGridTextColumn { Header = "Nominal", Binding = new System.Windows.Data.Binding("NominalRp"), Width = 130 };
        try
        {
            var numStyle = new Style(typeof(TextBlock));
            if (Application.Current?.TryFindResource("NumericFont") is System.Windows.Media.FontFamily nf)
                numStyle.Setters.Add(new Setter(TextBlock.FontFamilyProperty, nf));
            numStyle.Setters.Add(new Setter(FrameworkElement.HorizontalAlignmentProperty, HorizontalAlignment.Right));
            nominalCol.ElementStyle = numStyle;
        }
        catch { }
        _guestGrid.Columns.Add(nominalCol);
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
            eb.SetValue(Button.ToolTipProperty, "Edit data");
            eb.AddHandler(Button.ClickEvent, new RoutedEventHandler(OnGridEdit));
            var db = new FrameworkElementFactory(typeof(Button));
            db.SetValue(Button.ContentProperty, "Hapus");
            db.SetValue(Button.ToolTipProperty, "Hapus data");
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

    // Search field berikon + placeholder cermin BookSearch XAML.
    // box dibuat pemanggil (handler filter tetap milik pemanggil); overlay
    // placeholder toggle otomatis via TextChanged internal.
    private static Grid M3SearchField(TextBox box, string hint)
    {
        box.BorderThickness = new Thickness(0);
        box.Background = System.Windows.Media.Brushes.Transparent;
        box.Padding = new Thickness(0, 6, 0, 6);
        box.FontSize = 13;
        var icon = new TextBlock
        {
            Text = "",
            FontFamily = new System.Windows.Media.FontFamily("Segoe MDL2 Assets"),
            FontSize = 14,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        };
        icon.SetResourceReference(TextBlock.ForegroundProperty, "OnVariantBrush");
        var inner = new Grid();
        inner.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(36) });
        inner.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        inner.Children.Add(icon);
        Grid.SetColumn(box, 1);
        inner.Children.Add(box);
        var frame = new Border
        {
            Child = inner,
            CornerRadius = new CornerRadius(8),
            BorderThickness = new Thickness(1),
            SnapsToDevicePixels = true,
        };
        frame.SetResourceReference(Border.BackgroundProperty, "CardBrush");
        frame.SetResourceReference(Border.BorderBrushProperty, "OutlineBrush");
        var overlay = new TextBlock
        {
            Text = hint,
            FontSize = 13,
            IsHitTestVisible = false,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(42, 0, 0, 0),
        };
        overlay.SetResourceReference(TextBlock.ForegroundProperty, "OnVariantBrush");
        var overlayStyle = new Style(typeof(TextBlock));
        overlayStyle.Setters.Add(new Setter(TextBlock.VisibilityProperty, Visibility.Collapsed));
        var showWhenEmpty = new DataTrigger
        {
            Binding = new System.Windows.Data.Binding("Text") { Source = box },
            Value = "",
        };
        showWhenEmpty.Setters.Add(new Setter(TextBlock.VisibilityProperty, Visibility.Visible));
        overlayStyle.Triggers.Add(showWhenEmpty);
        overlay.Style = overlayStyle;
        var outer = new Grid { Margin = new Thickness(0, 0, 0, 4) };
        outer.Children.Add(frame);
        outer.Children.Add(overlay);
        return outer;
    }

    // Judul seksi form cermin M3SectionTitle web (NAMA *, ALAMAT *, ...).
    private TextBlock M3Title(string text, Thickness? margin = null)
    {
        var t = new TextBlock { Text = text };
        if (M3("M3SectionTitle") is Style ts) t.Style = ts;
        else t.FontWeight = FontWeights.SemiBold;
        if (margin.HasValue) t.Margin = margin.Value;
        return t;
    }

    // Item suggest: nama bold + alamat kecil cermin dropdown web (Task 5).
    private static DataTemplate SuggestTemplate()
    {
        var root = new FrameworkElementFactory(typeof(StackPanel));
        root.SetValue(StackPanel.OrientationProperty, Orientation.Vertical);
        var nama = new FrameworkElementFactory(typeof(TextBlock));
        nama.SetBinding(TextBlock.TextProperty, new System.Windows.Data.Binding("Nama"));
        nama.SetValue(TextBlock.FontWeightProperty, FontWeights.SemiBold);
        nama.SetValue(TextBlock.FontSizeProperty, 13.0);
        nama.SetValue(FrameworkElement.MarginProperty, new Thickness(6, 5, 6, 0));
        var alamat = new FrameworkElementFactory(typeof(TextBlock));
        alamat.SetBinding(TextBlock.TextProperty, new System.Windows.Data.Binding("Alamat"));
        alamat.SetValue(TextBlock.FontSizeProperty, 12.0);
        alamat.SetResourceReference(TextBlock.ForegroundProperty, "OnVariantBrush");
        alamat.SetValue(FrameworkElement.MarginProperty, new Thickness(6, 0, 6, 5));
        root.AppendChild(nama);
        root.AppendChild(alamat);
        return new DataTemplate { VisualTree = root };
    }

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
        _suggestList.ItemsSource = _suggestItems.ToList();
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
        // Lanjut ke nominal cermin alur web (nama+alamat sudah terisi dari buku tamu).
        try { _nominalBox?.Focus(); } catch { }
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
            // Merge shortcut + default, deduplicate, sort, max 6 cermin web:
            // const nominalOptions = Array.from(new Set(merged)).sort().slice(0, 6)
            var merged = _nominalTops.Select(n => n.Nominal)
                .Concat(new long[] { 50000, 100000, 200000 })
                .Distinct().OrderBy(n => n).Take(6);
            var cur = new string((_nominalBox?.Text ?? "").Where(char.IsDigit).ToArray());
            foreach (var nominal in merged)
            {
                var tag = nominal.ToString();
                var count = _nominalTops.FirstOrDefault(t => t.Nominal == nominal)?.Jumlah ?? 0;
                var b = new Button
                {
                    Content = count > 0 ? $"{GuestRow.FormatRp(nominal)} • {count}" : GuestRow.FormatRp(nominal),
                    Tag = tag,
                };
                ApplyChip(b, cur == tag);
                b.Click += (s, _) =>
                {
                    if (_nominalBox != null && s is Button btn && btn.Tag is string tg)
                        _nominalBox.Text = tg;
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
            _saveBtn.Content = dup ? "Simpan dengan Catatan" : "Simpan (Ctrl+S)";
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
        if (MessageBox.Show(Window.GetWindow(this), $"Hapus {r.Nama}?", "Hapus",
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
            M3Snack.Show(Window.GetWindow(this), "Lengkapi nama (min 2), alamat (min 2), nominal > 0.", isError: true);
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
            PetugasId = email, MejaLabel = _mejaBox?.SelectedItem as string ?? _meja,
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
        // Konten dibungkus M3DialogCard cermin Modal web (Task 6).
        var card = new Border { Child = content };
        if (M3("M3DialogCard") is Style ds) card.Style = ds;
        else
        {
            card.Padding = new Thickness(20);
            card.CornerRadius = new CornerRadius(12);
            card.BorderThickness = new Thickness(1);
            card.SetResourceReference(Border.BackgroundProperty, "CardBrush");
            card.SetResourceReference(Border.BorderBrushProperty, "OutlineBrush");
        }
        var win = new Window
        {
            Title = title, Width = 480, Height = height,
            WindowStartupLocation = WindowStartupLocation.CenterOwner, Owner = Window.GetWindow(this),
            Content = card,
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

    // Tombol Batal standar dialog (menutup window pemilik).
    private static Button M3Cancel(Func<Window?> getWin)
    {
        var b = new Button { Content = "Batal", Margin = new Thickness(0, 12, 8, 0) };
        if (M3("OutlineButton") is Style s) b.Style = s;
        b.Click += (_, _) => { try { getWin()?.Close(); } catch { } };
        return b;
    }

    private static StackPanel M3DialogActions(params Button[] buttons)
    {
        var row = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
        };
        foreach (var b in buttons) row.Children.Add(b);
        return row;
    }

    private void EditGuestDialog(GuestModel g)
    {
        var nb = new TextBox { Text = g.Nama, Margin = new Thickness(0, 0, 0, 6) };
        var ab = new TextBox { Text = g.Alamat, Margin = new Thickness(0, 0, 0, 6) };
        var nob = new TextBox { Text = g.Nominal.ToString(), Margin = new Thickness(0, 0, 0, 6) };
        PreviewTextInputRegistrar.DigitsOnly(nob);
        var save = M3Primary("Simpan");
        Window? win = null;
        win = M3Dialog("Edit Pemberian", new StackPanel
        {
            Margin = new Thickness(0),
            Children = {
                    M3Label("Nama"), nb,
                    M3Label("Alamat"), ab,
                    M3Label("Nominal"), nob,
                    M3DialogActions(M3Cancel(() => win), save),
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
        Window? win = null;
        win = M3Dialog("Buku tamu baru", new StackPanel
        {
            Margin = new Thickness(0),
            Children = {
                    M3Label("Nama"), n,
                    M3Label("Alamat", new Thickness(0,8,0,4)), a,
                    errBk,
                    M3DialogActions(M3Cancel(() => win), save),
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
        Window? win = null;
        win = M3Dialog("Edit buku tamu", new StackPanel
        {
            Margin = new Thickness(0),
            Children = { M3Label("Nama"), n,
                    M3Label("Alamat", new Thickness(0,8,0,4)), a,
                    M3DialogActions(M3Cancel(() => win), save) }
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
        if (MessageBox.Show(Window.GetWindow(this), $"Hapus {b.Nama}?", "Hapus",
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
        public string Porsi { get; set; } = "";
    }

    private static string Pct(long part, long total) =>
        total > 0 ? $"{(int)Math.Round(part * 100.0 / total)}%" : "0%";

    private async Task RefreshRekapAsync()
    {
        try
        {
            var doc = await ApiClient.Instance.GetAsync($"/api/events/{_ev.Id}/rekap");
            if (doc == null) return;
            var r = doc.RootElement;
            TotalTamuText.Text = $"{r.GetProperty("totalTamu").GetInt32()} tamu";
            _lastTotalNominal = r.GetProperty("totalNominal").GetInt64();
            TotalNominalText.Text = _hideNominal ? "Rp ••••••" : GuestRow.FormatRp(_lastTotalNominal);
            UpdateNominalPill();
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
                Porsi = Pct(x.GetProperty("total").GetInt64(), _lastTotalNominal),
            }).ToList();
        }
        catch
        {
            // Offline: hitung dari SQLite lokal.
            var total = _guests.Sum(g => g.Nominal);
            _lastTotalNominal = total;
            TotalTamuText.Text = $"{_guests.Count} tamu (lokal)";
            TotalNominalText.Text = _hideNominal ? "Rp ••••••" : GuestRow.FormatRp(total);
            UpdateNominalPill();
            AlamatGrid.ItemsSource = _guests.GroupBy(g => g.Alamat).Select(g => new RekapRow
            {
                Label = g.Key, Jumlah = g.Count(),
                TotalRp = GuestRow.FormatRp(g.Sum(x => x.Nominal)),
            }).ToList();
            MetodeGrid.ItemsSource = _guests.GroupBy(g => g.Metode).Select(g => new RekapRow
            {
                Label = g.Key, Jumlah = g.Count(),
                TotalRp = GuestRow.FormatRp(g.Sum(x => x.Nominal)),
                Porsi = Pct(g.Sum(x => x.Nominal), total),
            }).ToList();
        }
    }

    // Dialog opsi export cermin exportModal web (Task 6): tipe, format, urutan, orientasi.
    private async void OnExport(object sender, RoutedEventArgs e)
    {
        if (_exporting) return;
        _exporting = true;
        var btn = sender as System.Windows.Controls.Button;
        if (btn != null) btn.IsEnabled = false;
        try
        {
            var tipePemberian = new RadioButton { Content = "Pemberian", IsChecked = true };
            var tipeTamu = new RadioButton { Content = "Buku Tamu", Margin = new Thickness(10, 0, 0, 0) };
            var tipeRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 10) };
            tipeRow.Children.Add(tipePemberian);
            tipeRow.Children.Add(tipeTamu);
            var fmtPdf = new RadioButton { Content = "PDF", IsChecked = true, Margin = new Thickness(0, 0, 10, 0) };
            var fmtXlsx = new RadioButton { Content = "Excel / CSV" };
            var fmtRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 10) };
            fmtRow.Children.Add(fmtPdf);
            fmtRow.Children.Add(fmtXlsx);
            var orderBox = new ComboBox { Margin = new Thickness(0, 0, 0, 10) };
            orderBox.Items.Add(new ComboBoxItem { Content = "Nama A–Z", Tag = "nama_az" });
            orderBox.Items.Add(new ComboBoxItem { Content = "Nama Z–A", Tag = "nama_za" });
            orderBox.Items.Add(new ComboBoxItem { Content = "Alamat A–Z", Tag = "alamat_az" });
            orderBox.Items.Add(new ComboBoxItem { Content = "Nominal ↓", Tag = "nominal_desc" });
            orderBox.Items.Add(new ComboBoxItem { Content = "Waktu ↓", Tag = "waktu_desc" });
            orderBox.SelectedIndex = 0;
            var oriLand = new RadioButton { Content = "Landscape", IsChecked = true, Margin = new Thickness(0, 0, 10, 0) };
            var oriPort = new RadioButton { Content = "Portrait" };
            var oriRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 6) };
            oriRow.Children.Add(oriLand);
            oriRow.Children.Add(oriPort);
            var goBtn = M3Primary("Export");
            goBtn.Margin = new Thickness(0, 12, 0, 0);
            Window? win = null;
            var body = new StackPanel
            {
                Margin = new Thickness(0),
                Children = {
                    M3Label("Tipe data"), tipeRow,
                    M3Label("Format"), fmtRow,
                    M3Label("Urutan"), orderBox,
                    M3Label("Orientasi (PDF)"), oriRow,
                    M3DialogActions(M3Cancel(() => win), goBtn),
                }
            };
            win = M3Dialog("Export Data", body, 440);
            var chosen = false;
            goBtn.Click += (_, _) => { chosen = true; try { win?.Close(); } catch { } };
            win.ShowDialog();
            if (!chosen) return;

            var isBooks = tipeTamu.IsChecked == true;
            var isXlsx = fmtXlsx.IsChecked == true;
            var order = ((orderBox.SelectedItem as ComboBoxItem)?.Tag as string) ?? "nama_az";
            var landscape = oriLand.IsChecked == true;
            var kind = isBooks ? "Buku Tamu" : "Pemberian";
            var safeName = string.Concat((_ev.NamaAcara ?? "acara").Split(Path.GetInvalidFileNameChars()));
            if (string.IsNullOrWhiteSpace(safeName)) safeName = "acara";
            var ext = isXlsx ? "xlsx" : "pdf";
            var dlg = new Microsoft.Win32.SaveFileDialog
            {
                FileName = $"{safeName}-{kind.ToLowerInvariant().Replace(" ", "-")}-{DateTime.Now:yyyy-MM-dd}.{ext}",
                Filter = isXlsx ? "Excel (*.xlsx)|*.xlsx" : "PDF (*.pdf)|*.pdf",
            };
            if (dlg.ShowDialog() != true) return;
            var snapshot = BuildExportSnapshot(isBooks, order);
            var email = UserEmail();
            var meja = _meja;
            await Task.Run(() =>
            {
                if (isXlsx)
                    Services.Exporter.ExportXlsx(dlg.FileName, _ev, snapshot, kind);
                else
                    Services.Exporter.ExportPdf(dlg.FileName, _ev, snapshot, email, meja, landscape, kind);
            });
            M3Snack.Show(Window.GetWindow(this), $"Tersimpan: {dlg.FileName}");
        }
        catch (Exception ex)
        {
            M3Snack.Show(Window.GetWindow(this), $"Export gagal: {ex.Message}", isError: true);
        }
        finally
        {
            _exporting = false;
            if (btn != null) btn.IsEnabled = true;
        }
    }

    // Snapshot export sesuai tipe + urutan dialog (cermin exportModal web).
    private List<GuestModel> BuildExportSnapshot(bool books, string order)
    {
        List<GuestModel> list;
        if (books)
        {
            list = _books.Select(b => new GuestModel
            {
                EventId = _ev.Id, Nama = b.Nama, Alamat = b.Alamat,
                Nominal = 0, Metode = "—", CreatedAt = b.CreatedAt, UpdatedAt = b.CreatedAt,
            }).ToList();
        }
        else list = _guests.ToList();
        return order switch
        {
            "nama_za" => list.OrderByDescending(g => g.Nama, StringComparer.OrdinalIgnoreCase).ToList(),
            "alamat_az" => list.OrderBy(g => g.Alamat, StringComparer.OrdinalIgnoreCase).ToList(),
            "nominal_desc" => list.OrderByDescending(g => g.Nominal).ToList(),
            "waktu_desc" => list.OrderByDescending(g => g.CreatedAt).ToList(),
            _ => list.OrderBy(g => g.Nama, StringComparer.OrdinalIgnoreCase).ToList(),
        };
    }

    // ================= Tab Setting (Task 7, porting SettingsWindow) =================
    private readonly List<string> _settingMeja = new();
    private CancellationTokenSource? _settingSearchCts;
    private System.Windows.Threading.DispatcherTimer? _logTimer;
    private bool _savingInfo, _addingMember, _settingLoading;
    private string _logQ = "";

    public sealed class AuditRow
    {
        public string Waktu { get; set; } = "";
        public string User { get; set; } = "";
        public string Aksi { get; set; } = "";
    }

    private void RefreshSettingAccess()
    {
        try
        {
            if (SettingMemberBox != null)
                SettingMemberBox.Visibility = _ev.IsOwner ? Visibility.Visible : Visibility.Collapsed;
            if (DeleteBtn != null)
                DeleteBtn.Visibility = _ev.IsOwner ? Visibility.Visible : Visibility.Collapsed;
            if (SettingSaveBtn != null) SettingSaveBtn.IsEnabled = _ev.CanEdit;
            if (SettingViewerNote != null)
                SettingViewerNote.Visibility = _ev.CanEdit ? Visibility.Collapsed : Visibility.Visible;
            if (SettingNamaBox != null) SettingNamaBox.IsEnabled = _ev.CanEdit;
            if (SettingTuanBox != null) SettingTuanBox.IsEnabled = _ev.CanEdit;
            if (SettingTglPicker != null) SettingTglPicker.IsEnabled = _ev.CanEdit;
            if (SettingLokBox != null) SettingLokBox.IsEnabled = _ev.CanEdit;
            if (SettingCatBox != null) SettingCatBox.IsEnabled = _ev.CanEdit;
        }
        catch { }
    }

    private async Task LoadSettingAsync()
    {
        if (_settingLoading) return;
        _settingLoading = true;
        try
        {
            RefreshSettingAccess();
            // Fallback lokal dulu agar form tidak kosong saat offline.
            try
            {
                SettingNamaBox.Text = _ev.NamaAcara;
                SettingTuanBox.Text = _ev.NamaTuanRumah ?? "";
                SettingLokBox.Text = _ev.Lokasi ?? "";
                SettingCatBox.Text = _ev.Catatan ?? "";
                SettingTglPicker.SelectedDate = _ev.Tanggal;
            }
            catch { }
            var doc = await ApiClient.Instance.GetAsync($"/api/events/{_ev.Id}");
            if (doc == null) return;
            var r = doc.RootElement;
            try
            {
                SettingNamaBox.Text = r.TryGetProperty("namaAcara", out var n) ? n.GetString() ?? "" : "";
                SettingTuanBox.Text = r.TryGetProperty("namaTuanRumah", out var t) && t.ValueKind != JsonValueKind.Null ? t.GetString() ?? "" : "";
                SettingLokBox.Text = r.TryGetProperty("lokasi", out var l) && l.ValueKind != JsonValueKind.Null ? l.GetString() ?? "" : "";
                SettingCatBox.Text = r.TryGetProperty("catatan", out var c) && c.ValueKind != JsonValueKind.Null ? c.GetString() ?? "" : "";
                if (r.TryGetProperty("tanggal", out var tg) && tg.ValueKind == JsonValueKind.String &&
                    DateTime.TryParse(tg.GetString(), out var d))
                    SettingTglPicker.SelectedDate = d;
            }
            catch { }
            try
            {
                _settingMeja.Clear();
                if (r.TryGetProperty("mejaList", out var ml))
                    foreach (var m in ml.EnumerateArray())
                        _settingMeja.Add(m.GetString() ?? "");
                RebuildSettingMejaChips();
            }
            catch { }
            try
            {
                if (r.TryGetProperty("members", out var ms))
                {
                    SettingMemberGrid.ItemsSource = ms.EnumerateArray().Select(m => new MemberModel
                    {
                        UserId = SettingMemberUid(m),
                        Role = m.TryGetProperty("role", out var ro) ? ro.GetString() ?? "VIEWER" : "VIEWER",
                        Name = m.TryGetProperty("user", out var u) && u.TryGetProperty("name", out var nm) ? nm.GetString() ?? "" : "",
                        Email = m.TryGetProperty("user", out var u2) && u2.TryGetProperty("email", out var em) ? em.GetString() ?? "" : "",
                    }).ToList();
                }
            }
            catch { }
            await LoadAuditAsync();
        }
        catch { }
        finally { _settingLoading = false; }
    }

    private static string SettingMemberUid(JsonElement m)
    {
        if (m.TryGetProperty("userId", out var u)) return u.GetString() ?? "";
        if (m.TryGetProperty("user", out var usr) && usr.TryGetProperty("id", out var id))
            return id.GetString() ?? "";
        return "";
    }

    private async void OnSaveInfo(object sender, RoutedEventArgs e)
    {
        if (_savingInfo || !_ev.CanEdit) return;
        _savingInfo = true;
        var btn = sender as System.Windows.Controls.Button;
        if (btn != null) btn.IsEnabled = false;
        try
        {
            var payload = new Dictionary<string, object?>
            {
                ["namaAcara"] = SettingNamaBox.Text,
                ["namaTuanRumah"] = SettingTuanBox.Text,
                ["lokasi"] = SettingLokBox.Text,
                ["catatan"] = string.IsNullOrWhiteSpace(SettingCatBox.Text) ? null : SettingCatBox.Text,
                ["mejaList"] = _settingMeja,
            };
            if (SettingTglPicker.SelectedDate is DateTime tgl)
                payload["tanggal"] = tgl.ToString("yyyy-MM-dd");
            using var resp = await ApiClient.Instance.PatchJsonAsync($"/api/events/{_ev.Id}", payload);
            if (resp.IsSuccessStatusCode)
            {
                // Sinkronkan model lokal + TopBar (judul!) + meja TopBar.
                _ev.NamaAcara = SettingNamaBox.Text;
                _ev.NamaTuanRumah = SettingTuanBox.Text;
                _ev.Lokasi = SettingLokBox.Text;
                _ev.Catatan = string.IsNullOrWhiteSpace(SettingCatBox.Text) ? null : SettingCatBox.Text;
                if (SettingTglPicker.SelectedDate is DateTime t2) _ev.Tanggal = t2;
                _ev.MejaList = _settingMeja.ToList();
                if (!_ev.MejaList.Contains(_meja))
                {
                    _meja = _ev.MejaList.FirstOrDefault() ?? "MEJA-1";
                    try { AppConfig.Instance.SetMejaFor(_ev.Id, _meja); } catch { }
                }
                RefreshTopBar();
                M3Snack.Show(Window.GetWindow(this), "Tersimpan");
            }
            else M3Snack.Show(Window.GetWindow(this), "Gagal simpan", isError: true);
        }
        catch { M3Snack.Show(Window.GetWindow(this), "Tidak ada koneksi", isError: true); }
        finally { _savingInfo = false; if (btn != null) btn.IsEnabled = _ev.CanEdit; }
    }

    // Chip meja deletable cermin Flutter (× per chip + PATCH).
    private void RebuildSettingMejaChips(bool push = false)
    {
        try
        {
            if (SettingMejaChips == null) return;
            SettingMejaChips.Children.Clear();
            foreach (var m in _settingMeja.ToList())
            {
                var chip = new Border
                {
                    Margin = new Thickness(0, 0, 6, 4),
                    Padding = new Thickness(10, 4, 4, 4),
                    CornerRadius = new CornerRadius(6),
                    BorderThickness = new Thickness(1),
                };
                chip.SetResourceReference(Border.BackgroundProperty, "SurfaceContainerHighBrush");
                chip.SetResourceReference(Border.BorderBrushProperty, "OutlineBrush");
                var row = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
                var label = new TextBlock { Text = m, VerticalAlignment = VerticalAlignment.Center };
                label.SetResourceReference(TextBlock.ForegroundProperty, "OnSurfaceBrush");
                row.Children.Add(label);
                var x = new Button
                {
                    Content = new TextBlock
                    {
                        Text = "×",
                        FontSize = 13,
                        FontWeight = FontWeights.Bold,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                    },
                    Width = 22, Height = 22,
                    Margin = new Thickness(6, 0, 0, 0),
                    Padding = new Thickness(0),
                    Tag = m,
                    ToolTip = $"Hapus {m}",
                };
                if (M3("TextButton") is Style tbs) x.Style = tbs;
                x.Click += (s, _) =>
                {
                    if (s is Button b && b.Tag is string tag)
                    {
                        _settingMeja.Remove(tag);
                        RebuildSettingMejaChips(push: true);
                    }
                };
                row.Children.Add(x);
                chip.Child = row;
                SettingMejaChips.Children.Add(chip);
            }
            SyncMejaFromSetting();
        }
        catch { }
        if (push)
        {
            _ = PushSettingMejaAsync();
        }
    }

    private void SyncMejaFromSetting()
    {
        try
        {
            _ev.MejaList = _settingMeja.ToList();
            if (!_ev.MejaList.Contains(_meja))
            {
                _meja = _ev.MejaList.FirstOrDefault() ?? "MEJA-1";
                try { AppConfig.Instance.SetMejaFor(_ev.Id, _meja); } catch { }
            }
            RefreshTopBar();
        }
        catch { }
    }

    private async Task PushSettingMejaAsync()
    {
        try
        {
            using var _ = await ApiClient.Instance.PatchJsonAsync($"/api/events/{_ev.Id}",
                new { mejaList = _settingMeja });
        }
        catch { }
    }

    private void OnAddSettingMeja(object sender, RoutedEventArgs e)
    {
        try
        {
            var v = (SettingMejaBox?.Text ?? "").Trim().ToUpperInvariant();
            if (v.Length == 0 || _settingMeja.Contains(v) || _settingMeja.Count >= 10) return;
            _settingMeja.Add(v);
            if (SettingMejaBox != null) SettingMejaBox.Text = "";
            RebuildSettingMejaChips(push: true);
        }
        catch { }
    }

    private async void OnSettingUserSearch(object sender, TextChangedEventArgs e)
    {
        _settingSearchCts?.Cancel();
        var cts = _settingSearchCts = new CancellationTokenSource();
        var q = (SettingUserSearch?.Text ?? "").Trim();
        if (q.Length < 2)
        {
            try { if (SettingResultList != null) SettingResultList.ItemsSource = null; } catch { }
            return;
        }
        try
        {
            await Task.Delay(350, cts.Token);
            var doc = await ApiClient.Instance.GetAsync(
                "/api/users/search?" + ApiClient.BuildQuery(new() { ["q"] = q }));
            if (cts.IsCancellationRequested) return;
            if (SettingResultList != null)
                SettingResultList.ItemsSource = doc?.RootElement.EnumerateArray()
                    .Select(u =>
                    {
                        var nm = u.TryGetProperty("name", out var n) ? n.GetString() : "";
                        var em = u.TryGetProperty("email", out var e2) ? e2.GetString() : "";
                        return $"{nm} <{em}>|{u.GetProperty("id").GetString()}";
                    })
                    .ToList();
        }
        catch { }
    }

    private string SelectedSettingAddRole()
    {
        try
        {
            if (SettingRoleBox?.SelectedItem is ComboBoxItem it &&
                it.Content is string s && (s == "OWNER" || s == "ADMIN" || s == "VIEWER"))
                return s;
        }
        catch { }
        return "ADMIN";
    }

    private void OnAddSettingMember(object sender, RoutedEventArgs e) => _ = AddSettingMemberAsync();

    private void OnAddSettingMemberDbl(object sender, System.Windows.Input.MouseButtonEventArgs e) =>
        _ = AddSettingMemberAsync();

    private async Task AddSettingMemberAsync()
    {
        if (_addingMember) return;
        if (SettingResultList?.SelectedItem is not string s) return;
        var id = s.Contains('|') ? s.Split('|')[^1] : "";
        if (string.IsNullOrEmpty(id)) return;
        _addingMember = true;
        try
        {
            using var r = await ApiClient.Instance.PostJsonAsync(
                $"/api/events/{_ev.Id}/members",
                new { userId = id, role = SelectedSettingAddRole() });
            if (r.IsSuccessStatusCode)
            {
                try
                {
                    if (SettingUserSearch != null) SettingUserSearch.Text = "";
                    if (SettingResultList != null) SettingResultList.ItemsSource = null;
                }
                catch { }
                await LoadSettingAsync();
            }
            else
            {
                M3Snack.Show(Window.GetWindow(this),
                    await ApiClient.Instance.TryErrAsync(r, "Gagal tambah") ?? "Gagal",
                    isError: true);
            }
        }
        catch { M3Snack.Show(Window.GetWindow(this), "Butuh online.", isError: true); }
        finally { _addingMember = false; }
    }

    private void OnEditSettingMember(object sender, RoutedEventArgs e)
    {
        MemberModel m;
        try { m = (MemberModel)((FrameworkElement)sender).DataContext; }
        catch { return; }
        var roles = new[] { "VIEWER", "ADMIN", "OWNER" };
        var box = new ComboBox { Margin = new Thickness(0, 8, 0, 0), MinWidth = 200 };
        foreach (var r in roles) box.Items.Add(new ComboBoxItem { Content = r });
        box.SelectedIndex = Math.Max(0, Array.IndexOf(roles, m.Role));
        var err = new TextBlock { Margin = new Thickness(0, 8, 0, 0), TextWrapping = TextWrapping.Wrap };
        err.SetResourceReference(TextBlock.ForegroundProperty, "ErrorBrush");
        var simpan = M3Primary("Simpan");
        simpan.Margin = new Thickness(0, 12, 0, 0);
        Window? win = null;
        var batal = new Button { Content = "Batal", Margin = new Thickness(8, 12, 0, 0) };
        if (M3("TextButton") is Style ts) batal.Style = ts;
        batal.Click += (_, _) => { try { win?.Close(); } catch { } };
        var row = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
        };
        row.Children.Add(simpan);
        row.Children.Add(batal);
        win = M3Dialog($"Ubah role — {m.Name}", new StackPanel
        {
            Margin = new Thickness(0),
            Children = {
                new TextBlock { Text = $"Role baru untuk {m.Email}:", TextWrapping = TextWrapping.Wrap },
                box, err, row,
            }
        }, 300);
        simpan.Click += async (_, _) =>
        {
            var role = (box.SelectedItem as ComboBoxItem)?.Content as string ?? m.Role;
            if (role == m.Role) { try { win?.Close(); } catch { } return; }
            simpan.IsEnabled = false;
            try
            {
                using var r = await ApiClient.Instance.PatchJsonAsync(
                    $"/api/events/{_ev.Id}/members",
                    new { userId = m.UserId, role });
                if (r.IsSuccessStatusCode)
                {
                    try { win?.Close(); } catch { }
                    M3Snack.Show(Window.GetWindow(this), $"Role {m.Name} → {role}");
                    await LoadSettingAsync();
                }
                else
                {
                    err.Text = await ApiClient.Instance.TryErrAsync(r, "Gagal ubah role") ?? "Gagal";
                }
            }
            catch { err.Text = "Butuh online."; }
            finally { try { simpan.IsEnabled = true; } catch { } }
        };
        win.ShowDialog();
    }

    private async void OnRemoveSettingMember(object sender, RoutedEventArgs e)
    {
        MemberModel m;
        try { m = (MemberModel)((FrameworkElement)sender).DataContext; }
        catch { return; }
        if (MessageBox.Show(Window.GetWindow(this), $"Keluarkan {m.Name} dari acara?",
                "Keluarkan anggota", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
            return;
        try
        {
            using var r = await ApiClient.Instance.DeleteAsync(
                $"/api/events/{_ev.Id}/members?userId={Uri.EscapeDataString(m.UserId)}");
            if (r.IsSuccessStatusCode) await LoadSettingAsync();
            else M3Snack.Show(Window.GetWindow(this), "Gagal mengeluarkan anggota.", isError: true);
        }
        catch { M3Snack.Show(Window.GetWindow(this), "Butuh online.", isError: true); }
    }

    private void OnLogSearch(object sender, TextChangedEventArgs e)
    {
        _logQ = (LogSearchBox?.Text ?? "").Trim();
        _logTimer?.Stop();
        _logTimer = new System.Windows.Threading.DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(300),
        };
        _logTimer.Tick += async (_, _) =>
        {
            _logTimer?.Stop();
            await LoadAuditAsync();
        };
        _logTimer.Start();
    }

    private async Task LoadAuditAsync()
    {
        try
        {
            var q = new Dictionary<string, string?> { ["limit"] = "30" };
            if (!string.IsNullOrWhiteSpace(_logQ)) q["q"] = _logQ;
            var doc = await ApiClient.Instance.GetAsync(
                $"/api/events/{_ev.Id}/audit-logs?" + ApiClient.BuildQuery(q));
            if (doc == null || AuditGrid == null) return;
            AuditGrid.ItemsSource = doc.RootElement.GetProperty("logs").EnumerateArray().Select(l => new AuditRow
            {
                Aksi = l.TryGetProperty("aksi", out var ak) ? ak.GetString() ?? "" : "",
                User = l.TryGetProperty("user", out var u)
                    ? (u.TryGetProperty("name", out var n) ? n.GetString() : u.TryGetProperty("email", out var em) ? em.GetString() : "?") ?? "?"
                    : "?",
                Waktu = l.TryGetProperty("createdAt", out var c) && c.TryGetDateTime(out var d)
                    ? d.ToLocalTime().ToString("dd/MM HH:mm") : "",
            }).ToList();
        }
        catch { }
    }

    // Danger zone cermin Flutter/web: ketik HAPUS untuk konfirmasi.
    private void OnDelete(object sender, RoutedEventArgs e)
    {
        var box = new TextBox { Margin = new Thickness(0, 8, 0, 0) };
        var err = new TextBlock { Margin = new Thickness(0, 8, 0, 0), TextWrapping = TextWrapping.Wrap };
        err.SetResourceReference(TextBlock.ForegroundProperty, "ErrorBrush");
        var hapus = new Button { Content = "Hapus Permanen", Margin = new Thickness(8, 12, 0, 0), IsEnabled = false };
        if (M3("DangerButton") is Style ds) hapus.Style = ds;
        Window? win = null;
        var cancel = new Button { Content = "Batal", Margin = new Thickness(0, 12, 8, 0) };
        if (M3("TextButton") is Style ts) cancel.Style = ts;
        cancel.Click += (_, _) => { try { win?.Close(); } catch { } };
        var row = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
        };
        row.Children.Add(cancel);
        row.Children.Add(hapus);
        win = M3Dialog("Hapus Acara Permanen", new StackPanel
        {
            Margin = new Thickness(0),
            Children = {
                new TextBlock
                {
                    Text = "Hapus acara ini permanen beserta semua datanya? Tindakan tidak bisa dibatalkan.\n\nKetik HAPUS untuk melanjutkan.",
                    TextWrapping = TextWrapping.Wrap,
                },
                box, err, row,
            }
        }, 320);
        box.TextChanged += (_, _) => { try { hapus.IsEnabled = box.Text.Trim() == "HAPUS"; } catch { } };
        hapus.Click += async (_, _) =>
        {
            hapus.IsEnabled = false;
            try
            {
                using var r = await ApiClient.Instance.DeleteAsync($"/api/events/{_ev.Id}");
                if (r.IsSuccessStatusCode)
                {
                    await Data.LocalDb.Instance.DeleteEventLocalAsync(_ev.Id);
                    try { win?.Close(); } catch { }
                    CloseSelf();
                    return;
                }
                err.Text = "Gagal menghapus — coba lagi.";
            }
            catch { err.Text = "Hapus butuh online."; }
            finally { try { hapus.IsEnabled = box.Text.Trim() == "HAPUS"; } catch { } }
        };
        win.ShowDialog();
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
