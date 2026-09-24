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
        // Migrasi deploy-11: kolom localId (kunci idempoten, cermin migrasi
        // 20260920000000_add_local_id + mobile local_db.dart v3).
        // Tanpa ini setiap input Windows dobel (id lokal gst-*/bk-* vs server cuid).
        foreach (var ddl in new[]
        {
            "ALTER TABLE guests ADD COLUMN localId TEXT",
            "ALTER TABLE guest_books ADD COLUMN localId TEXT",
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_localid ON guests(localId) WHERE localId IS NOT NULL",
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_books_localid ON guest_books(localId) WHERE localId IS NOT NULL",
        })
        {
            try
            {
                using var m = c.CreateCommand();
                m.CommandText = ddl;
                await m.ExecuteNonQueryAsync();
            }
            catch (SqliteException) { /* sudah ada */ }
        }
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
    private static string? ColOrNull(Microsoft.Data.Sqlite.SqliteDataReader r, string name)
    {
        try
        {
            var i = r.GetOrdinal(name);
            return r.IsDBNull(i) ? null : r.GetString(i);
        }
        catch { return null; }
    }

    private static string ColStr(Microsoft.Data.Sqlite.SqliteDataReader r, string name, string fallback = "")
    {
        try
        {
            var i = r.GetOrdinal(name);
            return r.IsDBNull(i) ? fallback : r.GetString(i);
        }
        catch { return fallback; }
    }

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
                Id = ColStr(r, "id"),
                EventId = ColStr(r, "eventId"),
                GuestBookId = ColOrNull(r, "guestBookId"),
                Nama = ColStr(r, "nama"),
                Alamat = ColStr(r, "alamat"),
                Nominal = long.TryParse(ColOrNull(r, "nominal") ?? "", out var _n) ? _n : ReadInt64(r, "nominal"),
                Metode = ColStr(r, "metode", "AMPLOP"),
                Catatan = ColOrNull(r, "catatan"),
                PetugasId = ColOrNull(r, "petugasId"),
                MejaLabel = ColOrNull(r, "mejaLabel"),
                KodeInput = ColOrNull(r, "kodeInput"),
                DeviceId = ColOrNull(r, "deviceId"),
                LocalId = ColOrNull(r, "localId"),
                CreatedAt = ReadDate(r, "createdAt"),
                UpdatedAt = ReadDate(r, "updatedAt"),
            });
        }
        return out_;
    }

    private static long ReadInt64(Microsoft.Data.Sqlite.SqliteDataReader r, string name)
    {
        try
        {
            var i = r.GetOrdinal(name);
            if (r.IsDBNull(i)) return 0;
            try { return r.GetInt64(i); } catch { return 0; }
        }
        catch { return 0; }
    }

    private static DateTime ReadDate(Microsoft.Data.Sqlite.SqliteDataReader r, string name)
    {
        var s = ColOrNull(r, name);
        return DateTime.TryParse(s, out var d) ? d : DateTime.Now;
    }

    public async Task InsertGuestAsync(GuestModel g)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = @"INSERT OR REPLACE INTO guests
(id,eventId,guestBookId,nama,alamat,nominal,metode,catatan,petugasId,mejaLabel,kodeInput,deviceId,localId,createdAt,updatedAt)
VALUES($id,$e,$gb,$n,$a,$nom,$m,$ct,$p,$mj,$k,$d,$lid,$ca,$ua)";
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
        cmd.Parameters.AddWithValue("$lid", (object?)g.LocalId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$ca", g.CreatedAt.ToString("o"));
        cmd.Parameters.AddWithValue("$ua", g.UpdatedAt.ToString("o"));
        await cmd.ExecuteNonQueryAsync();
    }

    // Rekonsiliasi id sementara (== localId) → server id. Cermin mobile
    // updateGuestServerId + web offline-sync.ts flushOutbox.
    public async Task UpdateGuestServerIdAsync(string localId, string serverId)
    {
        if (string.IsNullOrEmpty(localId) || string.IsNullOrEmpty(serverId) || localId == serverId) return;
        using var c = Open();
        using var cmd = c.CreateCommand();
        // Baris lokal id-nya masih == localId → ganti ke server id.
        // Kalau baris server sudah ada via pull, hapus duplikat lokal dulu.
        cmd.CommandText = "UPDATE guests SET id=$srv WHERE localId=$lid AND (id=$lid OR id!=$srv)";
        cmd.Parameters.AddWithValue("$srv", serverId);
        cmd.Parameters.AddWithValue("$lid", localId);
        await cmd.ExecuteNonQueryAsync();
        using var dedup = c.CreateCommand();
        dedup.CommandText = "DELETE FROM guests WHERE localId=$lid AND id!=$srv";
        dedup.Parameters.AddWithValue("$lid", localId);
        dedup.Parameters.AddWithValue("$srv", serverId);
        try { await dedup.ExecuteNonQueryAsync(); } catch { }
    }

    public async Task UpdateBookServerIdAsync(string localId, string serverId)
    {
        if (string.IsNullOrEmpty(localId) || string.IsNullOrEmpty(serverId) || localId == serverId) return;
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "UPDATE guest_books SET id=$srv WHERE localId=$lid AND (id=$lid OR id!=$srv)";
        cmd.Parameters.AddWithValue("$srv", serverId);
        cmd.Parameters.AddWithValue("$lid", localId);
        await cmd.ExecuteNonQueryAsync();
        using var dedup = c.CreateCommand();
        dedup.CommandText = "DELETE FROM guest_books WHERE localId=$lid AND id!=$srv";
        dedup.Parameters.AddWithValue("$lid", localId);
        dedup.Parameters.AddWithValue("$srv", serverId);
        try { await dedup.ExecuteNonQueryAsync(); } catch { }
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
                Id = ColStr(r, "id"),
                EventId = ColStr(r, "eventId"),
                Nama = ColStr(r, "nama"),
                Alamat = ColStr(r, "alamat"),
                LocalId = ColOrNull(r, "localId"),
                CreatedAt = ReadDate(r, "createdAt"),
            });
        }
        return out_;
    }

    public async Task InsertBookAsync(GuestBookModel b)
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = @"INSERT OR REPLACE INTO guest_books(id,eventId,nama,alamat,localId,createdAt)
VALUES($id,$e,$n,$a,$lid,$c)";
        cmd.Parameters.AddWithValue("$id", b.Id);
        cmd.Parameters.AddWithValue("$e", b.EventId);
        cmd.Parameters.AddWithValue("$n", b.Nama);
        cmd.Parameters.AddWithValue("$a", b.Alamat);
        cmd.Parameters.AddWithValue("$lid", (object?)b.LocalId ?? DBNull.Value);
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
    // Upsert dua lapis cermin mobile mergeGuests/mergeBooks:
    //   localId ada → ON CONFLICT(localId) update id ke server id (satu localId = satu baris).
    //   localId null → ON CONFLICT(id) biasa (data lama web).
    public async Task MergePulledAsync(
        EventModel? eventModel,
        IEnumerable<GuestModel> guests,
        IEnumerable<GuestBookModel> books,
        IEnumerable<string>? deletedGuestIds = null,
        IEnumerable<string>? deletedBookIds = null,
        IEnumerable<string>? deletedGuestLocalIds = null,
        IEnumerable<string>? deletedBookLocalIds = null)
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
                    if (root.TryGetProperty("localId", out var lid) &&
                        lid.ValueKind == System.Text.Json.JsonValueKind.String)
                        pending.Add($"{table}:{lid.GetString()}");
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
            if (!string.IsNullOrEmpty(book.LocalId) && pending.Contains($"guest_books:{book.LocalId}")) continue;
            using var cmd = c.CreateCommand();
            cmd.Transaction = tx;
            if (!string.IsNullOrEmpty(book.LocalId))
            {
                cmd.CommandText = @"
INSERT INTO guest_books(id,eventId,nama,alamat,localId,createdAt)
VALUES($id,$e,$n,$a,$lid,$c)
ON CONFLICT(localId) DO UPDATE SET id=$id,eventId=$e,nama=$n,alamat=$a,createdAt=$c";
                cmd.Parameters.AddWithValue("$lid", book.LocalId);
            }
            else
            {
                cmd.CommandText = @"
INSERT INTO guest_books(id,eventId,nama,alamat,createdAt)
VALUES($id,$e,$n,$a,$c)
ON CONFLICT(id) DO UPDATE SET eventId=$e,nama=$n,alamat=$a,createdAt=$c";
            }
            cmd.Parameters.AddWithValue("$id", book.Id);
            cmd.Parameters.AddWithValue("$e", book.EventId);
            cmd.Parameters.AddWithValue("$n", book.Nama);
            cmd.Parameters.AddWithValue("$a", book.Alamat);
            cmd.Parameters.AddWithValue("$c", book.CreatedAt.ToString("o"));
            try { await cmd.ExecuteNonQueryAsync(); }
            catch (Microsoft.Data.Sqlite.SqliteException)
            {
                // Fallback DB lama tanpa kolom localId.
                using var fb = c.CreateCommand();
                fb.Transaction = tx;
                fb.CommandText = @"
INSERT INTO guest_books(id,eventId,nama,alamat,createdAt)
VALUES($id,$e,$n,$a,$c)
ON CONFLICT(id) DO UPDATE SET eventId=$e,nama=$n,alamat=$a,createdAt=$c";
                fb.Parameters.AddWithValue("$id", book.Id);
                fb.Parameters.AddWithValue("$e", book.EventId);
                fb.Parameters.AddWithValue("$n", book.Nama);
                fb.Parameters.AddWithValue("$a", book.Alamat);
                fb.Parameters.AddWithValue("$c", book.CreatedAt.ToString("o"));
                await fb.ExecuteNonQueryAsync();
            }
        }

        foreach (var guest in guests)
        {
            if (pending.Contains($"guests:{guest.Id}")) continue;
            if (!string.IsNullOrEmpty(guest.LocalId) && pending.Contains($"guests:{guest.LocalId}")) continue;
            using var cmd = c.CreateCommand();
            cmd.Transaction = tx;
            var p = new Dictionary<string, object?>
            {
                ["$id"] = guest.Id, ["$e"] = guest.EventId,
                ["$gb"] = guest.GuestBookId, ["$n"] = guest.Nama, ["$a"] = guest.Alamat,
                ["$nom"] = guest.Nominal, ["$m"] = guest.Metode, ["$ct"] = guest.Catatan,
                ["$p"] = guest.PetugasId, ["$mj"] = guest.MejaLabel, ["$k"] = guest.KodeInput,
                ["$d"] = guest.DeviceId, ["$ca"] = guest.CreatedAt.ToString("o"),
                ["$ua"] = guest.UpdatedAt.ToString("o"),
            };
            if (!string.IsNullOrEmpty(guest.LocalId))
            {
                p["$lid"] = guest.LocalId;
                cmd.CommandText = @"
INSERT INTO guests(id,eventId,guestBookId,nama,alamat,nominal,metode,catatan,petugasId,mejaLabel,kodeInput,deviceId,localId,createdAt,updatedAt)
VALUES($id,$e,$gb,$n,$a,$nom,$m,$ct,$p,$mj,$k,$d,$lid,$ca,$ua)
ON CONFLICT(localId) DO UPDATE SET id=$id,eventId=$e,guestBookId=$gb,nama=$n,alamat=$a,
  nominal=$nom,metode=$m,catatan=$ct,petugasId=$p,mejaLabel=$mj,kodeInput=$k,
  deviceId=$d,createdAt=$ca,updatedAt=$ua";
            }
            else
            {
                cmd.CommandText = @"
INSERT INTO guests(id,eventId,guestBookId,nama,alamat,nominal,metode,catatan,petugasId,mejaLabel,kodeInput,deviceId,createdAt,updatedAt)
VALUES($id,$e,$gb,$n,$a,$nom,$m,$ct,$p,$mj,$k,$d,$ca,$ua)
ON CONFLICT(id) DO UPDATE SET eventId=$e,guestBookId=$gb,nama=$n,alamat=$a,
  nominal=$nom,metode=$m,catatan=$ct,petugasId=$p,mejaLabel=$mj,kodeInput=$k,
  deviceId=$d,createdAt=$ca,updatedAt=$ua";
            }
            foreach (var kv in p)
                cmd.Parameters.AddWithValue(kv.Key, (object?)kv.Value ?? DBNull.Value);
            try { await cmd.ExecuteNonQueryAsync(); }
            catch (Microsoft.Data.Sqlite.SqliteException)
            {
                // Fallback DB lama tanpa kolom localId.
                using var fb = c.CreateCommand();
                fb.Transaction = tx;
                fb.CommandText = @"
INSERT INTO guests(id,eventId,guestBookId,nama,alamat,nominal,metode,catatan,petugasId,mejaLabel,kodeInput,deviceId,createdAt,updatedAt)
VALUES($id,$e,$gb,$n,$a,$nom,$m,$ct,$p,$mj,$k,$d,$ca,$ua)
ON CONFLICT(id) DO UPDATE SET eventId=$e,guestBookId=$gb,nama=$n,alamat=$a,
  nominal=$nom,metode=$m,catatan=$ct,petugasId=$p,mejaLabel=$mj,kodeInput=$k,
  deviceId=$d,createdAt=$ca,updatedAt=$ua";
                foreach (var kv in p.Where(x => x.Key != "$lid"))
                    fb.Parameters.AddWithValue(kv.Key, (object?)kv.Value ?? DBNull.Value);
                await fb.ExecuteNonQueryAsync();
            }
        }

        foreach (var id in deletedGuestIds ?? Enumerable.Empty<string>())
        {
            using var cmd = c.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "DELETE FROM guests WHERE id=$id";
            cmd.Parameters.AddWithValue("$id", id);
            await cmd.ExecuteNonQueryAsync();
        }
        // Hapus by localId — penting untuk baris yang id lokalnya belum ter-replace.
        // Cermin mobile sync_engine delete by id DAN localId.
        foreach (var lid in deletedGuestLocalIds ?? Enumerable.Empty<string>())
        {
            if (string.IsNullOrEmpty(lid)) continue;
            using var cmd = c.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "DELETE FROM guests WHERE localId=$lid";
            cmd.Parameters.AddWithValue("$lid", lid);
            try { await cmd.ExecuteNonQueryAsync(); } catch (Microsoft.Data.Sqlite.SqliteException) { }
        }
        foreach (var id in deletedBookIds ?? Enumerable.Empty<string>())
        {
            using var cmd = c.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "DELETE FROM guest_books WHERE id=$id";
            cmd.Parameters.AddWithValue("$id", id);
            await cmd.ExecuteNonQueryAsync();
        }
        foreach (var lid in deletedBookLocalIds ?? Enumerable.Empty<string>())
        {
            if (string.IsNullOrEmpty(lid)) continue;
            using var cmd = c.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "DELETE FROM guest_books WHERE localId=$lid";
            cmd.Parameters.AddWithValue("$lid", lid);
            try { await cmd.ExecuteNonQueryAsync(); } catch (Microsoft.Data.Sqlite.SqliteException) { }
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
