using System.Windows.Controls;

namespace HajatManager.Views;

// Batasi input hanya digit (kolom nominal) — cermin digitsOnly Flutter.
// Dipindah dari EventDetailWindow.xaml.cs saat Task 4 (dipakai EventDetailView).
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
