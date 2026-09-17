using System.Windows;
using System.Windows.Threading;
using HajatManager.Api;
using HajatManager.Data;
using HajatManager.Services;

namespace HajatManager;

public partial class App : Application
{
    protected override async void OnStartup(StartupEventArgs e)
    {
        // Fase A: terapkan tema SEBELUM window pertama (StartupUri) dibuat.
        ThemeManager.ApplyStartup();
        base.OnStartup(e);

        // Fase 0: global handler agar exception tak terduga tidak force-close diam-diam.
        DispatcherUnhandledException += OnDispatcherUnhandled;
        AppDomain.CurrentDomain.UnhandledException += OnDomainUnhandled;
        TaskScheduler.UnobservedTaskException += OnUnobservedTask;

        try
        {
            AppLogger.Info("=== HajatManager startup ===");
            await LocalDb.Instance.InitAsync();
        }
        catch (Exception ex)
        {
            AppLogger.LogException("LocalDb.Init gagal", ex);
            MessageBox.Show(
                $"Database lokal gagal dibuka:\n{ex.Message}\n\nLog: {AppLogger.LogFile}",
                "Hajat Manager", MessageBoxButton.OK, MessageBoxImage.Error);
            // Lanjut: user masih bisa lihat layar login (mode terbatas).
        }

        try
        {
            // Konfigurasi base URL sedini mungkin agar SyncEngine tidak
            // menembak HttpClient tanpa BaseAddress.
            var baseUrl = AppConfig.Instance.GetBaseUrl();
            if (ApiClient.Instance.TryConfigure(baseUrl, out var cfgErr))
            {
                AppLogger.Info($"BaseUrl startup: {ApiClient.Instance.BaseUrl}");
                // Fase 3: pulihkan Bearer dari DPAPI agar API langsung terautentikasi.
                ApiClient.Instance.RestoreDeviceToken();
            }
            else
                AppLogger.Warn($"BaseUrl startup invalid '{baseUrl}': {cfgErr}");

            Services.SyncEngine.Instance.Start();
        }
        catch (Exception ex)
        {
            AppLogger.LogException("Startup SyncEngine gagal", ex);
        }
    }

    private void OnDispatcherUnhandled(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        AppLogger.LogException("DispatcherUnhandledException", e.Exception);
        e.Handled = true;
        MessageBox.Show(
            $"Terjadi galat tak terduga:\n{e.Exception.Message}\n\nDetail tersimpan di:\n{AppLogger.LogFile}",
            "Hajat Manager", MessageBoxButton.OK, MessageBoxImage.Error);
    }

    private void OnDomainUnhandled(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception ex)
            AppLogger.LogException("AppDomain.UnhandledException", ex);
        else
            AppLogger.Error($"AppDomain.UnhandledException (non-Exception): {e.ExceptionObject}");
    }

    private void OnUnobservedTask(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        AppLogger.LogException("TaskScheduler.UnobservedTaskException", e.Exception);
        e.SetObserved();
    }
}
