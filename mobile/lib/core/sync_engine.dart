import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';

import 'api_client.dart';
import 'local_db.dart';

/// Event yang di-emit setelah pull delta sukses.
/// UI listener (EventDetailScreen, EventsScreen) subscribe untuk
/// update data in-place tanpa user perlu pull-to-refresh.
class SyncPullEvent {
  /// Event id yang baru saja di-pull.
  final String eventId;

  /// Jumlah baris guest yang berubah (baru + update).
  final int guestCount;

  /// Jumlah baris guestBook yang berubah.
  final int bookCount;

  /// Timestamp server saat pull selesai.
  final String pulledAt;

  const SyncPullEvent({
    required this.eventId,
    required this.guestCount,
    required this.bookCount,
    required this.pulledAt,
  });
}

/// Sync engine offline-first:
/// simpan lokal dulu (SQLite + outbox), kalau online langsung push,
/// kalau offline antre.
///
/// Perubahan v2:
///   - Polling 30 detik (sebelumnya 60 detik).
///   - Stream [onPull] di-emit setelah setiap pull delta sukses — UI
///     bisa subscribe untuk silent update tanpa refresh manual.
///   - flush() membaca syncedItems dari /api/sync/push response dan
///     memanggil updateGuestServerId/updateBookServerId untuk rekonsiliasi
///     id lokal → server id setelah flush outbox.
class SyncEngine extends ChangeNotifier with WidgetsBindingObserver {
  static final SyncEngine instance = SyncEngine._();
  SyncEngine._();

  Timer? _timer;
  StreamSubscription? _sub;

  // ── state publik (dibaca oleh UI via ListenableBuilder / addListener) ─────
  final Map<String, int> pendingByEvent = {};
  bool online = true;
  bool flushing = false;
  bool syncing = false;
  String? lastError;
  DateTime? lastSyncedAt;

  // ── stream pull events (silent background update) ────────────────────────
  /// Stream yang di-emit setiap kali pull delta selesai untuk satu eventId.
  /// UI screen subscribe via [onPull].listen() dan merge data in-place
  /// tanpa setState(loading=true) — user tidak melihat flash kosong.
  final _pullController = StreamController<SyncPullEvent>.broadcast();
  Stream<SyncPullEvent> get onPull => _pullController.stream;

  // ── internal ──────────────────────────────────────────────────────────────
  Future<void>? _activeSync;
  bool _started = false;

  void start() {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);

    // Subscribe perubahan koneksi — saat online kembali langsung sync.
    _sub ??= Connectivity().onConnectivityChanged.listen((r) {
      final hasNet = !r.contains(ConnectivityResult.none);
      online = hasNet;
      notifyListeners();
      if (hasNet) syncInBackground();
    });

    // Polling 30 detik — cukup real-time untuk hajatan multi-kasir.
    _timer ??= Timer.periodic(
      const Duration(seconds: 30),
      (_) => syncInBackground(),
    );

    checkNow();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Sync segera saat app kembali ke foreground.
    if (state == AppLifecycleState.resumed) syncInBackground();
  }

  Future<void> checkNow() async {
    online = await ApiClient.instance
        .health()
        .timeout(const Duration(seconds: 6), onTimeout: () => false)
        .catchError((_) => false);
    notifyListeners();
  }

  Future<void> syncInBackground() {
    _activeSync ??= _syncAll().whenComplete(() => _activeSync = null);
    return _activeSync!;
  }

  Future<void> _syncAll() async {
    if (syncing) return;
    syncing = true;
    lastError = null;
    notifyListeners();
    try {
      await checkNow();
      if (!online) return;
      final ids = await LocalDb.instance.eventIds();
      for (final id in ids) {
        await flush(id);
      }
      lastSyncedAt = DateTime.now();
    } catch (e) {
      lastError = e.toString();
    } finally {
      syncing = false;
      notifyListeners();
    }
  }

  Future<int> pending(String eventId) async {
    final c = await LocalDb.instance.outboxCount(eventId);
    pendingByEvent[eventId] = c;
    notifyListeners();
    return c;
  }

  Future<void> flushAll() async {
    if (flushing || syncing) return;
    flushing = true;
    try {
      final db = await LocalDb.instance.db();
      final rows = await db.rawQuery('SELECT DISTINCT eventId FROM outbox');
      for (final r in rows) {
        await flush('${r['eventId']}');
      }
    } finally {
      flushing = false;
    }
  }

  /// Push outbox + pull delta. Tidak pernah throw ke caller.
  /// Returns (flushed, conflicts, error?).
  Future<(int, int, String?)> flush(String eventId) async {
    try {
      final dio = await ApiClient.instance.dio();
      final ops = await LocalDb.instance.outboxList(eventId);

      // Pisah: CREATE via batch push, sisanya satu-per-satu.
      final creates =
          ops.where((o) => '${o['action']}'.startsWith('CREATE_')).toList();
      final rest =
          ops.where((o) => !'${o['action']}'.startsWith('CREATE_')).toList();

      final guestPayloads = <Map<String, dynamic>>[];
      final bookPayloads = <Map<String, dynamic>>[];
      final eventPayloads = <Map<String, dynamic>>[];
      for (final o in creates) {
        final p = jsonDecode('${o['payload']}') as Map<String, dynamic>;
        if (o['action'] == 'CREATE_GUEST') guestPayloads.add(p);
        if (o['action'] == 'CREATE_BOOK') bookPayloads.add(p);
        if (o['action'] == 'CREATE_EVENT') eventPayloads.add(p);
      }

      int flushed = 0, conflicts = 0;
      String? err;

      // ── Batch push via /api/sync/push ──────────────────────────────────
      if (creates.isNotEmpty) {
        try {
          final res = await dio.post(
            '/api/sync/push',
            data: {
              'guests': guestPayloads,
              'guestBooks': bookPayloads,
              'events': eventPayloads,
            },
          );
          final data = Map<String, dynamic>.from(res.data as Map);

          // ── Rekonsiliasi id via syncedItems ────────────────────────────
          // Server kembalikan syncedItems.{guests,guestBooks} berisi
          // {id: server-CUID, localId: UUID-client}.
          // Kalau id != localId → baris lokal masih pakai id sementara
          // → UPDATE SQLite id lokal ke server id.
          final syncedItems =
              (data['syncedItems'] as Map?)?.cast<String, dynamic>() ?? {};

          final syncedGuests =
              (syncedItems['guests'] as List? ?? []).cast<Map<dynamic, dynamic>>();
          for (final item in syncedGuests) {
            final serverId = '${item['id'] ?? ''}';
            final localId = item['localId']?.toString();
            if (serverId.isEmpty || localId == null || localId.isEmpty) {
              continue;
            }
            if (serverId != localId) {
              // id sementara (== localId) masih di SQLite → ganti ke server id.
              await LocalDb.instance.updateGuestServerId(
                localId: localId,
                serverId: serverId,
              );
            }
          }

          final syncedBooks =
              (syncedItems['guestBooks'] as List? ?? [])
                  .cast<Map<dynamic, dynamic>>();
          for (final item in syncedBooks) {
            final serverId = '${item['id'] ?? ''}';
            final localId = item['localId']?.toString();
            if (serverId.isEmpty || localId == null || localId.isEmpty) {
              continue;
            }
            if (serverId != localId) {
              await LocalDb.instance.updateBookServerId(
                localId: localId,
                serverId: serverId,
              );
            }
          }

          // ── Bersihkan outbox setelah rekonsiliasi ──────────────────────
          final cfl = (data['conflicts'] as List? ?? []);
          final cIds = cfl.map((e) => '${(e as Map)['id']}').toSet();
          final forbidden = cfl
              .where((e) => (e as Map)['reason'] == 'FORBIDDEN')
              .map((e) => '${(e as Map)['id']}')
              .toList();

          // Done = creates yang tidak conflict.
          // Gunakan server id (setelah rekonsiliasi) untuk remove outbox.
          final done = creates
              .where((o) => !cIds.contains('${o['id']}'))
              .map((o) => '${o['id']}')
              .toList();
          if (done.isNotEmpty) await LocalDb.instance.outboxRemove(done);
          if (forbidden.isNotEmpty) {
            await LocalDb.instance.outboxRemove(forbidden);
          }

          flushed =
              (data['synced']?['guests'] as int? ?? 0) +
              (data['synced']?['guestBooks'] as int? ?? 0) +
              (data['synced']?['events'] as int? ?? 0);
          conflicts = cIds.length;

          for (final id in cIds) {
            if (forbidden.contains(id)) continue;
            await LocalDb.instance.outboxBump(id, 'DUPLICATE_NEED_NOTE');
          }
        } on DioException catch (e) {
          err = _netErr(e);
          if (err == 'offline') {
            await pending(eventId);
            return (0, 0, err);
          }
        }
      }

      // ── Op non-create satu-per-satu (update/delete) ────────────────────
      for (final op in rest) {
        if ((op['attempts'] as int? ?? 0) > 25) {
          await LocalDb.instance.outboxRemove(['${op['id']}']);
          err ??= 'too-many-attempts';
          continue;
        }
        final r = await _flushSingle(dio, op);
        if (r.done) {
          await LocalDb.instance.outboxRemove(['${op['id']}']);
          flushed += 1;
        } else if (r.conflict) {
          conflicts += 1;
          await LocalDb.instance.outboxBump(
            '${op['id']}',
            'DUPLICATE_NEED_NOTE',
          );
          err ??= 'DUPLICATE_NEED_NOTE';
        } else {
          await LocalDb.instance.outboxBump(
            '${op['id']}',
            r.error ?? 'flush-failed',
          );
          err ??= r.error;
          if (r.error == 'offline') break;
        }
      }

      // ── Pull delta (best-effort) ───────────────────────────────────────
      // Selalu pull setelah push — agar data dari web/device lain muncul
      // tanpa user perlu refresh manual. Hasil di-emit ke [onPull] stream
      // sehingga UI bisa merge in-place.
      try {
        final since =
            await LocalDb.instance.getMeta('lastPull:$eventId') ?? '';
        final q = {'eventId': eventId, if (since.isNotEmpty) 'since': since};
        final pr = await dio.get('/api/sync/pull', queryParameters: q);
        final pj = Map<String, dynamic>.from(pr.data as Map);
        final g = (pj['guests'] as List? ?? []);
        final b = (pj['guestBooks'] as List? ?? []);

        // Hapus baris yang sudah dihapus di server (by id DAN by localId).
        await LocalDb.instance.removeSyncedIds(
          guestIds: (pj['deletedGuestIds'] as List? ?? []),
          bookIds: (pj['deletedGuestBookIds'] as List? ?? []),
          guestLocalIds: (pj['deletedGuestLocalIds'] as List? ?? []),
          bookLocalIds: (pj['deletedGuestBookLocalIds'] as List? ?? []),
        );

        if (since.isEmpty) {
          // Full pull pertama — replace seluruh cache.
          if (g.isNotEmpty) await LocalDb.instance.putGuests(eventId, g);
          if (b.isNotEmpty) await LocalDb.instance.putBooks(eventId, b);
        } else {
          // Delta pull — merge by localId (upsert), tidak hapus baris lokal.
          await LocalDb.instance.mergeGuests(eventId, g);
          await LocalDb.instance.mergeBooks(eventId, b);
        }

        final pulledAt = '${pj['pulledAt'] ?? ''}';
        await LocalDb.instance.setMeta('lastPull:$eventId', pulledAt);

        // Emit event ke stream — UI listener merge in-place (silent update).
        if (!_pullController.isClosed && (g.isNotEmpty || b.isNotEmpty)) {
          _pullController.add(
            SyncPullEvent(
              eventId: eventId,
              guestCount: g.length,
              bookCount: b.length,
              pulledAt: pulledAt,
            ),
          );
        }
      } on DioException catch (e) {
        // Pull balas 403/404: event mungkin dihapus/di-kick di server.
        await _handleGonePullEvent(dio, eventId, e);
      } catch (_) {
        // Pull gagal (offline / server error) — bukan masalah fatal,
        // data lokal tetap tersaji.
      }

      await pending(eventId);
      return (flushed, conflicts, err);
    } catch (_) {
      return (0, 0, 'offline');
    }
  }

  String _netErr(DioException e) =>
      e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout
      ? 'offline'
      : 'HTTP ${e.response?.statusCode}';

  /// Pull balas 403/404: pastikan event benar-benar hilang di server
  /// (bukan sesi kedaluwarsa) dan tidak ada antrean outbox, baru hapus lokal.
  Future<void> _handleGonePullEvent(
    Dio dio,
    String eventId,
    DioException e,
  ) async {
    final s = e.response?.statusCode ?? 0;
    if (s != 403 && s != 404) return;
    if (await LocalDb.instance.outboxCount(eventId) > 0) return;
    try {
      final r = await dio.get('/api/events');
      final ids =
          (r.data as List? ?? []).map((m) => '${(m as Map)['id']}').toSet();
      if (!ids.contains(eventId)) {
        await LocalDb.instance.deleteEventLocal(eventId);
      }
    } catch (_) {}
  }

  /// Flush satu op non-create (UPDATE/DELETE) via endpoint langsung.
  /// 404 = anggap sinkron, 409 = konflik, 4xx lain = buang (tidak macet).
  Future<({bool done, bool conflict, String? error})> _flushSingle(
    Dio dio,
    Map<String, dynamic> op,
  ) async {
    final p = jsonDecode('${op['payload']}') as Map<String, dynamic>;
    final action = '${op['action']}';
    final eventId = '${op['eventId']}';
    final id = '${p['id'] ?? op['id']}';
    try {
      late final Response res;
      final fields =
          (p['fields'] is Map)
                ? Map<String, dynamic>.from(p['fields'] as Map)
                : Map<String, dynamic>.from(p)
            ..remove('id');
      if (action == 'UPDATE_GUEST') {
        res = await dio.patch('/api/guests/$id', data: fields);
      } else if (action == 'DELETE_GUEST') {
        res = await dio.delete('/api/guests/$id');
      } else if (action == 'UPDATE_BOOK') {
        res = await dio.patch('/api/guestbooks/$id', data: fields);
      } else if (action == 'DELETE_BOOK') {
        res = await dio.delete('/api/guestbooks/$id');
      } else if (action == 'UPDATE_EVENT') {
        res = await dio.patch('/api/events/$eventId', data: fields);
      } else if (action == 'ADD_MEMBER') {
        res = await dio.post('/api/events/$eventId/members', data: fields);
      } else if (action == 'SET_ROLE') {
        res = await dio.patch(
          '/api/events/$eventId/members',
          data: {
            'userId': '${p['userId'] ?? ''}',
            'role': '${p['role'] ?? ''}',
          },
        );
      } else if (action == 'REMOVE_MEMBER') {
        res = await dio.delete(
          '/api/events/$eventId/members',
          queryParameters: {'userId': '${p['userId'] ?? ''}'},
        );
      } else {
        return (done: false, conflict: false, error: 'unknown-action');
      }
      if (res.statusCode == 200 || res.statusCode == 201) {
        return (done: true, conflict: false, error: null);
      }
      return (done: false, conflict: false, error: 'HTTP ${res.statusCode}');
    } on DioException catch (e) {
      final s = e.response?.statusCode ?? 0;
      if (s == 404) return (done: true, conflict: false, error: null);
      if (s == 409) return (done: false, conflict: true, error: null);
      if (s >= 400 && s < 500) {
        return (done: true, conflict: false, error: 'rejected-$s');
      }
      return (done: false, conflict: false, error: _netErr(e));
    } catch (_) {
      return (done: false, conflict: false, error: 'offline');
    }
  }

  // ── helpers untuk UI ──────────────────────────────────────────────────────

  /// Daftar op konflik + ringkasannya untuk UI resolver.
  Future<List<Map<String, dynamic>>> conflictOps(String eventId) =>
      LocalDb.instance.conflictOps(eventId);

  static Map<String, String> conflictView(Map<String, dynamic> op) {
    final p = jsonDecode('${op['payload']}') as Map<String, dynamic>;
    final src =
        (op['action'] == 'UPDATE_GUEST' && p['fields'] is Map)
            ? Map<String, dynamic>.from(p['fields'] as Map)
            : p;
    return {
      'nama': '${src['nama'] ?? '-'}',
      'alamat': '${src['alamat'] ?? '-'}',
      'nominal': '${src['nominal'] ?? '-'}',
      'metode': '${src['metode'] ?? '-'}',
    };
  }

  /// Isi catatan untuk konflik duplikat lalu antre ulang.
  Future<void> resolveConflict(String opId, String catatan) async {
    final db = await LocalDb.instance.db();
    final rows =
        await db.query('outbox', where: 'id=?', whereArgs: [opId], limit: 1);
    if (rows.isEmpty) return;
    final op = rows.first;
    final p = jsonDecode('${op['payload']}') as Map<String, dynamic>;
    if (op['action'] == 'UPDATE_GUEST' && p['fields'] is Map) {
      final fields = Map<String, dynamic>.from(p['fields'] as Map)
        ..['catatan'] = catatan;
      p['fields'] = fields;
    } else {
      p['catatan'] = catatan;
    }
    await LocalDb.instance.outboxUpdatePayload(opId, p);
  }

  Future<void> discardOp(String eventId, String opId) async {
    await LocalDb.instance.outboxRemove([opId]);
    await pending(eventId);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _sub?.cancel();
    _pullController.close();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}
