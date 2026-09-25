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
import '../../widgets/skeleton_list.dart';
import '../../core/window_ui.dart';
import '../account/account_screen.dart';
import '../event_detail/event_detail_screen.dart';

/// Daftar acara — pull dari server saat online, cache SQLite saat offline.
/// FAB: buat acara offline (localOnly) -> antre push.
///
/// v2: skeleton shimmer saat pertama load, data lama tetap tampil saat
/// refetch (tidak ada flash kosong), auto-update saat SyncEngine selesai sync.
class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key});
  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  List<EventModel> items = [];

  // _localLoaded: true setelah _loadLocalCache() pertama selesai.
  // Skeleton hanya muncul saat !_localLoaded && items kosong.
  // Saat refetch, items lama tetap tampil — tidak flash kosong.
  bool _localLoaded = false;

  // _fetching: true saat _load() sedang berjalan ke server.
  // Dipakai untuk spinner kecil di AppBar (bukan replace seluruh list).
  bool _fetching = false;

  String q = '';
  Map<String, dynamic>? user;
  final searchFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    SyncEngine.instance.start();

    // 1) Load cache lokal dulu — instan, tidak perlu internet.
    _loadLocalCache().then((_) {
      // 2) Setelah cache tampil, pull server di background.
      if (mounted) unawaited(_load());
    });

    // 3) Subscribe SyncEngine — setiap kali sync selesai (push+pull),
    //    refresh list dari cache lokal secara silent (data lama tetap tampil).
    SyncEngine.instance.addListener(_onSyncDone);
  }

  @override
  void dispose() {
    SyncEngine.instance.removeListener(_onSyncDone);
    searchFocus.dispose();
    super.dispose();
  }

  /// Dipanggil SyncEngine setelah setiap flush+pull selesai.
  /// Silent refresh: baca cache lokal, update list in-place.
  void _onSyncDone() {
    if (!mounted) return;
    // Hanya reload kalau tidak sedang fetch server (hindari race).
    if (!_fetching) unawaited(_loadLocalCache());
  }

  /// Pull dari server — silent saat items sudah ada (tidak setState loading).
  /// Hanya set loading=true saat items benar-benar kosong (pertama kali).
  Future<void> _load() async {
    // Jangan tampilkan spinner besar kalau sudah ada data lokal.
    // _fetching hanya untuk spinner kecil di AppBar.
    _fetching = true;
    if (mounted) setState(() {});

    user = await AuthStore.cachedUser();
    final myId = '${user?['id'] ?? ''}';
    try {
      final dio = await ApiClient.instance.dio();
      final r = await dio.get('/api/events');
      final list = (r.data as List? ?? []).cast<Map<String, dynamic>>();

      // Simpan ke SQLite lokal.
      await LocalDb.instance.putEvents(list);

      // Hapus event lokal yang sudah tidak ada di server (dihapus/di-kick).
      // Aman untuk acara offline: yang masih antre di outbox dilewati.
      await LocalDb.instance.pruneEventsNotIn(
        list.map((m) => '${m['id']}').toSet(),
      );

      // Bangun list baru dari response server.
      final newItems = <EventModel>[];
      for (final m in list) {
        final ev = EventModel.fromJson(m, myUserId: myId);
        newItems.add(ev);
        await LocalDb.instance.setMyRole(ev.id, ev.myRole);
      }

      // Update state hanya setelah data siap — tidak ada flash kosong.
      if (mounted) {
        setState(() {
          items = newItems;
          _localLoaded = true;
          _fetching = false;
        });
      }
    } catch (_) {
      // Offline atau error server — baca dari cache lokal.
      await _loadLocalCache();
      if (mounted) setState(() => _fetching = false);
    }
  }

  /// Load dari SQLite lokal — instan, tidak butuh internet.
  /// Dipanggil saat init dan setelah sync selesai (silent update).
  Future<void> _loadLocalCache() async {
    user = await AuthStore.cachedUser();
    final myId = '${user?['id'] ?? ''}';
    final rows = await (await LocalDb.instance.db()).query(
      'events',
      orderBy: 'tanggal DESC',
    );
    if (!mounted) return;
    setState(() {
      if (rows.isNotEmpty) {
        items = rows
            .map(
              (m) => EventModel(
                id: '${m['id']}',
                namaAcara: '${m['namaAcara']}',
                namaTuanRumah: m['namaTuanRumah']?.toString(),
                tanggal:
                    DateTime.tryParse('${m['tanggal']}') ?? DateTime.now(),
                lokasi: m['lokasi']?.toString(),
                catatan: m['catatan']?.toString(),
                mejaList: '${m['mejaList'] ?? 'MEJA-1,MEJA-2'}'.split(','),
                myRole: '${m['myRole'] ?? 'VIEWER'}',
              ),
            )
            .toList();
      }
      // Tandai bahwa load lokal pertama sudah selesai — skeleton bisa hilang.
      _localLoaded = true;
    });
    // Sinkronkan myRole dari DB (mungkin sudah diupdate oleh sync).
    if (myId.isNotEmpty) {
      for (final ev in items) {
        final savedRole = await LocalDb.instance
            .getMeta('role:${ev.id}:$myId')
            .catchError((_) => null);
        if (savedRole != null && savedRole != ev.myRole && mounted) {
          // Role diperbarui oleh sync — rebuild dilakukan di setState berikutnya.
        }
      }
    }
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

    // Ctrl+F fokus ke pencarian, Ctrl+N acara baru — standar app desktop.
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyF, control: true): () =>
            searchFocus.requestFocus(),
        const SingleActivator(LogicalKeyboardKey.keyN, control: true): () =>
            _createDialog(),
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Acara Hajatan'),
          actions: [
            // Spinner kecil di AppBar saat fetch berjalan — tidak blok list.
            if (_fetching)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8),
                child: Center(
                  child: SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              ),
            SyncButton(
              onSync: () async {
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
          child: LayoutBuilder(
            builder: (context, cons) {
              final w = cons.maxWidth;
              final side = (w - WindowUi.maxContentWidth) / 2;
              final pad = side > WindowUi.horizontalPadding(w)
                  ? side
                  : WindowUi.horizontalPadding(w);
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
                                  '${items.length} acara',
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
                    child: _buildBody(shown, cols, pad, scheme),
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

  Widget _buildBody(
    List<EventModel> shown,
    int cols,
    double pad,
    ColorScheme scheme,
  ) {
    // Skeleton: hanya saat belum ada data lokal sama sekali (pertama kali buka).
    // Begitu _loadLocalCache() selesai, _localLoaded = true → skeleton hilang.
    if (!_localLoaded && items.isEmpty) {
      return ListView(
        padding: EdgeInsets.fromLTRB(pad, 8, pad, 88),
        children: const [SkeletonList(count: 6, itemHeight: 80)],
      );
    }

    // Empty state — data lokal sudah ada tapi memang kosong / filter kosong.
    if (shown.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: 40),
          EmptyState(
            icon: Icons.celebration_outlined,
            title: items.isEmpty ? 'Belum ada acara' : 'Tidak ketemu "$q"',
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
      );
    }

    // List/grid normal — data lama tetap tampil saat _fetching=true.
    if (cols > 1) {
      return GridView.builder(
        padding: EdgeInsets.fromLTRB(pad, 4, pad, 88),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: cols,
          mainAxisExtent: 104,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
        ),
        itemCount: shown.length,
        itemBuilder: (_, i) => _eventCard(shown[i], scheme, grid: true),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 88),
      itemCount: shown.length,
      itemBuilder: (_, i) => _eventCard(shown[i], scheme),
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
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: 'Nama acara *',
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: tuanC,
                        textCapitalization: TextCapitalization.words,
                        textInputAction: TextInputAction.next,
                        decoration: const InputDecoration(
                          labelText: 'Tuan rumah *',
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: InkWell(
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
                            isDense: true,
                            prefixIcon:
                                Icon(Icons.calendar_month_outlined),
                          ),
                          child: Text(
                            pickedDate == null
                                ? 'Pilih'
                                : '${pickedDate!.day.toString().padLeft(2, '0')}-'
                                      '${pickedDate!.month.toString().padLeft(2, '0')}-'
                                      '${pickedDate!.year}',
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: lokC,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: 'Lokasi',
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: catC,
                  maxLines: 2,
                  minLines: 1,
                  decoration: const InputDecoration(
                    labelText: 'Catatan',
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Jika offline, acara disimpan lokal lalu auto-push saat online.',
                  style: TextStyle(fontSize: 11),
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
    // Simpan lokal + antre — pembuat selalu OWNER.
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
    await LocalDb.instance.enqueue(id, 'CREATE_EVENT', 'events', payload, id: id);

    // Coba push langsung (kalau online).
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
      // Offline — akan dipush via /api/sync/push saat online.
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
