import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:uuid/uuid.dart';

/// SQLite lokal — cache baca + outbox tulis (mirror lib/offline-sync.ts).
/// Tabel: events, guest_books, guests, outbox, meta.
/// Desktop (Windows/Linux): pakai sqflite_common_ffi (sqflite tanpa impl desktop).
///
/// Versi 3: tambah kolom localId di guests dan guest_books.
///   localId = UUID yang digenerate client saat buat data offline.
///   Dipakai sebagai kunci idempoten: server lookup by localId sebelum insert,
///   sehingga retry/flush ganda tidak menghasilkan baris dobel.
bool get _isDesktop =>
    !kIsWeb && (Platform.isWindows || Platform.isLinux || Platform.isMacOS);

/// Panggil sekali di main() sebelum runApp agar SQLite siap di desktop.
Future<void> initLocalDb() async {
  if (_isDesktop) {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  }
}

class LocalDb {
  static final LocalDb instance = LocalDb._();
  LocalDb._();
  Database? _db;
  final _uuid = const Uuid();

  String newId(String prefix) => '$prefix-${_uuid.v4()}';

  /// Generate UUID v4 murni — dipakai sebagai localId (bukan prefix gst-).
  String newLocalId() => _uuid.v4();

  Future<Database> db() async {
    if (_db != null) return _db!;
    final String path;
    if (_isDesktop) {
      final dir = await getApplicationDocumentsDirectory();
      path = p.join(dir.path, 'hajat_manager.db');
    } else {
      path = p.join(await getDatabasesPath(), 'hajat_manager.db');
    }
    _db = await openDatabase(
      path,
      version: 3, // v2→3: tambah kolom localId di guests & guest_books
      onCreate: (d, v) async {
        await d.execute(
          'CREATE TABLE events('
          '  id TEXT PRIMARY KEY,'
          '  namaAcara TEXT,'
          '  namaTuanRumah TEXT,'
          '  tanggal TEXT,'
          '  lokasi TEXT,'
          '  catatan TEXT,'
          '  mejaList TEXT,'
          '  mode TEXT,'
          '  lastSyncAt TEXT,'
          '  myRole TEXT DEFAULT \'VIEWER\''
          ')',
        );
        // localId: UUID dari client. UNIQUE agar ON CONFLICT bisa dipakai
        // untuk upsert by localId di mergeGuests/mergeBooks.
        await d.execute(
          'CREATE TABLE guest_books('
          '  id TEXT PRIMARY KEY,'
          '  eventId TEXT,'
          '  nama TEXT,'
          '  alamat TEXT,'
          '  localId TEXT UNIQUE,'
          '  createdAt TEXT'
          ')',
        );
        await d.execute(
          'CREATE TABLE guests('
          '  id TEXT PRIMARY KEY,'
          '  eventId TEXT,'
          '  guestBookId TEXT,'
          '  nama TEXT,'
          '  alamat TEXT,'
          '  nominal INTEGER,'
          '  metode TEXT,'
          '  catatan TEXT,'
          '  petugasId TEXT,'
          '  mejaLabel TEXT,'
          '  kodeInput TEXT,'
          '  deviceId TEXT,'
          '  localId TEXT UNIQUE,'
          '  createdAt TEXT,'
          '  updatedAt TEXT'
          ')',
        );
        await d.execute(
          'CREATE TABLE outbox('
          '  id TEXT PRIMARY KEY,'
          '  eventId TEXT,'
          '  action TEXT,'
          '  tableName TEXT,'
          '  payload TEXT,'
          '  attempts INTEGER DEFAULT 0,'
          '  lastError TEXT,'
          '  createdAt TEXT'
          ')',
        );
        await d.execute('CREATE TABLE meta(k TEXT PRIMARY KEY, v TEXT)');
        await d.execute('CREATE INDEX idx_guests_event ON guests(eventId)');
        await d.execute(
          'CREATE INDEX idx_books_event ON guest_books(eventId)',
        );
        await d.execute('CREATE INDEX idx_outbox_event ON outbox(eventId)');
      },
      onUpgrade: (d, oldV, newV) async {
        if (oldV < 2) {
          await d.execute(
            'ALTER TABLE events ADD COLUMN myRole TEXT DEFAULT \'VIEWER\'',
          );
        }
        if (oldV < 3) {
          // Tambah kolom localId di kedua tabel.
          // SQLite tidak support ADD COLUMN UNIQUE secara langsung —
          // tambah kolom dulu, lalu buat unique index terpisah.
          await d.execute(
            'ALTER TABLE guests ADD COLUMN localId TEXT',
          );
          await d.execute(
            'ALTER TABLE guest_books ADD COLUMN localId TEXT',
          );
          // Unique index: enforce keunikan hanya pada nilai non-NULL
          // (SQLite: WHERE localId IS NOT NULL).
          await d.execute(
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_localid'
            ' ON guests(localId) WHERE localId IS NOT NULL',
          );
          await d.execute(
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_books_localid'
            ' ON guest_books(localId) WHERE localId IS NOT NULL',
          );
        }
      },
    );
    return _db!;
  }

  // ── events ────────────────────────────────────────────────────────────────

  Future<void> setMyRole(String eventId, String role) async {
    final d = await db();
    await d.rawUpdate('UPDATE events SET myRole=? WHERE id=?', [role, eventId]);
  }

  Future<List<String>> eventIds() async {
    final d = await db();
    final rows = await d.query('events', columns: ['id']);
    return rows.map((r) => '${r['id']}').toList();
  }

  // ── meta ──────────────────────────────────────────────────────────────────

  Future<void> setMeta(String k, String v) async {
    final d = await db();
    await d.insert(
      'meta',
      {'k': k, 'v': v},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<String?> getMeta(String k) async {
    final d = await db();
    final r = await d.query('meta', where: 'k=?', whereArgs: [k], limit: 1);
    return r.isEmpty ? null : '${r.first['v']}';
  }

  // ── outbox ────────────────────────────────────────────────────────────────

  Future<String> enqueue(
    String eventId,
    String action,
    String table,
    Map<String, dynamic> payload, {
    String? id,
  }) async {
    final d = await db();
    final opId = id ?? (payload['id']?.toString() ?? newId('op'));
    await d.insert(
      'outbox',
      {
        'id': opId,
        'eventId': eventId,
        'action': action,
        'tableName': table,
        'payload': jsonEncode(payload),
        'attempts': 0,
        'createdAt': DateTime.now().toIso8601String(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    return opId;
  }

  Future<List<Map<String, dynamic>>> outboxList(String eventId) async {
    final d = await db();
    return d.query(
      'outbox',
      where: 'eventId=?',
      whereArgs: [eventId],
      orderBy: 'createdAt ASC',
    );
  }

  Future<int> outboxCount(String eventId) async {
    final d = await db();
    final r = await d.rawQuery(
      'SELECT COUNT(*) c FROM outbox WHERE eventId=?',
      [eventId],
    );
    return (r.first['c'] as int?) ?? 0;
  }

  Future<void> outboxRemove(List<String> ids) async {
    if (ids.isEmpty) return;
    final d = await db();
    final ph = List.filled(ids.length, '?').join(',');
    await d.delete('outbox', where: 'id IN ($ph)', whereArgs: ids);
  }

  Future<void> outboxBump(String id, String err) async {
    final d = await db();
    await d.rawUpdate(
      'UPDATE outbox SET attempts=attempts+1, lastError=? WHERE id=?',
      [err, id],
    );
  }

  /// Tulis ulang payload op (resolver konflik) + reset attempts.
  Future<void> outboxUpdatePayload(
    String id,
    Map<String, dynamic> payload,
  ) async {
    final d = await db();
    await d.rawUpdate(
      'UPDATE outbox SET payload=?, attempts=0, lastError=NULL WHERE id=?',
      [jsonEncode(payload), id],
    );
  }

  /// Op yang nyangkut karena butuh catatan (duplikat nama+alamat).
  Future<List<Map<String, dynamic>>> conflictOps(String eventId) async {
    final d = await db();
    return d.query(
      'outbox',
      where: 'eventId=? AND lastError=?',
      whereArgs: [eventId, 'DUPLICATE_NEED_NOTE'],
      orderBy: 'createdAt ASC',
    );
  }

  // ── cache writes (dari pull) ──────────────────────────────────────────────

  Future<void> putEvents(List<dynamic> list) async {
    final d = await db();
    final b = d.batch();
    for (final e in list) {
      if (e is! Map) continue;
      final m = Map<String, dynamic>.from(e);
      // Pertahankan myRole lama saat refresh.
      b.rawInsert(
        '''INSERT INTO events(id,namaAcara,namaTuanRumah,tanggal,lokasi,catatan,mejaList,lastSyncAt,myRole)
          VALUES(?,?,?,?,?,?,?,?,COALESCE((SELECT myRole FROM events WHERE id=?),'VIEWER'))
          ON CONFLICT(id) DO UPDATE SET
            namaAcara=excluded.namaAcara,
            namaTuanRumah=excluded.namaTuanRumah,
            tanggal=excluded.tanggal,
            lokasi=excluded.lokasi,
            catatan=excluded.catatan,
            mejaList=excluded.mejaList,
            lastSyncAt=excluded.lastSyncAt''',
        [
          '${m['id']}',
          '${m['namaAcara'] ?? '-'}',
          m['namaTuanRumah']?.toString(),
          '${m['tanggal'] ?? ''}',
          m['lokasi']?.toString(),
          m['catatan']?.toString(),
          ((m['mejaList'] as List?)?.join(',') ?? 'MEJA-1,MEJA-2'),
          m['lastSyncAt']?.toString(),
          '${m['id']}',
        ],
      );
    }
    await b.commit(noResult: true);
  }

  /// Full replace — dipakai saat full pull (since kosong).
  /// Hapus semua baris lama eventId ini, lalu insert ulang dari server.
  /// localId disertakan agar merge delta berikutnya bisa upsert by localId.
  Future<void> putGuests(String eventId, List<dynamic> list) async {
    final d = await db();
    await d.delete('guests', where: 'eventId=?', whereArgs: [eventId]);
    final b = d.batch();
    for (final e in list) {
      if (e is! Map) continue;
      final m = Map<String, dynamic>.from(e);
      if (m['id'] == null) continue;
      b.insert(
        'guests',
        _guestRow(eventId, m),
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await b.commit(noResult: true);
  }

  Future<void> putBooks(String eventId, List<dynamic> list) async {
    final d = await db();
    await d.delete('guest_books', where: 'eventId=?', whereArgs: [eventId]);
    final b = d.batch();
    for (final e in list) {
      if (e is! Map) continue;
      final m = Map<String, dynamic>.from(e);
      if (m['id'] == null) continue;
      b.insert(
        'guest_books',
        _bookRow(eventId, m),
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await b.commit(noResult: true);
  }

  /// Merge (upsert) hasil pull delta — tidak hapus baris lokal.
  ///
  /// Strategi upsert dua lapis:
  ///   1. Kalau item punya localId → ON CONFLICT(localId): update semua field
  ///      termasuk server id. Ini adalah path utama — baris lokal yang
  ///      id-nya masih == localId akan di-replace dengan server id. ✓
  ///   2. Kalau localId null (data lama dari web) → ON CONFLICT(id) biasa.
  ///
  /// Hasilnya: satu localId = tepat satu baris, tidak peduli berapa kali
  /// pull dipanggil atau dari mana data datangnya.
  Future<void> mergeGuests(String eventId, List<dynamic> list) async {
    if (list.isEmpty) return;
    final d = await db();
    final b = d.batch();
    for (final e in list) {
      if (e is! Map) continue;
      final m = Map<String, dynamic>.from(e);
      if (m['id'] == null) continue;
      final localId = m['localId']?.toString();

      if (localId != null && localId.isNotEmpty) {
        // Upsert by localId: kalau baris dengan localId ini sudah ada
        // (id lokal == localId sementara), update id-nya ke server id.
        b.rawInsert(
          '''INSERT INTO guests(
              id,eventId,guestBookId,nama,alamat,nominal,metode,
              catatan,petugasId,mejaLabel,kodeInput,deviceId,
              localId,createdAt,updatedAt
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(localId) DO UPDATE SET
              id=excluded.id,
              guestBookId=excluded.guestBookId,
              nama=excluded.nama,
              alamat=excluded.alamat,
              nominal=excluded.nominal,
              metode=excluded.metode,
              catatan=excluded.catatan,
              petugasId=excluded.petugasId,
              mejaLabel=excluded.mejaLabel,
              kodeInput=excluded.kodeInput,
              deviceId=excluded.deviceId,
              createdAt=excluded.createdAt,
              updatedAt=excluded.updatedAt''',
          [
            '${m['id']}',
            eventId,
            m['guestBookId']?.toString(),
            '${m['nama']}',
            '${m['alamat']}',
            (m['nominal'] as num?)?.toInt() ?? 0,
            '${m['metode'] ?? 'AMPLOP'}',
            m['catatan']?.toString(),
            m['petugasId']?.toString(),
            m['mejaLabel']?.toString(),
            m['kodeInput']?.toString(),
            m['deviceId']?.toString(),
            localId,
            '${m['createdAt'] ?? ''}',
            '${m['updatedAt'] ?? ''}',
          ],
        );
      } else {
        // Fallback: data lama tanpa localId — upsert by id biasa.
        b.insert(
          'guests',
          _guestRow(eventId, m),
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }
    }
    await b.commit(noResult: true);
  }

  Future<void> mergeBooks(String eventId, List<dynamic> list) async {
    if (list.isEmpty) return;
    final d = await db();
    final b = d.batch();
    for (final e in list) {
      if (e is! Map) continue;
      final m = Map<String, dynamic>.from(e);
      if (m['id'] == null) continue;
      final localId = m['localId']?.toString();

      if (localId != null && localId.isNotEmpty) {
        b.rawInsert(
          '''INSERT INTO guest_books(id,eventId,nama,alamat,localId,createdAt)
            VALUES(?,?,?,?,?,?)
            ON CONFLICT(localId) DO UPDATE SET
              id=excluded.id,
              nama=excluded.nama,
              alamat=excluded.alamat,
              createdAt=excluded.createdAt''',
          [
            '${m['id']}',
            eventId,
            '${m['nama']}',
            '${m['alamat']}',
            localId,
            '${m['createdAt'] ?? ''}',
          ],
        );
      } else {
        b.insert(
          'guest_books',
          _bookRow(eventId, m),
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }
    }
    await b.commit(noResult: true);
  }

  /// Hapus baris lokal berdasarkan id server DAN localId.
  /// Dipanggil saat pull menerima deletedGuestIds / deletedGuestLocalIds.
  /// Parameter baru: guestLocalIds dan bookLocalIds dari pull response.
  Future<void> removeSyncedIds({
    required List<dynamic> guestIds,
    required List<dynamic> bookIds,
    List<dynamic> guestLocalIds = const [],
    List<dynamic> bookLocalIds = const [],
  }) async {
    final d = await db();

    // Hapus by server id.
    if (guestIds.isNotEmpty) {
      final ph = List.filled(guestIds.length, '?').join(',');
      await d.delete('guests', where: 'id IN ($ph)', whereArgs: guestIds);
    }
    if (bookIds.isNotEmpty) {
      final ph = List.filled(bookIds.length, '?').join(',');
      await d.delete(
        'guest_books',
        where: 'id IN ($ph)',
        whereArgs: bookIds,
      );
    }

    // Hapus by localId — untuk baris yang id-nya belum ter-replace.
    if (guestLocalIds.isNotEmpty) {
      final ph = List.filled(guestLocalIds.length, '?').join(',');
      await d.delete(
        'guests',
        where: 'localId IN ($ph)',
        whereArgs: guestLocalIds,
      );
    }
    if (bookLocalIds.isNotEmpty) {
      final ph = List.filled(bookLocalIds.length, '?').join(',');
      await d.delete(
        'guest_books',
        where: 'localId IN ($ph)',
        whereArgs: bookLocalIds,
      );
    }
  }

  // ── helpers baru: lookup by localId ──────────────────────────────────────

  /// Cari baris guest lokal berdasarkan localId.
  /// Return null kalau tidak ditemukan.
  Future<Map<String, dynamic>?> guestByLocalId(String localId) async {
    final d = await db();
    final r = await d.query(
      'guests',
      where: 'localId=?',
      whereArgs: [localId],
      limit: 1,
    );
    return r.isEmpty ? null : Map<String, dynamic>.from(r.first);
  }

  /// Cari baris guest_book lokal berdasarkan localId.
  Future<Map<String, dynamic>?> bookByLocalId(String localId) async {
    final d = await db();
    final r = await d.query(
      'guest_books',
      where: 'localId=?',
      whereArgs: [localId],
      limit: 1,
    );
    return r.isEmpty ? null : Map<String, dynamic>.from(r.first);
  }

  /// Update server id pada baris guest lokal yang sebelumnya pakai
  /// id sementara (== localId). Dipanggil setelah POST /guests sukses
  /// dan server mengembalikan id yang berbeda dari localId.
  ///
  /// Menggantikan replaceGuestWithServer() yang lama:
  ///   - Tidak hapus + insert ulang (lebih aman, tidak orphan outbox).
  ///   - Cukup UPDATE id WHERE localId=?.
  Future<void> updateGuestServerId({
    required String localId,
    required String serverId,
    Map<String, dynamic>? serverFields,
  }) async {
    if (localId == serverId) return; // sudah sama, tidak perlu apa-apa
    final d = await db();
    await d.transaction((txn) async {
      // Update id + field opsional dari server (mejaLabel, guestBookId, dll).
      final updates = <String, dynamic>{'id': serverId};
      if (serverFields != null) {
        for (final k in [
          'guestBookId',
          'mejaLabel',
          'petugasId',
          'updatedAt',
          'createdAt',
        ]) {
          if (serverFields.containsKey(k)) {
            updates[k] = serverFields[k]?.toString();
          }
        }
      }
      final setClause = updates.keys.map((k) => '$k=?').join(',');
      await txn.rawUpdate(
        'UPDATE guests SET $setClause WHERE localId=?',
        [...updates.values, localId],
      );
      // Update juga outbox yang mengacu id lama (== localId) agar flush
      // berikutnya tetap bisa hapus dari outbox by id.
      await txn.rawUpdate(
        'UPDATE outbox SET id=? WHERE id=?',
        [serverId, localId],
      );
    });
  }

  /// Update server id pada baris guest_book lokal.
  Future<void> updateBookServerId({
    required String localId,
    required String serverId,
  }) async {
    if (localId == serverId) return;
    final d = await db();
    await d.transaction((txn) async {
      await txn.rawUpdate(
        'UPDATE guest_books SET id=? WHERE localId=?',
        [serverId, localId],
      );
      await txn.rawUpdate(
        'UPDATE outbox SET id=? WHERE id=?',
        [serverId, localId],
      );
    });
  }

  // ── kept for backward compat (deprecated) ────────────────────────────────

  /// @deprecated Gunakan updateGuestServerId() sebagai gantinya.
  /// Dihapus di versi berikutnya setelah semua call-site dimigrasi.
  Future<void> replaceGuestWithServer({
    required String eventId,
    required String oldId,
    required Map<String, dynamic> server,
  }) async {
    final localId = server['localId']?.toString();
    if (localId != null && localId.isNotEmpty) {
      // Jalur baru: pakai updateGuestServerId agar tidak orphan outbox.
      await updateGuestServerId(
        localId: localId,
        serverId: '${server['id']}',
        serverFields: server,
      );
    } else {
      // Jalur lama (data tanpa localId) — tetap pakai delete+insert.
      final d = await db();
      await d.transaction((txn) async {
        await txn.delete('guests', where: 'id=?', whereArgs: [oldId]);
        await txn.insert(
          'guests',
          _guestRow(eventId, server),
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      });
    }
  }

  // ── optimistic local updates ──────────────────────────────────────────────

  Future<void> updateGuestLocal(String id, Map<String, dynamic> fields) async {
    final d = await db();
    final map = Map<String, dynamic>.from(fields)
      ..['updatedAt'] = DateTime.now().toIso8601String();
    map.remove('id');
    map.remove('eventId');
    map.remove('localId'); // jangan timpa localId via update biasa
    if (map.isEmpty) return;
    await d.update('guests', map, where: 'id=?', whereArgs: [id]);
  }

  Future<void> deleteGuestLocal(String id) async {
    final d = await db();
    await d.delete('guests', where: 'id=?', whereArgs: [id]);
  }

  Future<void> updateBookLocal(String id, Map<String, dynamic> fields) async {
    final d = await db();
    final map = Map<String, dynamic>.from(fields);
    map.remove('id');
    map.remove('eventId');
    map.remove('localId');
    if (map.isEmpty) return;
    await d.update('guest_books', map, where: 'id=?', whereArgs: [id]);
  }

  Future<void> deleteBookLocal(String id) async {
    final d = await db();
    await d.delete('guest_books', where: 'id=?', whereArgs: [id]);
  }

  // ── outbox helpers ────────────────────────────────────────────────────────

  /// Id semua op antrean per event — sumber kebenaran label pending.
  Future<Set<String>> outboxIds(String eventId) async {
    final d = await db();
    final r = await d.query(
      'outbox',
      columns: ['id'],
      where: 'eventId=?',
      whereArgs: [eventId],
    );
    return {for (final o in r) '${o['id']}'};
  }

  /// Kunci dedupe baris tamu: nama|alamat|nominal|metode
  /// (catatan SENGAJA tidak ikut — normalisasi null/"" sering berbeda
  /// antara lokal dan server, menyebabkan false-miss).
  static String guestDedupeKey(Map<String, dynamic> g) {
    final nama = '${g['nama'] ?? ''}'.trim().toLowerCase();
    final alamat = '${g['alamat'] ?? ''}'.trim().toLowerCase();
    final nominal = ((g['nominal'] as num?)?.toInt() ?? 0).toString();
    final metode = '${g['metode'] ?? ''}'.trim().toUpperCase();
    return '$nama|$alamat|$nominal|$metode';
  }

  /// Bersih-bersih: hapus baris lokal yang sudah punya kembaran identik
  /// dengan server id dan tidak lagi antre di outbox.
  /// Sejak ada localId, duplikasi seharusnya tidak terjadi lagi —
  /// fungsi ini tetap ada sebagai safety net untuk data lama.
  Future<int> dedupeSyncedLocalGuests(String eventId) async {
    final d = await db();
    final rows = await d.query(
      'guests',
      where: 'eventId=?',
      whereArgs: [eventId],
    );
    if (rows.length < 2) return 0;
    final pending = await outboxIds(eventId);
    final byKey = <String, List<Map<String, dynamic>>>{};
    for (final r in rows) {
      byKey.putIfAbsent(guestDedupeKey(r), () => []).add(r);
    }
    final doomed = <String>[];
    for (final group in byKey.values) {
      if (group.length < 2) continue;
      // Ada baris dengan server id (non-localId) → hapus yang localId-nya
      // sama dengan id (artinya id sementara yang belum ter-replace).
      final hasServerRow = group.any((r) {
        final id = '${r['id']}';
        final localId = r['localId']?.toString();
        // Server id = id berbeda dari localId (sudah ter-replace)
        // atau id yang bukan UUID v4 murni (CUID dari server).
        return localId == null || localId.isEmpty || id != localId;
      });
      if (!hasServerRow) continue;
      for (final r in rows) {
        final id = '${r['id']}';
        final localId = r['localId']?.toString();
        // Tandai sebagai kandidat hapus: id == localId (belum ter-replace)
        // dan tidak lagi di outbox.
        if (localId != null &&
            id == localId &&
            !pending.contains(id) &&
            guestDedupeKey(r) ==
                guestDedupeKey(group.first)) {
          doomed.add(id);
        }
      }
    }
    if (doomed.isEmpty) return 0;
    final ph = List.filled(doomed.length, '?').join(',');
    await d.delete('guests', where: 'id IN ($ph)', whereArgs: doomed);
    return doomed.length;
  }

  // ── queries ───────────────────────────────────────────────────────────────

  Future<List<Map<String, dynamic>>> guestsLocal(
    String eventId, {
    String q = '',
  }) async {
    final d = await db();
    if (q.isEmpty) {
      return d.query(
        'guests',
        where: 'eventId=?',
        whereArgs: [eventId],
        orderBy: 'createdAt DESC',
      );
    }
    return d.query(
      'guests',
      where: 'eventId=? AND (nama LIKE ? OR alamat LIKE ?)',
      whereArgs: [eventId, '%$q%', '%$q%'],
      orderBy: 'createdAt DESC',
    );
  }

  Future<List<Map<String, dynamic>>> booksLocal(
    String eventId, {
    String q = '',
  }) async {
    final d = await db();
    if (q.isEmpty) {
      return d.query(
        'guest_books',
        where: 'eventId=?',
        whereArgs: [eventId],
        orderBy: 'nama ASC',
      );
    }
    return d.query(
      'guest_books',
      where: 'eventId=? AND nama LIKE ?',
      whereArgs: [eventId, '%$q%'],
      orderBy: 'nama ASC',
      limit: 50,
    );
  }

  // ── private helpers ───────────────────────────────────────────────────────

  /// Bangun map row untuk tabel guests dari JSON server.
  /// Dipanggil dari putGuests, putBooks, replaceGuestWithServer (legacy).
  Map<String, dynamic> _guestRow(String eventId, Map<String, dynamic> m) {
    return {
      'id': '${m['id']}',
      'eventId': eventId,
      'guestBookId': m['guestBookId']?.toString(),
      'nama': '${m['nama']}',
      'alamat': '${m['alamat']}',
      'nominal': (m['nominal'] as num?)?.toInt() ?? 0,
      'metode': '${m['metode'] ?? 'AMPLOP'}',
      'catatan': m['catatan']?.toString(),
      'petugasId': m['petugasId']?.toString(),
      'mejaLabel': m['mejaLabel']?.toString(),
      'kodeInput': m['kodeInput']?.toString(),
      'deviceId': m['deviceId']?.toString(),
      'localId': m['localId']?.toString(),
      'createdAt': '${m['createdAt'] ?? ''}',
      'updatedAt': '${m['updatedAt'] ?? ''}',
    };
  }

  Map<String, dynamic> _bookRow(String eventId, Map<String, dynamic> m) {
    return {
      'id': '${m['id']}',
      'eventId': eventId,
      'nama': '${m['nama']}',
      'alamat': '${m['alamat']}',
      'localId': m['localId']?.toString(),
      'createdAt': '${m['createdAt'] ?? ''}',
    };
  }
}
