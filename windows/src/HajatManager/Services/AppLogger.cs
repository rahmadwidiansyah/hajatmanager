namespace HajatManager.Services;

// Logger file sederhana — Fase 0: agar force-close selalu meninggalkan jejak.
// Path: %AppData%/HajatManager/logs/app-YYYYMMDD.log
public static class AppLogger
{
    private static readonly object _lock = new();
    private static string? _logFile;

    public static string LogFile
    {
        get
        {
            if (_logFile != null) return _logFile;
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "HajatManager", "logs");
            Directory.CreateDirectory(dir);
            _logFile = Path.Combine(dir, $"app-{DateTime.Now:yyyyMMdd}.log");
            return _logFile;
        }
    }

    public static void Info(string msg) => Write("INFO", msg);
    public static void Warn(string msg) => Write("WARN", msg);
    public static void Error(string msg) => Write("ERROR", msg);

    public static void LogException(string context, Exception ex)
    {
        Write("FATAL",
            $"{context}: {ex.GetType().Name}: {ex.Message}\n{ex.StackTrace}");
        var inner = ex.InnerException;
        while (inner != null)
        {
            Write("FATAL", $"  Inner: {inner.GetType().Name}: {inner.Message}");
            inner = inner.InnerException;
        }
    }

    private static void Write(string level, string msg)
    {
        try
        {
            lock (_lock)
            {
                File.AppendAllText(LogFile,
                    $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [{level}] {msg}\n");
            }
        }
        catch { /* logger tidak boleh crash app */ }
    }
}
