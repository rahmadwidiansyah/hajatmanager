using System.Windows;
using System.Windows.Controls;
using HajatManager.Models;

namespace HajatManager.Views;

// Task 4: shell dialog tipis — seluruh UI + logic di EventDetailView.
// Dipakai saat window sempit (<900px) via hybrid open EventsView.
public partial class EventDetailWindow : Window
{
    public EventDetailWindow(EventModel ev)
    {
        InitializeComponent();
        Title = ev.NamaAcara;
        M3Chrome.Attach(this);
        Host.Content = new EventDetailView(ev, null);
    }
}
