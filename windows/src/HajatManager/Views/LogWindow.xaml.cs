using System.Windows;
using System.Windows.Controls;
using HajatManager.Api;

namespace HajatManager.Views;

public partial class LogWindow : Window
{
    private readonly string _eventId;
    private int _page = 1;
    private bool _more = true;

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
        AksiBox.ItemsSource = new[]
        {
            "Semua", "CREATE_GUEST", "UPDATE_GUEST", "DELETE_GUEST",
            "CREATE_EVENT", "UPDATE_EVENT", "SYNC_ONLINE", "PUSH_SYNC",
        };
        AksiBox.SelectedIndex = 0;
        Loaded += async (_, _) => await LoadAsync(reset: true);
    }

    private async Task LoadAsync(bool reset = false)
    {
        if (reset) { _page = 1; _more = true; }
        ErrText.Visibility = Visibility.Collapsed;
        try
        {
            var q = new Dictionary<string, string?>
            {
                ["page"] = _page.ToString(),
                ["limit"] = "30",
            };
            if ((AksiBox.SelectedItem as string) is string a && a != "Semua")
                q["aksi"] = a;
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
            Grid.ItemsSource = rows;
        }
        catch
        {
            ErrText.Text = "Log butuh koneksi — data aman, coba lagi saat online.";
            ErrText.Visibility = Visibility.Visible;
        }
    }

    private async void OnReload(object s, RoutedEventArgs e) => await LoadAsync(reset: true);
    private async void OnFilter(object s, SelectionChangedEventArgs e) => await LoadAsync(reset: true);
    private async void OnSearchGo(object s, TextChangedEventArgs e) => await LoadAsync(reset: true);
}
