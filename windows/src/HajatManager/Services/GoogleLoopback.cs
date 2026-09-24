using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows;
using System.Windows.Controls;

namespace HajatManager.Services;

// Fase 4: login Google desktop via browser sistem + loopback lokal.
// TcpListener (bukan HttpListener) agar tidak butuh admin/urlacl di Windows.
// Alur: Start() → buka /device/google?state=&port= di browser →
// server redirect ke http://127.0.0.1:port/callback?code=&state= → tukar code
// menjadi Bearer via ApiClient.ExchangeDeviceCodeAsync().
public sealed record GoogleLoopbackResult(string Code, string State);

public sealed class GoogleLoopback : IDisposable
{
    private readonly TcpListener _listener;
    private bool _disposed;

    public int Port { get; }
    public string State { get; }

    private GoogleLoopback(TcpListener listener, int port, string state)
    {
        _listener = listener;
        Port = port;
        State = state;
    }

    public static GoogleLoopback Start()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        return new GoogleLoopback(listener, port, RandomState());
    }

    public static string RandomState()
    {
        var b = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(b).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }

    public static string BuildStartUrl(string baseUrl, int port, string state, string device)
    {
        var q = $"state={WebUtility.UrlEncode(state)}&port={port}" +
                $"&device={WebUtility.UrlEncode(device)}";
        return $"{baseUrl.TrimEnd('/')}/device/google?{q}";
    }

    public static void OpenBrowser(string url)
    {
        Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
    }

    /// Tunggu satu callback valid. Return null bila dibatalkan/timeout (5 menit).
    public async Task<GoogleLoopbackResult?> WaitAsync(CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromMinutes(5));
        while (!cts.Token.IsCancellationRequested)
        {
            TcpClient? client = null;
            try
            {
                var accept = _listener.AcceptTcpClientAsync();
                var done = await Task.WhenAny(accept, Task.Delay(Timeout.Infinite, cts.Token));
                if (done != accept) return null;
                client = await accept;
            }
            catch { return null; }

            using (client)
            {
                try
                {
                    var hit = await HandleOnceAsync(client, cts.Token);
                    if (hit != null) return hit;
                }
                catch { /* abaikan koneksi rusak, tunggu lagi */ }
            }
        }
        return null;
    }

    private async Task<GoogleLoopbackResult?> HandleOnceAsync(TcpClient client, CancellationToken ct)
    {
        using var stream = client.GetStream();
        using var reader = new StreamReader(stream, Encoding.ASCII, false, 1024, leaveOpen: true);

        var requestLine = await reader.ReadLineAsync(ct);
        string? path = null;
        if (!string.IsNullOrEmpty(requestLine))
        {
            var parts = requestLine.Split(' ');
            if (parts.Length >= 2) path = parts[1];
        }
        // Buang sisa header sampai baris kosong.
        string? line;
        do { line = await reader.ReadLineAsync(ct); }
        while (!string.IsNullOrEmpty(line));

        GoogleLoopbackResult? result = null;
        var okPage = false;
        if (path != null && path.StartsWith("/callback", StringComparison.Ordinal))
        {
            var q = ParseQuery(path.Contains('?') ? path[(path.IndexOf('?') + 1)..] : "");
            q.TryGetValue("code", out var code);
            q.TryGetValue("state", out var state);
            if (!string.IsNullOrEmpty(code) && state == State)
            {
                result = new GoogleLoopbackResult(code, state);
                okPage = true;
            }
        }

        var html = okPage
            ? "<html><body style='font-family:sans-serif;text-align:center;padding-top:60px'>" +
              "<h2>Login berhasil ✓</h2><p>Kembali ke aplikasi Hajat Manager.<br>Halaman ini bisa ditutup.</p></body></html>"
            : "<html><body style='font-family:sans-serif;text-align:center;padding-top:60px'>" +
              "<h2>Tautan tidak dikenali</h2><p>Abaikan halaman ini dan ulangi dari aplikasi.</p></body></html>";
        var bytes = Encoding.UTF8.GetBytes(html);
        var head = $"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n" +
                   $"Content-Length: {bytes.Length}\r\nConnection: close\r\n\r\n";
        var headBytes = Encoding.ASCII.GetBytes(head);
        await stream.WriteAsync(headBytes, ct);
        await stream.WriteAsync(bytes, ct);
        await stream.FlushAsync(ct);
        return result;
    }

    private static Dictionary<string, string> ParseQuery(string q)
    {
        var d = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var pair in q.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var i = pair.IndexOf('=');
            if (i < 0) continue;
            var k = WebUtility.UrlDecode(pair[..i]);
            var v = WebUtility.UrlDecode(pair[(i + 1)..]);
            d[k] = v;
        }
        return d;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        try { _listener.Stop(); } catch { }
    }
}

/// Dialog tempel kode manual (fallback bila browser tak bisa mencapai loopback).
public sealed class CodePasteDialog : Window
{
    private readonly TextBox _box = new()
    {
        Margin = new Thickness(0, 8, 0, 0),
        TextWrapping = TextWrapping.Wrap,
        AcceptsReturn = true,
        Height = 80,
        FontFamily = new System.Windows.Media.FontFamily("Consolas, monospace"),
        FontSize = 11,
    };
    public string Code => _box.Text.Trim();

    public CodePasteDialog()
    {
        Title = "Tempel Kode Google";
        Width = 440; Height = 280;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        var p = new StackPanel { Margin = new Thickness(24) };
        p.Children.Add(new TextBlock
        {
            Text = "Salin kode dari halaman browser (tombol \"Salin kode\"), tempel di sini.",
            TextWrapping = TextWrapping.Wrap
        });
        p.Children.Add(_box);
        var row = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(0, 12, 0, 0)
        };
        var cancel = new Button { Content = "Batal", Padding = new Thickness(16, 8, 16, 8) };
        cancel.Click += (_, _) => { DialogResult = false; };
        var ok = new Button
        {
            Content = "Lanjutkan",
            Margin = new Thickness(8, 0, 0, 0),
            Padding = new Thickness(16, 8, 16, 8)
        };
        ok.Click += (_, _) => { DialogResult = Code.Length >= 20; };
        row.Children.Add(cancel);
        row.Children.Add(ok);
        p.Children.Add(row);
        Content = p;
        Views.M3Chrome.Attach(this, dialog: true);
        _box.Focus();
    }
}

/// Dialog salin-tautan (fallback bila browser gagal dibuka otomatis).
/// Fase B: user salin URL start, tempel di browser mana pun, selesaikan
/// login Google, lalu ulangi dari aplikasi.
public sealed class LinkCopyDialog : Window
{
    public LinkCopyDialog(string url)
    {
        Title = "Buka Tautan Manual";
        Width = 480; Height = 300;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        var p = new StackPanel { Margin = new Thickness(24) };
        p.Children.Add(new TextBlock
        {
            Text = "Browser tidak terbuka otomatis. Salin tautan ini, tempel di browser, " +
                   "selesaikan login Google, lalu kembali ke aplikasi.",
            TextWrapping = TextWrapping.Wrap
        });
        var box = new TextBox
        {
            Text = url,
            Margin = new Thickness(0, 8, 0, 0),
            IsReadOnly = true,
            TextWrapping = TextWrapping.Wrap,
            AcceptsReturn = true,
            Height = 96,
            FontFamily = new System.Windows.Media.FontFamily("Consolas, monospace"),
            FontSize = 11,
        };
        p.Children.Add(box);
        var row = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(0, 12, 0, 0)
        };
        var close = new Button { Content = "Tutup", Padding = new Thickness(16, 8, 16, 8) };
        close.Click += (_, _) => { DialogResult = false; };
        var copy = new Button
        {
            Content = "Salin tautan",
            Margin = new Thickness(8, 0, 0, 0),
            Padding = new Thickness(16, 8, 16, 8)
        };
        copy.Click += (_, _) =>
        {
            try { Clipboard.SetText(url); copy.Content = "Tersalin ✓"; }
            catch { copy.Content = "Gagal menyalin"; }
        };
        row.Children.Add(close);
        row.Children.Add(copy);
        p.Children.Add(row);
        Content = p;
        Views.M3Chrome.Attach(this, dialog: true);
        box.Focus();
        box.SelectAll();
    }
}
