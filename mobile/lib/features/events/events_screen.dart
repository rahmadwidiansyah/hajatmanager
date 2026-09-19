import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import 'dart:async';

import 'package:flutter/services.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/auth_store.dart';
import '../../core/local_db.dart';
import '../../core/sync_engine.dart';
import '../../models/models.dart';
import '../../widgets/app_widgets.dart';
import '../../widgets/pending_badge.dart';
import '../../core/window_ui.dart';
import '../account/account_screen.dart';
import '../event_detail/event_detail_screen.dart';

/// Daftar acara — pull dari server saat online, cache SQLite saat offline.
/// FAB: buat acara offline (localOnly) -> antre push.
class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key});
  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  List<EventModel> items = [];
  bool loading = true;
  String q = '';
  Map<String, dynamic>? user;
  final searchFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    SyncEngine.instance.start();
    _loadLocalCache().then((_) {
      if (mounted) unawaited(_load());
    });
  }

  @override
  void dispose() {
    searchFocus.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (items.isEmpty && mounted) setState(() => loading = true);
    user = await AuthStore.cachedUser();
    final myId = '${user?['id'] ?? ''}';
    try {
      final dio = await ApiClient.instance.dio();
      final r = await dio.get('/api/events');
      final list = (r.data as List? ?? []).cast<Map<String, dynamic>>();
      await LocalDb.instance.putEvents(list);
      items = [];
      for (final m in list) {
        final ev = EventModel.fromJson(m, myUserId: myId);
        items.add(ev);
        await LocalDb.instance.setMyRole(ev.id, ev.myRole);
      }
    } catch (_) {
      // offline -> baca cache
      final db = await LocalDb.instance.db();
      final rows = await db.query('events', orderBy: 'tanggal DESC');
      items = rows
          .map(
            (m) => EventModel(
              id: '${m['id']}',
              namaAcara: '${m['namaAcara']}',
              tanggal: DateTime.tryParse('${m['tanggal']}') ?? DateTime.now(),
              lokasi: m['lokasi']?.toString(),
              catatan: m['catatan']?.toString(),
              mejaList: '${m['mejaList'] ?? 'MEJA-1,MEJA-2'}'.split(','),
              myRole: '${m['myRole'] ?? 'VIEWER'}',
            ),
          )
          .toList();
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _loadLocalCache() async {
    user = await AuthStore.cachedUser();
    final rows = await (await LocalDb.instance.db()).query(
      'events',
      orderBy: 'tanggal DESC',
    );
    if (rows.isEmpty || !mounted) return;
    setState(() {
      items = rows
          .map(
            (m) => EventModel(
              id: '${m['id']}',
              namaAcara: '${m['namaAcara']}',
              tanggal: DateTime.tryParse('${m['tanggal']}') ?? DateTime.now(),
              lokasi: m['lokasi']?.toString(),
              catatan: m['catatan']?.toString(),
              mejaList: '${m['mejaList'] ?? 'MEJA-1,MEJA-2'}'.split(','),
              myRole: '${m['myRole'] ?? 'VIEWER'}',
            ),
          )
          .toList();
      loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final shown = q.trim().isEmpty
        ? items
        : items
              .where(
                (e) =>
                    e.namaAcara.toLowerCase().contains(q.toLowerCase()) ||
                    (e.lokasi ?? '').toLowerCase().contains(q.toLowerCase()),
              )
              .toList();
    // Ctrl+F fokus ke pencarian — standar app desktop.
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyF, control: true): () =>
            searchFocus.requestFocus(),
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Acara Hajatan'),
          actions: [
            SyncStatusBadge(),
            IconButton(
              tooltip: 'Sinkron semua',
              onPressed: () async {
                await SyncEngine.instance.checkNow();
                await SyncEngine.instance.flushAll();
                await _load();
                if (context.mounted) {
                  showTopSnack(
                    context,
                    const SnackBar(
                      content: Text('Sync dicoba — lihat badge antrean'),
                    ),
                  );
                }
              },
              icon: const Icon(Icons.cloud_upload_outlined),
            ),
            IconButton(
              tooltip: 'Akun saya',
              onPressed: () => Navigator.of(context)
                  .push(
                    MaterialPageRoute(builder: (_) => const AccountScreen()),
                  )
                  .then((_) => _load()),
              icon: const Icon(Icons.manage_accounts_outlined),
            ),
          ],
        ),
        body: RefreshIndicator(
          onRefresh: _load,
          // LayoutBuilder agar resize window desktop update kolom live.
          child: LayoutBuilder(
            builder: (context, cons) {
              final w = cons.maxWidth;
              // Pusatkan konten max 1120px di layar lebar (cermin page-shell web).
              final side = (w - WindowUi.maxContentWidth) / 2;
              final pad = side > WindowUi.horizontalPadding(w)
                  ? side
                  : WindowUi.horizontalPadding(w);
              // Tablet portrait (600–899dp): paksa 2 kolom agar tidak
              // selebar HP raksasa; desktop/landscape tetap fluida.
              final cols = WindowUi.isWide(w)
                  ? WindowUi.columnsForWidth(w)
                  : (WindowUi.isMedium(w) ? 2 : 1);
              return Column(
                children: [
                  if (user != null)
                    Padding(
                      padding: EdgeInsets.fromLTRB(pad, 12, pad, 0),
                      child: Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: scheme.primaryContainer,
                            child: Icon(
                              Icons.waving_hand_outlined,
                              color: scheme.onPrimaryContainer,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Halo, ${user!['name'] ?? user!['email'] ?? ''}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                Text(
                                  '${items.length} acara • tarik ke bawah untuk refresh',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  Padding(
                    padding: EdgeInsets.fromLTRB(pad, 12, pad, 4),
                    child: TextField(
                      focusNode: searchFocus,
                      onChanged: (v) => setState(() => q = v),
                      decoration: const InputDecoration(
                        hintText: 'Cari acara / lokasi… (Ctrl+F)',
                        border: OutlineInputBorder(),
                        filled: true,
                        isDense: true,
                        prefixIcon: Icon(Icons.search_outlined),
                      ),
                    ),
                  ),
                  Expanded(
                    child: loading
                        ? const Center(child: CircularProgressIndicator())
                        : shown.isEmpty
                        ? ListView(
                            children: [
                              const SizedBox(height: 40),
                              EmptyState(
                                icon: Icons.celebration_outlined,
                                title: items.isEmpty
                                    ? 'Belum ada acara'
                                    : 'Tidak ketemu “$q”',
                                subtitle: items.isEmpty
                                    ? 'Buat acara pertama via tombol + Acara.'
                                    : 'Coba kata kunci lain.',
                                action: items.isEmpty
                                    ? FilledButton.icon(
                                        onPressed: _createDialog,
                                        icon: const Icon(Icons.add),
                                        label: const Text('Buat acara'),
                                      )
                                    : null,
                              ),
                            ],
                          )
                        : cols > 1
                        // Desktop: grid kartu fluida ala dashboard web.
                        ? GridView.builder(
                            padding: EdgeInsets.fromLTRB(pad, 4, pad, 88),
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: cols,
                                  mainAxisExtent: 104,
                                  crossAxisSpacing: 12,
                                  mainAxisSpacing: 12,
                                ),
                            itemCount: shown.length,
                            itemBuilder: (_, i) =>
                                _eventCard(shown[i], scheme, grid: true),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.fromLTRB(12, 4, 12, 88),
                            itemCount: shown.length,
                            itemBuilder: (_, i) => _eventCard(shown[i], scheme),
                          ),
                  ),
                ],
              );
            },
          ),
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _createDialog,
          icon: const Icon(Icons.add),
          label: const Text('Acara'),
        ),
      ),
    );
  }

  /// Kartu acara — dipakai list HP maupun grid desktop.
  Widget _eventCard(EventModel e, ColorScheme scheme, {bool grid = false}) {
    final tgl = e.tanggal.toLocal().toString().split(' ').first;
    return Card(
      margin: grid ? EdgeInsets.zero : const EdgeInsets.symmetric(vertical: 6),
      child: ListTile(
        leading: Container(
          width: 52,
          padding: const EdgeInsets.symmetric(vertical: 6),
          decoration: BoxDecoration(
            color: scheme.secondaryContainer,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                tgl.split('-').length == 3 ? tgl.split('-')[2] : '•',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: scheme.onSecondaryContainer,
                ),
              ),
              Text(
                tgl.split('-').length == 3 ? tgl.split('-')[1] : '',
                style: TextStyle(
                  fontSize: 11,
                  color: scheme.onSecondaryContainer,
                ),
              ),
            ],
          ),
        ),
        title: Text(
          e.namaAcara,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        subtitle: Text('${e.lokasi ?? '-'} • $tgl'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [RoleChip(e.myRole), const Icon(Icons.chevron_right)],
        ),
        onTap: () => Navigator.of(context)
            .push(
              MaterialPageRoute(builder: (_) => EventDetailScreen(event: e)),
            )
            .then((_) => _load()),
      ),
    );
  }

  Future<void> _createDialog() async {
    final namaC = TextEditingController();
    final tuanC = TextEditingController();
    final lokC = TextEditingController();
    final catC = TextEditingController();
    DateTime? pickedDate;
    bool saving = false;
    final ok = await showWideDialog<bool>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Acara baru'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: namaC,
                  decoration: const InputDecoration(labelText: 'Nama acara *'),
                ),
                TextField(
                  controller: tuanC,
                  decoration: const InputDecoration(labelText: 'Tuan rumah *'),
                ),
                const SizedBox(height: 8),
                InkWell(
                  onTap: () async {
                    final now = DateTime.now();
                    final d = await showDatePicker(
                      context: ctx,
                      initialDate: pickedDate ?? now,
                      firstDate: DateTime(now.year - 5),
                      lastDate: DateTime(now.year + 5),
                    );
                    if (d != null) setD(() => pickedDate = d);
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Tanggal *',
                      border: OutlineInputBorder(),
                      filled: true,
                      prefixIcon: Icon(Icons.calendar_month_outlined),
                    ),
                    child: Text(
                      pickedDate == null
                          ? 'Pilih tanggal'
                          : '${pickedDate!.day.toString().padLeft(2, '0')}-'
                                '${pickedDate!.month.toString().padLeft(2, '0')}-'
                                '${pickedDate!.year}',
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: lokC,
                  decoration: const InputDecoration(labelText: 'Lokasi'),
                ),
                TextField(
                  controller: catC,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: 'Catatan'),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Jika offline, acara disimpan lokal lalu auto-push saat online.',
                  style: TextStyle(fontSize: 12),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Batal'),
            ),
            FilledButton(
              onPressed: saving
                  ? null
                  : () {
                      if (namaC.text.trim().length < 2) {
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          const SnackBar(
                            content: Text('Nama acara minimal 2 huruf'),
                          ),
                        );
                        return;
                      }
                      if (tuanC.text.trim().length < 2) {
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          const SnackBar(
                            content: Text('Nama tuan rumah minimal 2 huruf'),
                          ),
                        );
                        return;
                      }
                      if (pickedDate == null) {
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          const SnackBar(
                            content: Text('Tanggal wajib dipilih'),
                          ),
                        );
                        return;
                      }
                      setD(() => saving = true);
                      Navigator.pop(context, true);
                    },
              child: Text(saving ? 'Menyimpan…' : 'Simpan'),
            ),
          ],
        ),
      ),
    );
    if (ok != true) return;
    final tgl = pickedDate;
    if (tgl == null) return;
    final cat = catC.text.trim();
    final id = 'evt-${const Uuid().v4()}';
    final payload = {
      'id': id,
      'namaAcara': namaC.text.trim(),
      'namaTuanRumah': tuanC.text.trim().isEmpty ? null : tuanC.text.trim(),
      'tanggal': tgl.toIso8601String(),
      'lokasi': lokC.text.trim().isEmpty ? null : lokC.text.trim(),
      'catatan': cat.isEmpty ? null : cat,
      'mejaList': ['MEJA-1', 'MEJA-2'],
    };
    // simpan lokal + antre (semua acara online, offline hanya antrean jaringan).
    // Pembuat selalu OWNER — tulis langsung agar offline pun berstatus benar.
    final db = await LocalDb.instance.db();
    await db.insert('events', {
      'id': id,
      'namaAcara': payload['namaAcara'],
      'namaTuanRumah': payload['namaTuanRumah'],
      'tanggal': payload['tanggal'],
      'lokasi': payload['lokasi'],
      'catatan': payload['catatan'],
      'mejaList': 'MEJA-1,MEJA-2',
      'myRole': 'OWNER',
    });
    await LocalDb.instance.enqueue(
      id,
      'CREATE_EVENT',
      'events',
      payload,
      id: id,
    );
    // coba push langsung (kalau online)
    try {
      final dio = await ApiClient.instance.dio();
      await dio.post(
        '/api/events',
        data: {
          'namaAcara': payload['namaAcara'],
          'namaTuanRumah': payload['namaTuanRumah'],
          'tanggal': payload['tanggal'],
          'lokasi': payload['lokasi'],
          'catatan': payload['catatan'],
        },
      );
      await LocalDb.instance.outboxRemove([id]);
    } on DioException catch (_) {
      // biar antre — akan dipush via /api/sync/push
    }
    await SyncEngine.instance.flush(id);
    await _load();
    if (mounted) {
      showTopSnack(
        context,
        const SnackBar(content: Text('Acara tersimpan (offline-first).')),
      );
    }
  }
}
