using System.Windows;
using HajatManager.Models;

namespace HajatManager.Views;

// Task 7: fallback redirect — seluruh pengaturan kini tab Setting di EventDetailView.
// Kelas dipertahankan agar pemanggil lama tetap kompilasi.
public partial class SettingsWindow : Window
{
    public SettingsWindow(EventModel ev)
    {
        InitializeComponent();
        Title = $"Pengaturan — {ev.NamaAcara}";
        M3Chrome.Attach(this);
        KeyDown += (_, e) =>
        {
            if (e.Key == System.Windows.Input.Key.Escape) { try { Close(); } catch { } }
        };
        try
        {
            RedirectText.Text =
                $"Pengaturan \"{ev.NamaAcara}\" kini ada di tab Setting pada halaman detail acara.";
        }
        catch { }
    }

    private void OnClose(object sender, RoutedEventArgs e)
    {
        try { Close(); } catch { }
    }
}
