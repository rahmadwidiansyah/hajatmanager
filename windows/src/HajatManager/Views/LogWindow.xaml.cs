using System.Windows;
using System.Windows.Controls;
using HajatManager.Api;

namespace HajatManager.Views;

public partial class LogWindow : Window
{
    private readonly string _eventId;
    private int _page = 1;

    public sealed class Row
    {
        public string Aksi { get; set; } = "";
        public string Oleh { get; set; } = "";
        public string Waktu { get; set; } = "";
    }

    public LogWindow(string eventId, string eventName)
    {
        _eventId = eventId;
        InitializeComponent();
        Title = $"Log • {eventName}";
        BuildAksiChips();
        M3Chrome.Attach(this);
        // Ctrl+F fokus ke pencarian (cermin mobile CallbackShortcuts).
        try
        {
            KeyDown += (_, e) =>
            {
                if (e.Key == System.Windows.Input.Key.F &&
                    (System.Windows.Input.Keyboard.Modifiers & System.Windows.Input.ModifierKeys.Control) != 0)
                {
                    try { SearchBox.Focus(); } catch { }
                    e.Handled = true;
                }
            };
            Focusable = true;
        }
        catch { }
        Loaded += async (_, _) => await LoadAsync(reset: true);
    }

    // Filter aksi = chips horizontal cermin Flutter (bukan dropdown).
    private static readonly string[] AksiOptions =
    {
        "Semua", "CREATE_GUEST", "UPDATE_GUEST", "DELETE_GUEST",
        "CREATE_EVENT", "UPDATE_EVENT", "SYNC_ONLINE", "PUSH_SYNC",
    };

    private string _aksiFilter = "Semua";

    private static void ApplyChip(Button b, bool active)
    {
        var key = active ? "M3ChipActive" : "M3Chip";
        if (Application.Current?.TryFindResource(key) is Style s) b.Style = s;
        else if (active) b.FontWeight = FontWeights.Bold;
    }

    private void BuildAksiChips()
    {
        try
        {
            AksiChips.Children.Clear();
            foreach (var a in AksiOptions)
            {
                var b = new Button { Content = a, Tag = a };
                ApplyChip(b, _aksiFilter == a);
                b.Click += async (s, _) =>
                {
                    if (s is Button btn && btn.Tag is string tag)
                    {
                        _aksiFilter = tag;
                        BuildAksiChips();
                        await LoadAsync(reset: true);
                    }
                };
                AksiChips.Children.Add(b);
            }
        }
        catch { }
    }

    private async Task LoadAsync(bool reset = false, bool append = false)
    {
        if (reset) { _page = 1; }
        ErrText.Visibility = Visibility.Collapsed;
        try { LoadingBar.Visibility = Visibility.Visible; } catch { }
        try
        {
            var q = new Dictionary<string, string?>
            {
                ["page"] = _page.ToString(),
                ["limit"] = "30",
            };
            if (_aksiFilter != "Semua")
                q["aksi"] = _aksiFilter;
            if (!string.IsNullOrWhiteSpace(SearchBox.Text)) q["q"] = SearchBox.Text.Trim();
            var doc = await ApiClient.Instance.GetAsync(
                $"/api/events/{_eventId}/audit-logs?" + ApiClient.BuildQuery(q));
            if (doc == null) return;
            var r = doc.RootElement;
            var rows = r.GetProperty("logs").EnumerateArray().Select(l => new Row
            {
                Aksi = l.TryGetProperty("aksi", out var ak) ? ak.GetString() ?? "" : "",
                Oleh = l.TryGetProperty("user", out var u)
                    ? (u.TryGetProperty("name", out var n) ? n.GetString() : u.TryGetProperty("email", out var em) ? em.GetString() : "?") ?? "?"
                    : "?",
                Waktu = l.TryGetProperty("createdAt", out var c) && c.TryGetDateTime(out var d)
                    ? d.ToLocalTime().ToString("dd/MM HH:mm") : "",
            }).ToList();
            List<Row> all;
            if (append && Grid.ItemsSource is IEnumerable<Row> prev)
                all = prev.Concat(rows).ToList();
            else
                all = rows;
            Grid.ItemsSource = all;
            StatusText.Text = "Online ✓";
            // Footer + tombol lanjut cermin Flutter ("Muat lagi/total").
            try
            {
                LogFooter.Text = $"Menampilkan {all.Count} data";
                LogMoreBtn.Visibility = rows.Count >= 30 ? Visibility.Visible : Visibility.Collapsed;
            }
            catch { }
            // Empty state (hanya bila tidak error).
            try
            {
                var empty = all.Count == 0;
                EmptyHost.Visibility = empty ? Visibility.Visible : Visibility.Collapsed;
                Grid.Visibility = empty ? Visibility.Collapsed : Visibility.Visible;
                if (empty && EmptyBody.Children.Count == 0)
                    EmptyBody.Children.Add(M3Empty.Panel(
                        M3Icons.History, "Belum ada aktivitas",
                        "Aktivitas tercatat akan muncul di sini.",
                        "Muat Ulang", () => _ = LoadAsync(reset: true)));
            }
            catch { }
        }
        catch
        {
            ErrText.Text = "Log butuh koneksi — data aman, coba lagi saat online.";
            ErrText.Visibility = Visibility.Visible;
            try { StatusText.Text = "Offline ✗"; } catch { }
        }
        finally
        {
            try { LoadingBar.Visibility = Visibility.Collapsed; } catch { }
        }
    }

    private async void OnReload(object s, RoutedEventArgs e) => await LoadAsync(reset: true);

    private async void OnMore(object s, RoutedEventArgs e)
    {
        _page++;
        await LoadAsync(append: true);
    }

    private async void OnSearchGo(object s, TextChangedEventArgs e) => await LoadAsync(reset: true);
}
