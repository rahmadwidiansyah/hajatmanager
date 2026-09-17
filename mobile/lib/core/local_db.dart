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

  Future<Database> db() async {
    if (_db != null) return _db!;
    final String path;
    if (_isDesktop) {
      // sqflite:getDatabasesPath tidak ada di desktop → pakai app documents.
      final dir = await getApplicationDocumentsDirectory();
      path = p.join(dir.path, 'hajat_manager.db');
    } else {
      path = p.join(await getDatabasesPath(), 'hajat_manager.db');
    }
    _db = await openDatabase(path, version: 2,
        onCreate: (d, v) async {
      await d.execute(
          'CREATE TABLE events(id TEXT PRIMARY KEY, namaAcara TEXT, namaTuanRumah TEXT, tanggal TEXT, lokasi TEXT, catatan TEXT, mejaList TEXT, mode TEXT, lastSyncAt TEXT, myRole TEXT DEFAULT \'VIEWER\')');
      await d.execute(
          'CREATE TABLE guest_books(id TEXT PRIMARY KEY, eventId TEXT, nama TEXT, alamat TEXT, createdAt TEXT)');
      await d.execute(
          'CREATE TABLE guests(id TEXT PRIMARY KEY, eventId TEXT, guestBookId TEXT, nama TEXT, alamat TEXT, nominal INTEGER, metode TEXT, catatan TEXT, petugasId TEXT, mejaLabel TEXT, kodeInput TEXT, deviceId TEXT, createdAt TEXT, updatedAt TEXT)');
      await d.execute(
          'CREATE TABLE outbox(id TEXT PRIMARY KEY, eventId TEXT, action TEXT, tableName TEXT, payload TEXT, attempts INTEGER DEFAULT 0, lastError TEXT, createdAt TEXT)');
      await d.execute('CREATE TABLE meta(k TEXT PRIMARY KEY, v TEXT)');
      await d.execute('CREATE INDEX idx_guests_event ON guests(eventId)');
      await d.execute('CREATE INDEX idx_books_event ON guest_books(eventId)');
      await d.execute('CREATE INDEX idx_outbox_event ON outbox(eventId)');
    }, onUpgrade: (d, oldV, newV) async {
      if (oldV < 2) {
        await d.execute(
            'ALTER TABLE events ADD COLUMN myRole TEXT DEFAULT \'VIEWER\'');
      }
    });
    return _db!;
  }

  Future<void> setMyRole(String eventId, String role) async {
    final d = await db();
    await d.rawUpdate(
        'UPDATE events SET myRole=? WHERE id=?', [role, eventId]);
  }

  // ---- meta ----
  Future<void> setMeta(String k, String v) async {
    final d = await db();
    await d.insert('meta', {'k': k, 'v': v},
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<String?> getMeta(String k) async {
    final d = await db();
    final r = await d.query('meta', where: 'k=?', whereArgs: [k], limit: 1);
    return r.isEmpty ? null : '${r.first['v']}';
  }

  // ---- outbox ----
  Future<String> enqueue(String eventId, String action, String table,
      Map<String, dynamic> payload,
      {String? id}) async {
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
        conflictAlgorithm: ConflictAlgorithm.replace);
    return opId;
  }

  Future<List<Map<String, dynamic>>> outboxList(String eventId) async {
    final d = await db();
    return d.query('outbox',
        where: 'eventId=?', whereArgs: [eventId], orderBy: 'createdAt ASC');
  }

  Future<int> outboxCount(String eventId) async {
    final d = await db();
    final r = await d.rawQuery(
        'SELECT COUNT(*) c FROM outbox WHERE eventId=?', [eventId]);
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
        [err, id]);
  }

  /// Tulis ulang payload op (resolver konflik) + reset attempts.
  Future<void> outboxUpdatePayload(
      String id, Map<String, dynamic> payload) async {
    final d = await db();
    await d.rawUpdate(
        'UPDATE outbox SET payload=?, attempts=0, lastError=NULL WHERE id=?',
        [jsonEncode(payload), id]);
  }

  /// Op yang nyangkut karena butuh catatan (duplikat nama+alamat).
  Future<List<Map<String, dynamic>>> conflictOps(String eventId) async {
    final d = await db();
    return d.query('outbox',
        where: 'eventId=? AND lastError=?',
        whereArgs: [eventId, 'DUPLICATE_NEED_NOTE'],
        orderBy: 'createdAt ASC');
  }

  // ---- cache writes (dari pull) ----
  Future<void> putEvents(List<dynamic> list) async {
    final d = await db();
    final b = d.batch();
    for (final e in list) {
      if (e is! Map) continue;
      final m = Map<String, dynamic>.from(e);
      // Pertahankan myRole lama saat refresh (ON CONFLICT tanpa replace).
      b.rawInsert(
          '''INSERT INTO events(id,namaAcara,namaTuanRumah,tanggal,lokasi,catatan,mejaList,lastSyncAt,myRole)
          VALUES(?,?,?,?,?,?,?, ?,COALESCE((SELECT myRole FROM events WHERE id=?),'VIEWER'))
          ON CONFLICT(id) DO UPDATE SET namaAcara=excluded.namaAcara,namaTuanRumah=excluded.namaTuanRumah,tanggal=excluded.tanggal,lokasi=excluded.lokasi,catatan=excluded.catatan,mejaList=excluded.mejaList,lastSyncAt=excluded.lastSyncAt''',
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
          ]);
    }
    await b.commit(noResult: true);
  }

  Future<void> putGuests(String eventId, List<dynamic> list) async {
    final d = await db();
    await d.delete('guests', where: 'eventId=?', whereArgs: [eventId]);
    final b = d.batch();
    for (final e in list) {
      if (e is! Map) continue;
      final m = Map<String, dynamic>.from(e);
      b.insert(
          'guests',
          {
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
            'createdAt': '${m['createdAt'] ?? ''}',
            'updatedAt': '${m['updatedAt'] ?? ''}',
          },
          conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await b.commit(noResult: true);
  }

  Future<void> putBooks(String eventId, List<dynamic> list) async {
    final d = await db();
    await d.delete('guest_books',
        where: 'eventId=?', whereArgs: [eventId]);
    final b = d.batch();
    for (final e in list) {
      if (e is! Map) continue;
      final m = Map<String, dynamic>.from(e);
      b.insert(
          'guest_books',
          {
            'id': '${m['id']}',
            'eventId': eventId,
            'nama': '${m['nama']}',
            'alamat': '${m['alamat']}',
            'createdAt': '${m['createdAt'] ?? ''}',
          },
          conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await b.commit(noResult: true);
  }

  /// Merge (upsert per id) hasil pull delta — tanpa hapus baris lokal.
  /// Dipakai agar data dari web muncul di APK walau `since` tidak kosong.
  Future<void> mergeGuests(String eventId, List<dynamic> list) async {
    if (list.isEmpty) return;
    final d = await db();
    final b = d.batch();
    for (final e in list) {
      if (e is! Map) continue;
      final m = Map<String, dynamic>.from(e);
      if (m['id'] == null) continue;
      b.insert(
          'guests',
          {
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
            'createdAt': '${m['createdAt'] ?? ''}',
            'updatedAt': '${m['updatedAt'] ?? ''}',
          },
          conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await b.commit(noResult: true);
  }

  Future<void> mergeBooks(String eventId, List<dynamic> list) async {
    if (list.isEmpty) return;    if (list.isEmpty) return;
    final d = await db();
    final b = d.batch();
    for (final e in list) {
      if (e is! Map) continue;
      final m = Map<String, dynamic>.from(e);
      if (m['id'] == null) continue;
      b.insert(
          'guest_books',
          {
            'id': '${m['id']}',
            'eventId': eventId,
            'nama': '${m['nama']}',
            'alamat': '${m['alamat']}',
            'createdAt': '${m['createdAt'] ?? ''}',
          },
          conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await b.commit(noResult: true);
  }

  /// Update baris lokal (optimistic) untuk edit.
  Future<void> updateGuestLocal(
      String id, Map<String, dynamic> fields) async {
    final d = await db();
    final map = Map<String, dynamic>.from(fields)
      ..['updatedAt'] = DateTime.now().toIso8601String();
    map.remove('id');
    map.remove('eventId');
    if (map.isEmpty) return;
    await d.update('guests', map, where: 'id=?', whereArgs: [id]);
  }

  Future<void> deleteGuestLocal(String id) async {
    final d = await db();
    await d.delete('guests', where: 'id=?', whereArgs: [id]);
  }

  /// Id semua op antrean per event — sumber kebenaran label pending.
  /// (Label lama berdasar prefix `gst-` basi setelah sync: baris lokal
  /// tetap ber-id gst walau outbox-nya sudah hilang.)
  Future<Set<String>> outboxIds(String eventId) async {
    final d = await db();
    final r = await d.query('outbox',
        columns: ['id'], where: 'eventId=?', whereArgs: [eventId]);
    return {for (final o in r) '${o['id']}'};
  }

  /// Kunci dedupe baris tamu: nama|alamat|nominal|metode|catatan
  /// (normalisasi trim + case-insensitive; null == string kosong).
  /// Murni (tanpa IO) agar bisa di-unit-test.
  static String guestDedupeKey(Map<String, dynamic> g) {
    final nama = '${g['nama'] ?? ''}'.trim().toLowerCase();
    final alamat = '${g['alamat'] ?? ''}'.trim().toLowerCase();
    final nominal = ((g['nominal'] as num?)?.toInt() ?? 0).toString();
    final metode = '${g['metode'] ?? ''}'.trim().toUpperCase();
    final catatan = '${g['catatan'] ?? ''}'.trim().toLowerCase();
    return '$nama|$alamat|$nominal|$metode|$catatan';
  }

  /// Ganti baris lokal `oldId` (biasanya `gst-*`) dengan objek server
  /// dari respons POST 201 (id server baru). Dipakai agar tidak dobel:
  /// tanpa ini pull berikutnya merge baris server sebagai baris kedua.
  Future<void> replaceGuestWithServer({
    required String eventId,
    required String oldId,
    required Map<String, dynamic> server,
  }) async {
    final d = await db();
    final m = server;
    await d.transaction((txn) async {
      await txn.delete('guests', where: 'id=?', whereArgs: [oldId]);
      await txn.insert(
          'guests',
          {
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
            'createdAt': '${m['createdAt'] ?? ''}',
            'updatedAt': '${m['updatedAt'] ?? ''}',
          },
          conflictAlgorithm: ConflictAlgorithm.replace);
    });
  }

  /// Bersih-bersih sekali jalan: hapus baris lokal `gst-*` yang sudah
  /// punya kembaran identik (kunci dedupe sama, id beda) dan tidak lagi
  /// antre di outbox. Memperbaiki data dobel lama akibat bug rekonsiliasi
  /// (POST 201 langsung tanpa ganti id). Return jumlah baris dihapus.
  Future<int> dedupeSyncedLocalGuests(String eventId) async {
    final d = await db();
    final rows = await d.query('guests',
        where: 'eventId=?', whereArgs: [eventId]);
    if (rows.length < 2) return 0;
    final pending = await outboxIds(eventId);
    final byKey = <String, List<Map<String, dynamic>>>{};
    for (final r in rows) {
      byKey.putIfAbsent(guestDedupeKey(r), () => []).add(r);
    }
    final doomed = <String>[];
    for (final group in byKey.values) {
      if (group.length < 2) continue;
      final hasServerTwin =
          group.any((r) => !'${r['id']}'.startsWith('gst-'));
      if (!hasServerTwin) continue;
      for (final r in group) {
        final id = '${r['id']}';
        if (id.startsWith('gst-') && !pending.contains(id)) {
          doomed.add(id);
        }
      }
    }
    if (doomed.isEmpty) return 0;
    final ph = List.filled(doomed.length, '?').join(',');
    await d.delete('guests', where: 'id IN ($ph)', whereArgs: doomed);
    return doomed.length;
  }

  Future<void> updateBookLocal(
      String id, Map<String, dynamic> fields) async {
    final d = await db();
    final map = Map<String, dynamic>.from(fields);
    map.remove('id');
    map.remove('eventId');
    if (map.isEmpty) return;
    await d.update('guest_books', map, where: 'id=?', whereArgs: [id]);
  }

  Future<void> deleteBookLocal(String id) async {
    final d = await db();
    await d.delete('guest_books', where: 'id=?', whereArgs: [id]);
  }

  Future<List<Map<String, dynamic>>> guestsLocal(String eventId,      {String q = ''}) async {
    final d = await db();
    if (q.isEmpty) {
      return d.query('guests',
          where: 'eventId=?', whereArgs: [eventId], orderBy: 'createdAt DESC');
    }
    return d.query('guests',
        where: 'eventId=? AND (nama LIKE ? OR alamat LIKE ?)',
        whereArgs: [eventId, '%$q%', '%$q%'],
        orderBy: 'createdAt DESC');
  }

  Future<List<Map<String, dynamic>>> booksLocal(String eventId,
      {String q = ''}) async {
    final d = await db();
    if (q.isEmpty) {
      return d.query('guest_books',
          where: 'eventId=?', whereArgs: [eventId], orderBy: 'nama ASC');
    }
    return d.query('guest_books',
        where: 'eventId=? AND nama LIKE ?',
        whereArgs: [eventId, '%$q%'],
        orderBy: 'nama ASC',
        limit: 50);
  }
}
