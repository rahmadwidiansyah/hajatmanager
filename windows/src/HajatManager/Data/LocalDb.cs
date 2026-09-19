using HajatManager.Models;
using Microsoft.Data.Sqlite;

namespace HajatManager.Data;

// SQLite lokal — skema 1:1 dengan mobile/lib/core/local_db.dart.
// Path: %AppData%/HajatManager/hajat_manager.db
public sealed class LocalDb
{
    public static LocalDb Instance { get; } = new();
    private LocalDb() { }

    public static string DbPath
    {
        get
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "HajatManager");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, "hajat_manager.db");
        }
    }

    private SqliteConnection Open()
    {
        var c = new SqliteConnection($"Data Source={DbPath}");
        c.Open();
        return c;
    }

    public async Task InitAsync()
    {
        using var c = Open();
        var sql = @"
CREATE TABLE IF NOT EXISTS events(
  id TEXT PRIMARY KEY, namaAcara TEXT NOT NULL, namaTuanRumah TEXT,
  tanggal TEXT NOT NULL, lokasi TEXT, catatan TEXT,
  mejaList TEXT NOT NULL DEFAULT 'MEJA-1,MEJA-2',
  lastSyncAt TEXT, myRole TEXT DEFAULT 'VIEWER');
CREATE TABLE IF NOT EXISTS guest_books(
  id TEXT PRIMARY KEY, eventId TEXT NOT NULL, nama TEXT NOT NULL,
  alamat TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_books_event ON guest_books(eventId);
CREATE TABLE IF NOT EXISTS guests(
  id TEXT PRIMARY KEY, eventId TEXT NOT NULL, guestBookId TEXT,
  nama TEXT NOT NULL, alamat TEXT NOT NULL, nominal INTEGER NOT NULL,
  metode TEXT NOT NULL DEFAULT 'AMPLOP', catatan TEXT, petugasId TEXT,
  mejaLabel TEXT, kodeInput TEXT, deviceId TEXT,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_guests_event ON guests(eventId);
CREATE TABLE IF NOT EXISTS outbox(
  id TEXT PRIMARY KEY, eventId TEXT NOT NULL, action TEXT NOT NULL,
  tableName TEXT NOT NULL, payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, lastError TEXT,
  createdAt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_outbox_event ON outbox(eventId);
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);";
        using var cmd = c.CreateCommand();
        cmd.CommandText = sql;
        await cmd.ExecuteNonQueryAsync();
        // Migrasi ringan: kolom myRole bila DB lama belum punya.
        try
        {
            using var m = c.CreateCommand();
            m.CommandText = "ALTER TABLE events ADD COLUMN myRole TEXT DEFAULT 'VIEWER'";
            await m.ExecuteNonQueryAsync();
        }
        catch (SqliteException) { /* sudah ada */ }
    }

    // ---------- events ----------
    public async Task PutEventsAsync(IEnumerable<EventModel> list)
    {
        using var c = Open();
        using var tx = c.BeginTransaction();
        foreach (var e in list)
        {
            using var cmd = c.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
INSERT INTO events(id,namaAcara,namaTuanRumah,tanggal,lokasi,catatan,mejaList,myRole)
VALUES($id,$n,$t,$tg,$l,$ct,$m,$r)
ON CONFLICT(id) DO UPDATE SET namaAcara=$n,namaTuanRumah=$t,tanggal=$tg,
  lokasi=$l,catatan=$ct,mejaList=$m,myRole=$r";
            cmd.Parameters.AddWithValue("$id", e.Id);
            cmd.Parameters.AddWithValue("$n", e.NamaAcara);
            cmd.Parameters.AddWithValue("$t", (object?)e.NamaTuanRumah ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$tg", e.Tanggal.ToString("o"));
            cmd.Parameters.AddWithValue("$l", (object?)e.Lokasi ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$ct", (object?)e.Catatan ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$m", string.Join(",", e.MejaList));
            cmd.Parameters.AddWithValue("$r", e.MyRole);
            await cmd.ExecuteNonQueryAsync();
        }
        tx.Commit();
    }

    public async Task<List<EventModel>> GetEventsAsync()
    {
        var out_ = new List<EventModel>();
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT * FROM events ORDER BY tanggal DESC";
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            out_.Add(new EventModel
            {
                Id = r.GetString(0),
                NamaAcara = r.GetString(1),
                NamaTuanRumah = r.IsDBNull(2) ? null : r.GetString(2),
                Tanggal = DateTime.TryParse(r.GetString(3), out var d) ? d : DateTime.Now,
                Lokasi = r.IsDBNull(4) ? null : r.GetString(4),
                Catatan = r.IsDBNull(5) ? null : r.GetString(5),
                MejaList = r.GetString(6).Split(',', StringSplitOptions.RemoveEmptyEntries).ToList(),
                MyRole = r.IsDBNull(8) ? "VIEWER" : r.GetString(8),
            });
        }
        return out_;
    }

    public async Task<List<string>> EventIdsAsync()
    {
        var ids = new List<string>();
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT id FROM events";
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync()) ids.Add(r.GetString(0));
        return ids;
    }

    public async Task SetMyRoleAsync(string eventId, string role)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "UPDATE events SET myRole=$r WHERE id=$id";
        cmd.Parameters.AddWithValue("$r", role);
        cmd.Parameters.AddWithValue("$id", eventId);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DeleteEventLocalAsync(string eventId)
    {
        using var c = Open();
        foreach (var t in new[] { "guests", "guest_books", "events", "outbox" })
        {
            using var cmd = c.CreateCommand();
            cmd.CommandText = t == "outbox"
                ? "DELETE FROM outbox WHERE eventId=$id"
                : $"DELETE FROM {t} WHERE {(t == "events" ? "id" : "eventId")}=$id";
            cmd.Parameters.AddWithValue("$id", eventId);
            await cmd.ExecuteNonQueryAsync();
        }
    }

    // ---------- guests ----------
    public async Task<List<GuestModel>> GuestsLocalAsync(string eventId)
    {
        var out_ = new List<GuestModel>();
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT * FROM guests WHERE eventId=$e ORDER BY createdAt DESC";
        cmd.Parameters.AddWithValue("$e", eventId);
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            out_.Add(new GuestModel
            {
                Id = r.GetString(0), EventId = r.GetString(1),
                GuestBookId = r.IsDBNull(2) ? null : r.GetString(2),
                Nama = r.GetString(3), Alamat = r.GetString(4),
                Nominal = r.GetInt64(5), Metode = r.GetString(6),
                Catatan = r.IsDBNull(7) ? null : r.GetString(7),
                PetugasId = r.IsDBNull(8) ? null : r.GetString(8),
                MejaLabel = r.IsDBNull(9) ? null : r.GetString(9),
                KodeInput = r.IsDBNull(10) ? null : r.GetString(10),
                DeviceId = r.IsDBNull(11) ? null : r.GetString(11),
                CreatedAt = DateTime.TryParse(r.GetString(12), out var a) ? a : DateTime.Now,
                UpdatedAt = DateTime.TryParse(r.GetString(13), out var b) ? b : DateTime.Now,
            });
        }
        return out_;
    }

    public async Task InsertGuestAsync(GuestModel g)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = @"INSERT OR REPLACE INTO guests
(id,eventId,guestBookId,nama,alamat,nominal,metode,catatan,petugasId,mejaLabel,kodeInput,deviceId,createdAt,updatedAt)
VALUES($id,$e,$gb,$n,$a,$nom,$m,$ct,$p,$mj,$k,$d,$ca,$ua)";
        cmd.Parameters.AddWithValue("$id", g.Id);
        cmd.Parameters.AddWithValue("$e", g.EventId);
        cmd.Parameters.AddWithValue("$gb", (object?)g.GuestBookId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$n", g.Nama);
        cmd.Parameters.AddWithValue("$a", g.Alamat);
        cmd.Parameters.AddWithValue("$nom", g.Nominal);
        cmd.Parameters.AddWithValue("$m", g.Metode);
        cmd.Parameters.AddWithValue("$ct", (object?)g.Catatan ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$p", (object?)g.PetugasId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$mj", (object?)g.MejaLabel ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$k", (object?)g.KodeInput ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$d", (object?)g.DeviceId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$ca", g.CreatedAt.ToString("o"));
        cmd.Parameters.AddWithValue("$ua", g.UpdatedAt.ToString("o"));
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task UpdateGuestLocalAsync(string id, Dictionary<string, object?> fields)
    {
        if (fields.Count == 0) return;
        using var c = Open();
        var sets = string.Join(",", fields.Keys.Select(k => $"{k}=${k}"));
        using var cmd = c.CreateCommand();
        cmd.CommandText = $"UPDATE guests SET {sets} WHERE id=$id";
        foreach (var kv in fields)
            cmd.Parameters.AddWithValue($"${kv.Key}", kv.Value ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$id", id);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DeleteGuestLocalAsync(string id)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "DELETE FROM guests WHERE id=$id";
        cmd.Parameters.AddWithValue("$id", id);
        await cmd.ExecuteNonQueryAsync();
    }

    // ---------- books ----------
    public async Task<List<GuestBookModel>> BooksLocalAsync(string eventId)
    {
        var out_ = new List<GuestBookModel>();
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT * FROM guest_books WHERE eventId=$e ORDER BY createdAt DESC";
        cmd.Parameters.AddWithValue("$e", eventId);
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            out_.Add(new GuestBookModel
            {
                Id = r.GetString(0), EventId = r.GetString(1),
                Nama = r.GetString(2), Alamat = r.GetString(3),
                CreatedAt = DateTime.TryParse(r.GetString(4), out var d) ? d : DateTime.Now,
            });
        }
        return out_;
    }

    public async Task InsertBookAsync(GuestBookModel b)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = @"INSERT OR REPLACE INTO guest_books(id,eventId,nama,alamat,createdAt)
VALUES($id,$e,$n,$a,$c)";
        cmd.Parameters.AddWithValue("$id", b.Id);
        cmd.Parameters.AddWithValue("$e", b.EventId);
        cmd.Parameters.AddWithValue("$n", b.Nama);
        cmd.Parameters.AddWithValue("$a", b.Alamat);
        cmd.Parameters.AddWithValue("$c", b.CreatedAt.ToString("o"));
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task UpdateBookLocalAsync(string id, string nama, string alamat)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "UPDATE guest_books SET nama=$n,alamat=$a WHERE id=$id";
        cmd.Parameters.AddWithValue("$n", nama);
        cmd.Parameters.AddWithValue("$a", alamat);
        cmd.Parameters.AddWithValue("$id", id);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DeleteBookLocalAsync(string id)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "DELETE FROM guest_books WHERE id=$id";
        cmd.Parameters.AddWithValue("$id", id);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task PutGuestsAsync(string eventId, IEnumerable<GuestModel> list)
    {
        using var c = Open();
        using var tx = c.BeginTransaction();
        using (var del = c.CreateCommand())
        {
            del.Transaction = tx;
            del.CommandText = "DELETE FROM guests WHERE eventId=$e";
            del.Parameters.AddWithValue("$e", eventId);
            await del.ExecuteNonQueryAsync();
        }
        tx.Commit();
        foreach (var g in list) await InsertGuestAsync(g);
    }

    public async Task PutBooksAsync(string eventId, IEnumerable<GuestBookModel> list)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "DELETE FROM guest_books WHERE eventId=$e";
        cmd.Parameters.AddWithValue("$e", eventId);
        await cmd.ExecuteNonQueryAsync();
        foreach (var b in list) await InsertBookAsync(b);
    }

    // Merge server data without replacing rows that still have a local outbox operation.
    // Pull responses do not contain deletes, so existing local rows are intentionally kept.
    public async Task MergePulledAsync(
        EventModel? eventModel,
        IEnumerable<GuestModel> guests,
        IEnumerable<GuestBookModel> books,
        IEnumerable<string>? deletedGuestIds = null,
        IEnumerable<string>? deletedBookIds = null)
    {
        using var c = Open();
        using var tx = c.BeginTransaction();
        var pending = new HashSet<string>(StringComparer.Ordinal);

        using (var pendingCmd = c.CreateCommand())
        {
            pendingCmd.Transaction = tx;
            pendingCmd.CommandText = "SELECT tableName, action, payload FROM outbox";
            using var r = await pendingCmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var table = r.GetString(0) switch
                {
                    "guestBooks" => "guest_books",
                    var value => value,
                };
                var payload = r.IsDBNull(2) ? null : r.GetString(2);
                if (string.IsNullOrEmpty(payload)) continue;
                try
                {
                    using var json = System.Text.Json.JsonDocument.Parse(payload);
                    var root = json.RootElement;
                    if (root.TryGetProperty("id", out var id) &&
                        id.ValueKind == System.Text.Json.JsonValueKind.String)
                        pending.Add($"{table}:{id.GetString()}");
                    // Update/delete payloads use { id, fields } while older
                    // writers may put the identifier inside the fields object.
                    if (root.TryGetProperty("fields", out var fields) &&
                        fields.ValueKind == System.Text.Json.JsonValueKind.Object &&
                        fields.TryGetProperty("id", out var nestedId) &&
                        nestedId.ValueKind == System.Text.Json.JsonValueKind.String)
                        pending.Add($"{table}:{nestedId.GetString()}");
                }
                catch (System.Text.Json.JsonException) { /* malformed outbox is handled by flush */ }
            }
        }

        if (eventModel != null && !pending.Contains($"events:{eventModel.Id}"))
        {
            using var cmd = c.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
INSERT INTO events(id,namaAcara,namaTuanRumah,tanggal,lokasi,catatan,mejaList)
VALUES($id,$n,$t,$tg,$l,$ct,$m)
ON CONFLICT(id) DO UPDATE SET namaAcara=$n,namaTuanRumah=$t,tanggal=$tg,
  lokasi=$l,catatan=$ct,mejaList=$m";
            cmd.Parameters.AddWithValue("$id", eventModel.Id);
            cmd.Parameters.AddWithValue("$n", eventModel.NamaAcara);
            cmd.Parameters.AddWithValue("$t", (object?)eventModel.NamaTuanRumah ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$tg", eventModel.Tanggal.ToString("o"));
            cmd.Parameters.AddWithValue("$l", (object?)eventModel.Lokasi ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$ct", (object?)eventModel.Catatan ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$m", string.Join(",", eventModel.MejaList));
            await cmd.ExecuteNonQueryAsync();
        }

        foreach (var book in books)
        {
            if (pending.Contains($"guest_books:{book.Id}")) continue;
            using var cmd = c.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
INSERT INTO guest_books(id,eventId,nama,alamat,createdAt)
VALUES($id,$e,$n,$a,$c)
ON CONFLICT(id) DO UPDATE SET eventId=$e,nama=$n,alamat=$a,createdAt=$c";
            cmd.Parameters.AddWithValue("$id", book.Id);
            cmd.Parameters.AddWithValue("$e", book.EventId);
            cmd.Parameters.AddWithValue("$n", book.Nama);
            cmd.Parameters.AddWithValue("$a", book.Alamat);
            cmd.Parameters.AddWithValue("$c", book.CreatedAt.ToString("o"));
            await cmd.ExecuteNonQueryAsync();
        }

        foreach (var guest in guests)
        {
            if (pending.Contains($"guests:{guest.Id}")) continue;
            using var cmd = c.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
INSERT INTO guests(id,eventId,guestBookId,nama,alamat,nominal,metode,catatan,petugasId,mejaLabel,kodeInput,deviceId,createdAt,updatedAt)
VALUES($id,$e,$gb,$n,$a,$nom,$m,$ct,$p,$mj,$k,$d,$ca,$ua)
ON CONFLICT(id) DO UPDATE SET eventId=$e,guestBookId=$gb,nama=$n,alamat=$a,
  nominal=$nom,metode=$m,catatan=$ct,petugasId=$p,mejaLabel=$mj,kodeInput=$k,
  deviceId=$d,createdAt=$ca,updatedAt=$ua";
            cmd.Parameters.AddWithValue("$id", guest.Id);
            cmd.Parameters.AddWithValue("$e", guest.EventId);
            cmd.Parameters.AddWithValue("$gb", (object?)guest.GuestBookId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$n", guest.Nama);
            cmd.Parameters.AddWithValue("$a", guest.Alamat);
            cmd.Parameters.AddWithValue("$nom", guest.Nominal);
            cmd.Parameters.AddWithValue("$m", guest.Metode);
            cmd.Parameters.AddWithValue("$ct", (object?)guest.Catatan ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$p", (object?)guest.PetugasId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$mj", (object?)guest.MejaLabel ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$k", (object?)guest.KodeInput ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$d", (object?)guest.DeviceId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$ca", guest.CreatedAt.ToString("o"));
            cmd.Parameters.AddWithValue("$ua", guest.UpdatedAt.ToString("o"));
            await cmd.ExecuteNonQueryAsync();
        }

        foreach (var id in deletedGuestIds ?? Enumerable.Empty<string>())
        {
            using var cmd = c.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "DELETE FROM guests WHERE id=$id";
            cmd.Parameters.AddWithValue("$id", id);
            await cmd.ExecuteNonQueryAsync();
        }
        foreach (var id in deletedBookIds ?? Enumerable.Empty<string>())
        {
            using var cmd = c.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "DELETE FROM guest_books WHERE id=$id";
            cmd.Parameters.AddWithValue("$id", id);
            await cmd.ExecuteNonQueryAsync();
        }

        tx.Commit();
    }

    // ---------- outbox ----------
    public async Task EnqueueAsync(OutboxOp op)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = @"INSERT OR REPLACE INTO outbox
(id,eventId,action,tableName,payload,attempts,lastError,createdAt)
VALUES($id,$e,$a,$t,$p,$n,$le,$c)";
        cmd.Parameters.AddWithValue("$id", op.Id);
        cmd.Parameters.AddWithValue("$e", op.EventId);
        cmd.Parameters.AddWithValue("$a", op.Action);
        cmd.Parameters.AddWithValue("$t", op.TableName);
        cmd.Parameters.AddWithValue("$p", op.Payload);
        cmd.Parameters.AddWithValue("$n", op.Attempts);
        cmd.Parameters.AddWithValue("$le", (object?)op.LastError ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$c", op.CreatedAt.ToString("o"));
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<List<OutboxOp>> OutboxListAsync(string eventId)
    {
        var out_ = new List<OutboxOp>();
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT * FROM outbox WHERE eventId=$e ORDER BY createdAt ASC";
        cmd.Parameters.AddWithValue("$e", eventId);
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            out_.Add(new OutboxOp
            {
                Id = r.GetString(0), EventId = r.GetString(1),
                Action = r.GetString(2), TableName = r.GetString(3),
                Payload = r.GetString(4), Attempts = r.GetInt32(5),
                LastError = r.IsDBNull(6) ? null : r.GetString(6),
                CreatedAt = DateTime.TryParse(r.GetString(7), out var d) ? d : DateTime.UtcNow,
            });
        }
        return out_;
    }

    public async Task<int> OutboxCountAsync(string eventId)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM outbox WHERE eventId=$e";
        cmd.Parameters.AddWithValue("$e", eventId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    public async Task<List<string>> OutboxEventIdsAsync()
    {
        var ids = new List<string>();
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT DISTINCT eventId FROM outbox ORDER BY eventId";
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            if (!r.IsDBNull(0)) ids.Add(r.GetString(0));
        }
        return ids;
    }

    public async Task OutboxRemoveAsync(IEnumerable<string> ids)
    {
        var list = ids.ToList();
        if (list.Count == 0) return;
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = $"DELETE FROM outbox WHERE id IN ({string.Join(",", list.Select((_, i) => $"$p{i}"))})";
        for (var i = 0; i < list.Count; i++) cmd.Parameters.AddWithValue($"$p{i}", list[i]);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task OutboxBumpAsync(string id, string? error)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "UPDATE outbox SET attempts=attempts+1,lastError=$e WHERE id=$id";
        cmd.Parameters.AddWithValue("$e", (object?)error ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$id", id);
        await cmd.ExecuteNonQueryAsync();
    }

    // ---------- meta ----------
    public async Task<string?> GetMetaAsync(string k)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT v FROM meta WHERE k=$k";
        cmd.Parameters.AddWithValue("$k", k);
        var v = await cmd.ExecuteScalarAsync();
        return v is string s ? s : null;
    }

    public async Task SetMetaAsync(string k, string v)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "INSERT INTO meta(k,v) VALUES($k,$v) ON CONFLICT(k) DO UPDATE SET v=$v";
        cmd.Parameters.AddWithValue("$k", k);
        cmd.Parameters.AddWithValue("$v", v);
        await cmd.ExecuteNonQueryAsync();
    }
}
