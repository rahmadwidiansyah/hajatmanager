import 'dart:async';
import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'api_client.dart';
import 'local_db.dart';

/// Sync engine offline-first:
/// simpan lokal dulu (SQLite + outbox), kalau online langsung push,
/// kalau offline antre. Auto-flush 60 dtk + saat online kembali.
class SyncEngine extends ChangeNotifier {
  static final SyncEngine instance = SyncEngine._();
  SyncEngine._();
  Timer? _timer;
  StreamSubscription? _sub;
  final Map<String, int> pendingByEvent = {};
  bool online = true;
  bool flushing = false;

  void start() {
    _sub ??= Connectivity().onConnectivityChanged.listen((r) {
      final hasNet = !r.contains(ConnectivityResult.none);
      online = hasNet;
      notifyListeners();
      if (hasNet) flushAll();
    });
    _timer ??= Timer.periodic(const Duration(seconds: 60), (_) => flushAll());
    checkNow();
  }

  Future<void> checkNow() async {
    online = await ApiClient.instance.health().timeout(
      const Duration(seconds: 6),
      onTimeout: () => false,
    ).catchError((_) => false);
    notifyListeners();
  }

  Future<int> pending(String eventId) async {
    final c = await LocalDb.instance.outboxCount(eventId);
    pendingByEvent[eventId] = c;
    notifyListeners();
    return c;
  }

  Future<void> flushAll() async {
    if (flushing) return;
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

  /// Push batch + pull delta. Tidak pernah throw.
  /// Returns (flushed, conflicts, error).
  Future<(int, int, String?)> flush(String eventId) async {
    try {
      final dio = await ApiClient.instance.dio();
      final ops = await LocalDb.instance.outboxList(eventId);
      if (ops.isEmpty) {
        await pending(eventId);
        return (0, 0, null);
      }
      // Pisah: create via batch, sisanya satu-per-satu.
      final creates =
          ops.where((o) => '${o['action']}'.startsWith('CREATE_')).toList();
      final rest =
          ops.where((o) => !'${o['action']}'.startsWith('CREATE_')).toList();
      final guests = <Map<String, dynamic>>[];
      final books = <Map<String, dynamic>>[];
      final events = <Map<String, dynamic>>[];
      for (final o in creates) {
        final p = jsonDecode('${o['payload']}') as Map<String, dynamic>;
        if (o['action'] == 'CREATE_GUEST') guests.add(p);
        if (o['action'] == 'CREATE_BOOK') books.add(p);
        if (o['action'] == 'CREATE_EVENT') events.add(p);
      }
      int flushed = 0, conflicts = 0;
      String? err;
      if (creates.isNotEmpty) {
        try {
          final res = await dio.post('/api/sync/push', data: {
            'guests': guests,
            'guestBooks': books,
            'events': events,
          });
          final data = Map<String, dynamic>.from(res.data as Map);
          final cfl = (data['conflicts'] as List? ?? []);
          final cIds = cfl.map((e) => '${(e as Map)['id']}').toSet();
          // Item ditolak server karena role (VIEWER) langsung dibuang, bukan retry.
          final forbidden = cfl
              .where((e) => (e as Map)['reason'] == 'FORBIDDEN')
              .map((e) => '${(e as Map)['id']}')
              .toList();
          final done = creates
              .where((o) => !cIds.contains('${o['id']}'))
              .map((o) => '${o['id']}')
              .toList();
          await LocalDb.instance.outboxRemove(done);
          if (forbidden.isNotEmpty) {
            await LocalDb.instance.outboxRemove(forbidden);
          }
          flushed = (data['synced']?['guests'] as int? ?? 0) +
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
      // Op non-create satu-per-satu; berhenti dini bila offline.
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
          await LocalDb.instance
              .outboxBump('${op['id']}', 'DUPLICATE_NEED_NOTE');
          err ??= 'DUPLICATE_NEED_NOTE';
        } else {
          await LocalDb.instance
              .outboxBump('${op['id']}', r.error ?? 'flush-failed');
          err ??= r.error;
          if (r.error == 'offline') break;
        }
      }
      // pull best-effort
      try {
        final since =
            await LocalDb.instance.getMeta('lastPull:$eventId') ?? '';
        final q = {
          'eventId': eventId,
          if (since.isNotEmpty) 'since': since,
        };
        final pr = await dio.get('/api/sync/pull', queryParameters: q);
        final pj = Map<String, dynamic>.from(pr.data as Map);
        final g = (pj['guests'] as List? ?? []);
        final b = (pj['guestBooks'] as List? ?? []);
        if (since.isEmpty) {
          if (g.isNotEmpty) {
            await LocalDb.instance.putGuests(eventId, g);
          }
          if (b.isNotEmpty) {
            await LocalDb.instance.putBooks(eventId, b);
          }
        } else {
          await LocalDb.instance.mergeGuests(eventId, g);
          await LocalDb.instance.mergeBooks(eventId, b);
        }
        await LocalDb.instance.setMeta(
            'lastPull:$eventId', '${pj['pulledAt'] ?? ''}');
      } catch (_) {}
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

  /// Flush satu op non-create via endpoint langsung.
  /// 404 = anggap sinkron (sudah hilang di server), 409 = konflik,
  /// 4xx lain = buang agar antrean tidak macet.
  Future<({bool done, bool conflict, String? error})> _flushSingle(
      Dio dio, Map<String, dynamic> op) async {
    final p = jsonDecode('${op['payload']}') as Map<String, dynamic>;
    final action = '${op['action']}';
    final eventId = '${op['eventId']}';
    final id = '${p['id'] ?? op['id']}';
    try {
      late final Response res;
      final fields = (p['fields'] is Map)
          ? Map<String, dynamic>.from(p['fields'] as Map)
          : Map<String, dynamic>.from(p)..remove('id');
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
        res = await dio.post('/api/events/$eventId/members',
            data: fields);
      } else if (action == 'SET_ROLE') {
        res = await dio.patch('/api/events/$eventId/members', data: {
          'userId': '${p['userId'] ?? ''}',
          'role': '${p['role'] ?? ''}',
        });
      } else if (action == 'REMOVE_MEMBER') {
        res = await dio.delete('/api/events/$eventId/members',
            queryParameters: {'userId': '${p['userId'] ?? ''}'});
      } else {
        return (done: false, conflict: false, error: 'unknown-action');
      }
      if (res.statusCode == 200 || res.statusCode == 201) {
        return (done: true, conflict: false, error: null);
      }
      return (
        done: false,
        conflict: false,
        error: 'HTTP ${res.statusCode}'
      );
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

  /// Daftar op konflik + ringkasannya untuk UI resolver.
  Future<List<Map<String, dynamic>>> conflictOps(String eventId) =>
      LocalDb.instance.conflictOps(eventId);

  static Map<String, String> conflictView(Map<String, dynamic> op) {
    final p = jsonDecode('${op['payload']}') as Map<String, dynamic>;
    final src = (op['action'] == 'UPDATE_GUEST' && p['fields'] is Map)
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
  Future<void> resolveConflict(
      String opId, String catatan) async {
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
    super.dispose();
  }
}
