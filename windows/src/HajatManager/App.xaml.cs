using System.Windows;
using HajatManager.Data;

namespace HajatManager;

public partial class App : Application
{
    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        await LocalDb.Instance.InitAsync();
        Services.SyncEngine.Instance.Start();
    }
}
