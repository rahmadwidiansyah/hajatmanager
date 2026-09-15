import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../../core/api_client.dart';
import '../../core/app_config.dart';
import '../../core/app_theme.dart';
import '../../core/auth_store.dart';
import '../../core/exporter.dart';
import '../../core/format_rp.dart';
import '../../core/local_db.dart';
import '../../core/name_rules.dart';
import '../../core/sync_engine.dart';
import '../../models/models.dart';
import '../../widgets/app_widgets.dart';
import '../../widgets/pending_badge.dart';
import '../event_settings/event_settings_screen.dart';
import '../log/log_screen.dart';

// BARANG & CASH disembunyikan sesuai permintaan (server tetap menerima data lama).
const methodes = ['AMPLOP', 'QRIS', 'TRANSFER'];

/// Detail acara — 3 tab M3: Input satset | Buku Tamu | Rekap.
/// Semua tulis lokal dulu, push best-effort.
class EventDetailScreen extends StatefulWidget {
  final EventModel event;
  const EventDetailScreen({super.key, required this.event});
  @override
  State<EventDetailScreen> createState() => _EventDetailScreenState();
}

class _EventDetailScreenState extends State<EventDetailScreen>
    with SingleTickerProviderStateMixin {
  late TabController tab;
  // input
  final namaC = TextEditingController();
  final alamatC = TextEditingController();
  final nominalC = TextEditingController();
  final catatanC = TextEditingController();
  String metode = 'AMPLOP';
  List<Map<String, dynamic>> suggest = [];
  List<String> alamatTop = [];
  List<int> nominalTop = [];
  List<Map<String, dynamic>> guests = [];
  List<Map<String, dynamic>> books = [];
  Map<String, dynamic>? rekap;
  int pending = 0;
  bool saving = false;
  String bookQ = '';
  List<Map<String, dynamic>> conflicts = [];
  List<String> mejaList = ['MEJA-1', 'MEJA-2'];
  String mejaSelected = 'MEJA-1';
  bool get canEdit =>
      widget.event.myRole == 'OWNER' || widget.event.myRole == 'ADMIN';
  // Anti-double: token jalan + sidik payload terakhir (abaikan kirim ulang <3 dtk).
  int _saveToken = 0;
  String _lastSig = '';
  int _lastAt = 0;

  @override
  void initState() {
    super.initState();
    tab = TabController(length: 3, vsync: this);
    if (widget.event.mejaList.isNotEmpty) {
      mejaList = [...widget.event.mejaList];
      mejaSelected = mejaList.first;
    }
    _initMeja();
    _refreshAll();
    SyncEngine.instance.addListener(_onSync);
  }

  Future<void> _initMeja() async {
    final saved = await AppConfig.getMejaFor(widget.event.id);
    if (!mounted) return;
    setState(() {
      if (saved != null && mejaList.contains(saved)) {
        mejaSelected = saved;
      } else {
        mejaSelected = mejaList.first;
      }
    });
  }

  /// Tarik mejaList terbaru dari server (best-effort).
  Future<void> _loadMeja() async {
    try {
      final dio = await ApiClient.instance.dio();
      final r = await dio.get('/api/events/${widget.event.id}');
      final j = Map<String, dynamic>.from(r.data as Map);
      final ml =
          (j['mejaList'] as List?)?.map((e) => '$e').toList();
      if (ml != null && ml.isNotEmpty && mounted) {
        setState(() {
          mejaList = ml;
          if (!mejaList.contains(mejaSelected)) {
            mejaSelected = mejaList.first;
          }
        });
      }
    } catch (_) {}
  }

  /// Tambah meja baru (OWNER/ADMIN → PATCH server, else lokal sesi).
  Future<void> _addMeja() async {
    final c = TextEditingController();
    final v = await showDialog<String>(
        context: context,
        builder: (_) => AlertDialog(
              title: const Text('Meja baru'),
              content: TextField(
                  controller: c,
                  textCapitalization:
                      TextCapitalization.characters,
                  autofocus: true,
                  decoration: const InputDecoration(
                      labelText: 'Label (mis. MEJA-3)',
                      border: OutlineInputBorder(),
                      filled: true)),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Batal')),
                FilledButton(
                    onPressed: () =>
                        Navigator.pop(context, c.text.trim().toUpperCase()),
                    child: const Text('Tambah')),
              ],
            ));
    if (v == null || v.isEmpty) return;
    if (mejaList.length >= 10) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Maksimal 10 meja')));
      }
      return;
    }
    if (mejaList.contains(v)) {
      setState(() => mejaSelected = v);
      await AppConfig.setMejaFor(widget.event.id, v);
      return;
    }
    final next = [...mejaList, v];
    if (canEdit) {
      try {
        final dio = await ApiClient.instance.dio();
        await dio.patch('/api/events/${widget.event.id}',
            data: {'mejaList': next});
      } catch (_) {
        await LocalDb.instance.enqueue(widget.event.id,
            'UPDATE_EVENT', 'events', {
          'id': widget.event.id,
          'fields': {'mejaList': next}
        });
      }
    }
    if (!mounted) return;
    setState(() {
      mejaList = next;
      mejaSelected = v;
    });
    await AppConfig.setMejaFor(widget.event.id, v);
  }

  @override
  void dispose() {
    SyncEngine.instance.removeListener(_onSync);
    tab.dispose();
    super.dispose();
  }

  void _onSync() {
    final c =
        SyncEngine.instance.pendingByEvent[widget.event.id] ?? pending;
    if (mounted && c != pending) setState(() => pending = c);
  }

  Future<void> _refreshAll() async {
    await _loadLocal();
    await _pullServer();
    await _loadLocal();
    await _loadMeja();
    pending = await SyncEngine.instance.pending(widget.event.id);
    conflicts =
        await SyncEngine.instance.conflictOps(widget.event.id);
    if (mounted) setState(() {});
  }

  Future<void> _loadLocal() async {
    guests = await LocalDb.instance.guestsLocal(widget.event.id);
    books = await LocalDb.instance.booksLocal(widget.event.id);
    _recalcTops();
    _recalcRekap();
    if (mounted) setState(() {});
  }

  void _recalcTops() {
    final aCount = <String, int>{};
    final nCount = <int, int>{};
    for (final g in guests) {
      final a = '${g['alamat']}';
      aCount[a] = (aCount[a] ?? 0) + 1;
      final n = (g['nominal'] as int?) ?? 0;
      if (n > 0) nCount[n] = (nCount[n] ?? 0) + 1;
    }
    final as = aCount.entries.toList()
      ..sort((x, y) => y.value.compareTo(x.value));
    final ns = nCount.entries.toList()
      ..sort((x, y) => y.value.compareTo(x.value));
    alamatTop = as.take(4).map((e) => e.key).toList();
    nominalTop = ns.take(4).map((e) => e.key).toList();
  }

  void _recalcRekap() {
    int total = 0;
    final perAlamat = <String, Map<String, int>>{};
    final perMetode = <String, Map<String, int>>{};
    for (final g in guests) {
      final n = (g['nominal'] as int?) ?? 0;
      total += n;
      final a = '${g['alamat']}';
      perAlamat[a] = {
        'jumlah': ((perAlamat[a]?['jumlah']) ?? 0) + 1,
        'total': ((perAlamat[a]?['total']) ?? 0) + n,
      };
      final m = '${g['metode']}';
      perMetode[m] = {
        'jumlah': ((perMetode[m]?['jumlah']) ?? 0) + 1,
        'total': ((perMetode[m]?['total']) ?? 0) + n,
      };
    }
    rekap = {
      'totalTamu': guests.length,
      'totalNominal': total,
      'perAlamat': perAlamat.entries
          .map((e) => {'alamat': e.key, ...e.value})
          .toList(),
      'perMetode': perMetode.entries
          .map((e) => {'metode': e.key, ...e.value})
          .toList(),
    };
  }

  Future<void> _pullServer() async {
    try {
      final dio = await ApiClient.instance.dio();
      final since =
          await LocalDb.instance.getMeta('lastPull:${widget.event.id}') ?? '';
      final r = await dio.get('/api/sync/pull', queryParameters: {
        'eventId': widget.event.id,
        if (since.isNotEmpty) 'since': since,
      });
      final j = Map<String, dynamic>.from(r.data as Map);
      final g = (j['guests'] as List? ?? []);
      final b = (j['guestBooks'] as List? ?? []);
      if (since.isEmpty) {
        // Pull penuh pertama: replace agar bersih dari sisa event lain.
        if (g.isNotEmpty) {
          await LocalDb.instance.putGuests(widget.event.id, g);
        }
        if (b.isNotEmpty) {
          await LocalDb.instance.putBooks(widget.event.id, b);
        }
      } else {
        // Pull delta: merge agar data baru dari web muncul di APK.
        await LocalDb.instance.mergeGuests(widget.event.id, g);
        await LocalDb.instance.mergeBooks(widget.event.id, b);
      }
      await LocalDb.instance.setMeta(
          'lastPull:${widget.event.id}', '${j['pulledAt'] ?? ''}');
      // shortcuts server (best-effort, merge)
      try {
        final s = await dio
            .get('/api/events/${widget.event.id}/guests/shortcuts');
        final sj = Map<String, dynamic>.from(s.data as Map);
        final at = (sj['alamatTop'] as List? ?? [])
            .map((e) => '${(e as Map)['alamat']}')
            .toList();
        final nt = (sj['nominalTop'] as List? ?? [])
            .map((e) => ((e as Map)['nominal'] as num).toInt())
            .toList();
        if (at.isNotEmpty) alamatTop = at.take(4).toList();
        if (nt.isNotEmpty) nominalTop = nt.take(4).toList();
      } catch (_) {}
    } catch (_) {}
  }

  Future<void> _onNamaChanged(String q) async {
    if (q.trim().length < 2) {
      setState(() => suggest = []);
      return;
    }
    // 1) lokal dulu (cepat)
    final local = books
        .where((b) =>
            '${b['nama']}'.toLowerCase().contains(q.toLowerCase()))
        .take(6)
        .toList();
    setState(() => suggest = local);
    // 2) server suggest (hanya yg belum tercatat)
    try {
      final dio = await ApiClient.instance.dio();
      final r = await dio.get(
          '/api/events/${widget.event.id}/guests/suggest',
          queryParameters: {'q': q});
      final list = (r.data as List? ?? []).cast<Map<String, dynamic>>();
      if (mounted && list.isNotEmpty) setState(() => suggest = list);
    } catch (_) {}
  }

  Future<void> _saveGuest() async {
    // Kapital tiap awal kata + validasi huruf saja (tanpa angka/simbol).
    final nama = capitalizeWords(namaC.text);
    final alamat = alamatC.text.trim().replaceAll(RegExp(r'\s+'), ' ');
    final nominal = parseNominal(nominalC.text);
    if (!isValidNama(nama)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Nama hanya boleh huruf (min 2), tanpa angka/simbol')));
      return;
    }
    if (alamat.length < 2 || nominal <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Lengkapi alamat (min 2) dan nominal > 0')));
      return;
    }
    // Cegah double-tap: tolak bila masih menyimpan atau payload sama <3 dtk.
    final sig =
        '${widget.event.id}|$nama|$alamat|$nominal|$metode|${catatanC.text.trim()}';
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    if (saving || (sig == _lastSig && nowMs - _lastAt < 3000)) return;
    final token = ++_saveToken;
    _lastSig = sig;
    _lastAt = nowMs;
    setState(() => saving = true);
    try {
      final user = await AuthStore.cachedUser();
      final deviceId = await AppConfig.getDeviceId();
      final meja = mejaSelected;
      final id = 'gst-${const Uuid().v4()}';
      final now = DateTime.now().toIso8601String();
      final payload = {
        'id': id,
        'eventId': widget.event.id,
        'nama': nama,
        'alamat': alamat,
        'nominal': nominal,
        'metode': metode,
        'catatan': catatanC.text.trim().isEmpty ? null : catatanC.text.trim(),
        'petugasId': '${user?['id'] ?? 'lokal'}',
        'mejaLabel': meja,
        'deviceId': deviceId,
        'createdAt': now,
        'updatedAt': now,
      };
      // 1) tulis lokal (langsung kelihatan)
      final db = await LocalDb.instance.db();
      await db.insert('guests', {
        'id': id,
        'eventId': widget.event.id,
        'guestBookId': null,
        'nama': nama,
        'alamat': alamat,
        'nominal': nominal,
        'metode': metode,
        'catatan': payload['catatan'],
        'petugasId': payload['petugasId'],
        'mejaLabel': meja,
        'deviceId': deviceId,
        'createdAt': now,
        'updatedAt': now,
      });
      await LocalDb.instance
          .enqueue(widget.event.id, 'CREATE_GUEST', 'guests', payload, id: id);
      // 2) coba push langsung
      String? err;
      try {
        final dio = await ApiClient.instance.dio();
        final r = await dio.post('/api/events/${widget.event.id}/guests',
            data: {
              'nama': nama,
              'alamat': alamat,
              'nominal': nominal,
              'metode': metode,
              if (payload['catatan'] != null) 'catatan': payload['catatan'],
            });
        if (r.statusCode == 201) {
          await LocalDb.instance.outboxRemove([id]);
        }
      } on DioException catch (e) {
        if (e.response?.statusCode == 409) {
          err =
              'Duplikat nama+alamat — tambah catatan penanda lalu simpan ulang (tetap antre lokal).';
        } else if (e.type == DioExceptionType.connectionError ||
            e.type == DioExceptionType.connectionTimeout) {
          err = null; // offline murni -> antre diam-diam
        } else {
          err = 'Tersimpan lokal, sync tertunda (${e.response?.statusCode ?? 'offline'})';
        }
      }
      namaC.clear();
      nominalC.clear();
      catatanC.clear();
      setState(() => suggest = []);
      await _loadLocal();
      await SyncEngine.instance.pending(widget.event.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(err ??
                (pending == 0
                    ? 'Tersimpan & tersinkron ✓'
                    : 'Tersimpan lokal, antre sync'))));
      }
    } finally {
      // Hanya pemegang token terakhir yang boleh membuka kunci tombol.
      if (mounted && token == _saveToken) {
        setState(() => saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.event.namaAcara,
            overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            tooltip: 'Log aktivitas',
            icon: const Icon(Icons.history_outlined),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => LogScreen(
                    eventId: widget.event.id,
                    eventName: widget.event.namaAcara))),
          ),
          IconButton(
            tooltip: 'Pengaturan acara',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.of(context)
                .push(MaterialPageRoute(
                    builder: (_) =>
                        EventSettingsScreen(event: widget.event)))
                .then((v) {
              if (v == true && context.mounted) {
                // ignore: use_build_context_synchronously
                Navigator.of(context).pop(true);
              }
              _refreshAll();
            }),
          ),
          ListenableBuilder(
            listenable: SyncEngine.instance,
            builder: (context, _) => SyncBadge(
              pending: SyncEngine.instance
                      .pendingByEvent[widget.event.id] ??
                  pending,
              onTap: () async {
                final (f, c, e) =
                    await SyncEngine.instance.flush(widget.event.id);
                await _refreshAll();
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text(e == null
                          ? 'Sync: $f terkirim, $c konflik'
                          : 'Sync tertunda ($e) — data aman di lokal')));
                }
              },
            ),
          ),
        ],
        bottom: TabBar(controller: tab, tabs: const [
          Tab(icon: Icon(Icons.bolt_outlined), text: 'Input'),
          Tab(icon: Icon(Icons.book_outlined), text: 'Buku Tamu'),
          Tab(icon: Icon(Icons.bar_chart_outlined), text: 'Rekap'),
        ]),
      ),
      body: TabBarView(controller: tab, children: [
        _inputTab(),
        _booksTab(),
        _rekapTab(),
      ]),
    );
  }

  Widget _inputTab() => ListView(padding: const EdgeInsets.all(16), children: [
        if (conflicts.isNotEmpty)
          Card(
            color: Theme.of(context).colorScheme.errorContainer,
            child: ListTile(
              leading: Icon(Icons.warning_amber_outlined,
                  color: Theme.of(context).colorScheme.onErrorContainer),
              title: Text('${conflicts.length} butuh catatan',
                  style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: Theme.of(context)
                          .colorScheme
                          .onErrorContainer)),
              subtitle: Text('Duplikat nama+alamat — tambah penanda.',
                  style: TextStyle(
                      color: Theme.of(context)
                          .colorScheme
                          .onErrorContainer)),
              trailing: FilledButton.tonal(
                onPressed: _conflictSheet,
                child: const Text('Atasi'),
              ),
            ),
          ),
        if (conflicts.isNotEmpty) const SizedBox(height: 12),
        // Meja kasir: bar kompak paling atas, selalu terlihat.
        Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: 12, vertical: 8),
            child: Row(children: [
              Icon(Icons.table_restaurant_outlined,
                  color: Theme.of(context).colorScheme.primary),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: mejaList.contains(mejaSelected)
                      ? mejaSelected
                      : mejaList.first,
                  items: mejaList
                      .map((x) => DropdownMenuItem(
                          value: x,
                          child: Text('Kasir • $x',
                              style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600))))
                      .toList(),
                  onChanged: (v) async {
                    if (v != null) {
                      setState(() => mejaSelected = v);
                      await AppConfig.setMejaFor(
                          widget.event.id, v);
                    }
                  },
                  decoration: const InputDecoration(
                      border: InputBorder.none,
                      isDense: true),
                ),
              ),
              if (canEdit)
                IconButton(
                  tooltip: 'Tambah meja',
                  icon: const Icon(Icons.add_business_outlined),
                  onPressed: _addMeja,
                ),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Siapa yang memberi?',
                  style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 12),
              TextField(
                controller: namaC,
                onChanged: _onNamaChanged,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                    labelText: 'Nama (huruf saja)',
                    helperText: 'Ketik 2 huruf untuk suggest • tanpa angka/simbol',
                    border: OutlineInputBorder(),
                    filled: true,
                    prefixIcon: Icon(Icons.person_search_outlined)),
              ),
        if (suggest.isNotEmpty)
          Card(
            color: Theme.of(context).colorScheme.surfaceContainerLow,
            child: Column(
                children: suggest
                    .map((s) => ListTile(
                          dense: true,
                          leading: CircleAvatar(
                            radius: 14,
                            child: Text(
                                '${s['nama']}'.isNotEmpty
                                    ? '${s['nama']}'.substring(0, 1).toUpperCase()
                                    : '?',
                                style: const TextStyle(fontSize: 12)),
                          ),
                          title: Text('${s['nama']}'),
                          subtitle: Text('${s['alamat'] ?? ''}'),
                          trailing: const Icon(Icons.north_west, size: 16),
                          onTap: () {
                            namaC.text = '${s['nama']}';
                            alamatC.text = '${s['alamat'] ?? ''}';
                            setState(() => suggest = []);
                          },
                        ))
                    .toList()),
          ),
        const SizedBox(height: 12),
        TextField(
            controller: alamatC,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
                labelText: 'Alamat / Desa',
                border: OutlineInputBorder(),
                filled: true,
                prefixIcon: Icon(Icons.home_outlined))),
        if (alamatTop.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
              spacing: 8,
              children: alamatTop
                  .map((a) => ActionChip(
                      label: Text(a),
                      onPressed: () => setState(() => alamatC.text = a)))
                  .toList()),
        ],
            ]),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Nominal & metode',
                  style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 12),
              TextField(
                  controller: nominalC,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                      labelText: 'Nominal (Rp)',
                      border: OutlineInputBorder(),
                      filled: true,
                      prefixIcon: Icon(Icons.payments_outlined))),
              if (nominalTop.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                    spacing: 8,
                    children: nominalTop
                        .map((n) => ActionChip(
                            label: Text(formatRp(n)),
                            onPressed: () =>
                                setState(() => nominalC.text = '$n')))
                        .toList()),
              ],
              const SizedBox(height: 12),
              Text('Metode', style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: methodes.map((m) {
                  final scheme = Theme.of(context).colorScheme;
                  final b = Theme.of(context).brightness;
                  final selected = metode == m;
                  final (bg, fg) =
                      AppColors.methodChip(m, scheme);
                  return ChoiceChip(
                    label: Text(m,
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: selected
                                ? scheme.onPrimary
                                : fg)),
                    avatar: Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: selected
                            ? scheme.onPrimary
                            : AppColors.methodDot(m, scheme, b),
                        shape: BoxShape.circle,
                      ),
                    ),
                    selected: selected,
                    selectedColor: scheme.primary,
                    backgroundColor: bg,
                    side: BorderSide(
                        color: selected
                            ? scheme.primary
                            : scheme.outlineVariant),
                    onSelected: (_) =>
                        setState(() => metode = m),
                  );
                }).toList(),
              ),
              const SizedBox(height: 12),
              TextField(
                  controller: catatanC,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                      labelText: 'Catatan (wajib jika duplikat)',
                      border: OutlineInputBorder(),
                      filled: true,
                      prefixIcon: Icon(Icons.note_outlined))),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: saving ? null : _saveGuest,
          icon: saving
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.save_outlined),
          label: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(saving ? 'Menyimpan...' : 'Simpan (offline-first)')),
        ),
        const SizedBox(height: 16),
        Text('Terakhir di perangkat ini (${guests.length})',
            style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        if (guests.isEmpty)
          const Card(
              child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('Belum ada pemberian tercatat.'))),
        ...guests.take(20).map((g) => Card(
              margin: const EdgeInsets.symmetric(vertical: 4),
              child: ListTile(
                dense: true,
                leading: CircleAvatar(
                    backgroundColor:
                        Theme.of(context).colorScheme.secondaryContainer,
                    child: Text(
                        '${g['nama']}'.isNotEmpty
                            ? '${g['nama']}'.substring(0, 1).toUpperCase()
                            : '?',
                        style: TextStyle(
                            color: Theme.of(context)
                                .colorScheme
                                .onSecondaryContainer))),
                title: Text(
                    '${g['nama']} • ${formatRp((g['nominal'] as int?) ?? 0)}',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text('${g['alamat']}'),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    MethodChip('${g['metode'] ?? 'AMPLOP'}'),
                    if (canEdit)
                      IconButton(
                        tooltip: 'Aksi',
                        icon: const Icon(
                            Icons.more_vert_outlined),
                        onPressed: () => _guestSheet(g),
                      ),
                  ],
                ),
              ),
            )),
      ]);

  Widget _booksTab() {
    final shown = bookQ.trim().isEmpty
        ? books
        : books
            .where((b) =>
                '${b['nama']}'
                    .toLowerCase()
                    .contains(bookQ.toLowerCase()) ||
                '${b['alamat']}'
                    .toLowerCase()
                    .contains(bookQ.toLowerCase()))
            .toList();
    return Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: Row(children: [
            Expanded(
                child: FilledButton.icon(
                    onPressed: _addBookDialog,
                    icon: const Icon(Icons.add),
                    label: const Text('Tamu'))),
            const SizedBox(width: 8),
            Expanded(
                child: OutlinedButton.icon(
                    onPressed: () async {
                      await SyncEngine.instance.flush(widget.event.id);
                      await _refreshAll();
                    },
                    icon: const Icon(Icons.cloud_upload_outlined),
                    label: const Text('Sync'))),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
          child: TextField(
              onChanged: (v) => setState(() => bookQ = v),
              decoration: InputDecoration(
                  hintText: 'Cari buku tamu… (${books.length})',
                  border: const OutlineInputBorder(),
                  filled: true,
                  isDense: true,
                  prefixIcon: const Icon(Icons.search_outlined))),
        ),
        Expanded(
          child: shown.isEmpty
              ? EmptyState(
                  icon: Icons.menu_book_outlined,
                  title: books.isEmpty
                      ? 'Buku tamu kosong'
                      : 'Tidak ketemu “$bookQ”',
                  subtitle: books.isEmpty
                      ? 'Tambah manual atau tarik Sync untuk data dari web.'
                      : 'Coba kata kunci lain.',
                  action: books.isEmpty
                      ? FilledButton.icon(
                          onPressed: _addBookDialog,
                          icon: const Icon(Icons.person_add_outlined),
                          label: const Text('Tambah tamu pertama'),
                        )
                      : null,
                )
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                  itemCount: shown.length,
                  itemBuilder: (_, i) {
                    final b = shown[i];
                    final nm = '${b['nama']}';
                    return Card(
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      child: ListTile(
                        dense: true,
                        leading: CircleAvatar(
                            child: Text(nm.isNotEmpty
                                ? nm.substring(0, 1).toUpperCase()
                                : '?')),
                        title: Text(nm,
                            style:
                                const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text('${b['alamat']}'),
                        trailing: canEdit
                            ? IconButton(
                                tooltip: 'Aksi',
                                icon: const Icon(
                                    Icons.more_vert_outlined),
                                onPressed: () => _bookSheet(b),
                              )
                            : null,
                      ),
                    );
                  },
                ),
        ),
      ]);
  }

  Future<void> _addBookDialog() async {
    final n = TextEditingController();
    final a = TextEditingController();
    final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
              title: const Text('Buku tamu baru'),
              content: Column(mainAxisSize: MainAxisSize.min, children: [
                TextField(
                    controller: n,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                        labelText: 'Nama (huruf saja)',
                        helperText: 'Tanpa angka/simbol')),
                TextField(
                    controller: a,
                    textCapitalization: TextCapitalization.words,
                    decoration:
                        const InputDecoration(labelText: 'Alamat')),
              ]),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Batal')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Simpan')),
              ],
            ));
    final nama = capitalizeWords(n.text);
    if (ok != true || !isValidNama(nama)) {
      if (ok == true && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content:
                Text('Nama hanya boleh huruf (min 2), tanpa angka/simbol')));
      }
      return;
    }
    final id = 'bk-${const Uuid().v4()}';
    final payload = {
      'id': id,
      'eventId': widget.event.id,
      'nama': nama,
      'alamat': a.text.trim().isEmpty
          ? '-'
          : capitalizeWords(a.text),
      'createdAt': DateTime.now().toIso8601String(),
    };
    final db = await LocalDb.instance.db();
    await db.insert('guest_books', {
      'id': id,
      'eventId': widget.event.id,
      'nama': payload['nama'],
      'alamat': payload['alamat'],
      'createdAt': payload['createdAt'],
    });
    await LocalDb.instance
        .enqueue(widget.event.id, 'CREATE_BOOK', 'guest_books', payload, id: id);
    try {
      final dio = await ApiClient.instance.dio();
      await dio.post('/api/events/${widget.event.id}/guestbooks',
          data: {'nama': payload['nama'], 'alamat': payload['alamat']});
      await LocalDb.instance.outboxRemove([id]);
    } catch (_) {}
    await _refreshAll();
  }

  /// Bottom-sheet daftar konflik duplikat → isi catatan / buang.
  Future<void> _conflictSheet() async {
    await showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            Text('Butuh catatan (${conflicts.length})',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ...conflicts.map((op) {
              final v = SyncEngine.conflictView(op);
              return Card(
                margin: const EdgeInsets.symmetric(vertical: 4),
                child: ListTile(
                  title: Text('${v['nama']} • ${v['alamat']}',
                      style:
                          const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle:
                      Text('${v['nominal']} • ${v['metode']}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.pop(context);
                    _resolveDialog('${op['id']}', v);
                  },
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  Future<void> _resolveDialog(
      String opId, Map<String, String> v) async {
    final c = TextEditingController();
    final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
              title: const Text('Tambah catatan penanda'),
              content: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${v['nama']} • ${v['alamat']}'),
                    const SizedBox(height: 8),
                    TextField(
                        controller: c,
                        textCapitalization:
                            TextCapitalization.sentences,
                        autofocus: true,
                        decoration: const InputDecoration(
                            labelText: 'Catatan (mis. “anak Pak RT”)',
                            border: OutlineInputBorder(),
                            filled: true)),
                  ]),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Nanti')),
                TextButton(
                    onPressed: () => Navigator.pop(context, null),
                    child: Text('Buang',
                        style: TextStyle(
                            color: Theme.of(context)
                                .colorScheme
                                .error))),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Kirim')),
              ],
            ));
    if (ok == null) {
      // Buang: hapus op + baris lokal bila create.
      await SyncEngine.instance
          .discardOp(widget.event.id, opId);
      await LocalDb.instance.deleteGuestLocal(opId);
      await _refreshAll();
      return;
    }
    if (ok != true) return;
    if (c.text.trim().isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Catatan wajib untuk bedakan duplikat')));
      }
      return;
    }
    await SyncEngine.instance
        .resolveConflict(opId, c.text.trim());
    await SyncEngine.instance.flush(widget.event.id);
    await _refreshAll();
  }

  /// Bottom-sheet aksi satu pemberian.
  Future<void> _guestSheet(Map<String, dynamic> g) async {
    final id = '${g['id']}';
    await showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: CircleAvatar(
                child: Text('${g['nama']}'.isNotEmpty
                    ? '${g['nama']}'.substring(0, 1).toUpperCase()
                    : '?')),
            title: Text('${g['nama']}',
                style:
                    const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(
                '${g['alamat']} • ${formatRp((g['nominal'] as int?) ?? 0)}'),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.note_add_outlined),
            title: const Text('Tambah / ubah catatan'),
            onTap: () {
              Navigator.pop(context);
              _noteDialog(id, '${g['catatan'] ?? ''}');
            },
          ),
          ListTile(
            leading: const Icon(Icons.edit_outlined),
            title: const Text('Edit data'),
            onTap: () {
              Navigator.pop(context);
              _editGuestDialog(g);
            },
          ),
          ListTile(
            leading: Icon(Icons.delete_outline,
                color: Theme.of(context).colorScheme.error),
            title: Text('Hapus',
                style: TextStyle(
                    color: Theme.of(context).colorScheme.error)),
            onTap: () {
              Navigator.pop(context);
              _deleteGuest(id, '${g['nama']}');
            },
          ),
          const SizedBox(height: 8),
        ]),
      ),
    );
  }

  Future<void> _noteDialog(String id, String current) async {
    final c = TextEditingController(text: current);
    final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
              title: const Text('Catatan pemberian'),
              content: TextField(
                  controller: c,
                  textCapitalization:
                      TextCapitalization.sentences,
                  autofocus: true,
                  maxLength: 200,
                  maxLines: 2,
                  decoration: const InputDecoration(
                      border: OutlineInputBorder(), filled: true)),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Batal')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Simpan')),
              ],
            ));
    if (ok != true) return;
    await _pushGuestEdit(id, {'catatan': c.text.trim()});
  }

  Future<void> _editGuestDialog(Map<String, dynamic> g) async {
    final id = '${g['id']}';
    final n = TextEditingController(text: '${g['nama']}');
    final a = TextEditingController(text: '${g['alamat']}');
    final nom =
        TextEditingController(text: '${g['nominal'] ?? ''}');
    final cat = TextEditingController(text: '${g['catatan'] ?? ''}');
    String m = '${g['metode'] ?? 'AMPLOP'}';
    if (!methodes.contains(m)) m = 'AMPLOP';
    final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => StatefulBuilder(
              builder: (ctx, setS) => AlertDialog(
                title: const Text('Edit pemberian'),
                content: SingleChildScrollView(
                  child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        TextField(
                            controller: n,
                            textCapitalization:
                                TextCapitalization.words,
                            decoration: const InputDecoration(
                                labelText: 'Nama (huruf saja)')),
                        TextField(
                            controller: a,
                            textCapitalization:
                                TextCapitalization.words,
                            decoration: const InputDecoration(
                                labelText: 'Alamat')),
                        TextField(
                            controller: nom,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                                labelText: 'Nominal')),
                        const SizedBox(height: 8),
                        DropdownButtonFormField<String>(
                          initialValue: m,
                          items: methodes
                              .map((x) => DropdownMenuItem(
                                  value: x,
                                  child: Text(x)))
                              .toList(),
                          onChanged: (v) {
                            if (v != null) setS(() => m = v);
                          },
                          decoration: const InputDecoration(
                              labelText: 'Metode'),
                        ),
                        TextField(
                            controller: cat,
                            textCapitalization:
                                TextCapitalization.sentences,
                            decoration: const InputDecoration(
                                labelText: 'Catatan')),
                      ]),
                ),
                actions: [
                  TextButton(
                      onPressed: () =>
                          Navigator.pop(context, false),
                      child: const Text('Batal')),
                  FilledButton(
                      onPressed: () =>
                          Navigator.pop(context, true),
                      child: const Text('Simpan')),
                ],
              ),
            ));
    if (ok != true) return;
    final nama = capitalizeWords(n.text);
    if (!isValidNama(nama)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content: Text(
                    'Nama hanya boleh huruf, tanpa angka/simbol')));
      }
      return;
    }
    await _pushGuestEdit(id, {
      'nama': nama,
      'alamat': a.text.trim(),
      'nominal': parseNominal(nom.text),
      'metode': m,
      'catatan': cat.text.trim().isEmpty ? null : cat.text.trim(),
    });
  }

  /// Optimistic update lokal + antre UPDATE + coba PATCH langsung.
  Future<void> _pushGuestEdit(
      String id, Map<String, dynamic> fields) async {
    await LocalDb.instance.updateGuestLocal(id, fields);
    await LocalDb.instance.enqueue(widget.event.id, 'UPDATE_GUEST',
        'guests', {'id': id, 'fields': fields});
    try {
      final dio = await ApiClient.instance.dio();
      final r =
          await dio.patch('/api/guests/$id', data: fields);
      if (r.statusCode == 200) {
        final ops =
            await LocalDb.instance.outboxList(widget.event.id);
        await LocalDb.instance.outboxRemove(ops
            .where((o) =>
                o['action'] == 'UPDATE_GUEST' &&
                jsonPayloadId(o) == id)
            .map((o) => '${o['id']}')
            .toList());
      }
    } catch (_) {}
    await _refreshAll();
  }

  String jsonPayloadId(Map<String, dynamic> o) {
    try {
      final p = (o['payload'] as String?) ?? '{}';
      final m = RegExp(r'"id"\s*:\s*"([^"]+)"').firstMatch(p);
      return m?.group(1) ?? '${o['id']}';
    } catch (_) {
      return '${o['id']}';
    }
  }

  Future<void> _deleteGuest(String id, String nama) async {
    final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
              title: const Text('Hapus pemberian?'),
              content: Text('$nama akan dihapus dari perangkat & server.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Batal')),
                FilledButton(
                    style: FilledButton.styleFrom(
                        backgroundColor:
                            Theme.of(context).colorScheme.error,
                        foregroundColor: Theme.of(context)
                            .colorScheme
                            .onError),
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Hapus')),
              ],
            ));
    if (ok != true) return;
    await LocalDb.instance.deleteGuestLocal(id);
    await LocalDb.instance.enqueue(widget.event.id, 'DELETE_GUEST',
        'guests', {'id': id});
    try {
      final dio = await ApiClient.instance.dio();
      await dio.delete('/api/guests/$id');
      final ops =
          await LocalDb.instance.outboxList(widget.event.id);
      await LocalDb.instance.outboxRemove(ops
          .where((o) =>
              o['action'] == 'DELETE_GUEST' &&
              jsonPayloadId(o) == id)
          .map((o) => '${o['id']}')
          .toList());
    } catch (_) {}
    await _refreshAll();
  }

  /// Bottom-sheet aksi satu buku tamu.
  Future<void> _bookSheet(Map<String, dynamic> b) async {
    final id = '${b['id']}';
    await showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: const CircleAvatar(
                child: Icon(Icons.menu_book_outlined, size: 20)),
            title: Text('${b['nama']}',
                style:
                    const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text('${b['alamat']}'),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.edit_outlined),
            title: const Text('Edit'),
            onTap: () {
              Navigator.pop(context);
              _editBookDialog(b);
            },
          ),
          ListTile(
            leading: Icon(Icons.delete_outline,
                color: Theme.of(context).colorScheme.error),
            title: Text('Hapus',
                style: TextStyle(
                    color: Theme.of(context).colorScheme.error)),
            onTap: () {
              Navigator.pop(context);
              _deleteBook(id, '${b['nama']}');
            },
          ),
          const SizedBox(height: 8),
        ]),
      ),
    );
  }

  Future<void> _editBookDialog(Map<String, dynamic> b) async {
    final id = '${b['id']}';
    final n = TextEditingController(text: '${b['nama']}');
    final a = TextEditingController(text: '${b['alamat']}');
    final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
              title: const Text('Edit buku tamu'),
              content: Column(mainAxisSize: MainAxisSize.min, children: [
                TextField(
                    controller: n,
                    textCapitalization:
                        TextCapitalization.words,
                    decoration: const InputDecoration(
                        labelText: 'Nama (huruf saja)')),
                TextField(
                    controller: a,
                    textCapitalization:
                        TextCapitalization.words,
                    decoration: const InputDecoration(
                        labelText: 'Alamat')),
              ]),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Batal')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Simpan')),
              ],
            ));
    if (ok != true) return;
    final nama = capitalizeWords(n.text);
    if (!isValidNama(nama)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content: Text(
                    'Nama hanya boleh huruf, tanpa angka/simbol')));
      }
      return;
    }
    final fields = {
      'nama': nama,
      'alamat': a.text.trim().isEmpty ? '-' : capitalizeWords(a.text),
    };
    await LocalDb.instance.updateBookLocal(id, fields);
    await LocalDb.instance.enqueue(widget.event.id, 'UPDATE_BOOK',
        'guest_books', {'id': id, 'fields': fields});
    try {
      final dio = await ApiClient.instance.dio();
      await dio.patch('/api/guestbooks/$id', data: fields);
    } catch (_) {}
    await _refreshAll();
  }

  Future<void> _deleteBook(String id, String nama) async {
    final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
              title: const Text('Hapus buku tamu?'),
              content: Text('$nama akan dihapus dari perangkat & server.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Batal')),
                FilledButton(
                    style: FilledButton.styleFrom(
                        backgroundColor:
                            Theme.of(context).colorScheme.error,
                        foregroundColor: Theme.of(context)
                            .colorScheme
                            .onError),
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Hapus')),
              ],
            ));
    if (ok != true) return;
    await LocalDb.instance.deleteBookLocal(id);
    await LocalDb.instance.enqueue(widget.event.id, 'DELETE_BOOK',
        'guest_books', {'id': id});
    try {
      final dio = await ApiClient.instance.dio();
      await dio.delete('/api/guestbooks/$id');
    } catch (_) {}
    await _refreshAll();
  }

  Widget _rekapTab() {
    final t = rekap;
    if (t == null) return const Center(child: CircularProgressIndicator());
    final perAlamat = (t['perAlamat'] as List).cast<Map>();
    final perMetode = (t['perMetode'] as List).cast<Map>();
    return ListView(padding: const EdgeInsets.all(16), children: [
      Card.filled(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(children: [
            Text('${t['totalTamu']} tamu',
                style: Theme.of(context).textTheme.headlineSmall),
            Text(formatRp(t['totalNominal'] as int),
                style: Theme.of(context)
                    .textTheme
                    .headlineMedium
                    ?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            PendingBadge(eventId: widget.event.id),
          ]),
        ),
      ),
      const SizedBox(height: 12),
      FilledButton.tonalIcon(
        onPressed: () => _exportDialog(),
        icon: const Icon(Icons.ios_share_outlined),
        label: const Text('Export PDF / Excel'),
      ),
      const SizedBox(height: 12),
      Text('Per alamat', style: Theme.of(context).textTheme.titleMedium),
      ...perAlamat.map((e) => Card(
            margin: const EdgeInsets.symmetric(vertical: 4),
            child: ListTile(
              dense: true,
              leading: const Icon(Icons.location_on_outlined),
              title: Text('${e['alamat']}',
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              trailing: Text(
                  '${e['jumlah']} • ${formatRp(e['total'] as int)}'),
            ),
          )),
      const SizedBox(height: 8),
      Text('Per metode', style: Theme.of(context).textTheme.titleMedium),
      ...perMetode.map((e) => Card(
            margin: const EdgeInsets.symmetric(vertical: 4),
            child: ListTile(
              dense: true,
              leading: MethodChip('${e['metode']}'),
              title: Text('${e['jumlah']} tamu',
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              trailing: Text(formatRp(e['total'] as int)),
            ),
          )),
    ]);
  }

  /// Dialog opsi export ala web + unduh/share file beneran (offline OK).
  Future<void> _exportDialog() async {
    var opt = const ExportOptions();
    var busy = '';
    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          title: const Text('Export laporan'),
          content: SingleChildScrollView(
            child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Jenis',
                      style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 6),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(
                          value: 'pemberian',
                          label: Text('Pemberian')),
                      ButtonSegment(
                          value: 'tamu', label: Text('Buku Tamu')),
                    ],
                    selected: {opt.type},
                    onSelectionChanged: (s) => setS(() => opt =
                        ExportOptions(
                            type: s.first,
                            order: opt.order,
                            landscape: opt.landscape)),
                  ),
                  const SizedBox(height: 12),
                  Text('Urutan',
                      style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String>(
                    initialValue: opt.order,
                    items: exportOrderLabels()
                        .entries
                        .map((e) => DropdownMenuItem(
                            value: e.key,
                            child: Text(e.value,
                                style: const TextStyle(
                                    fontSize: 13))))
                        .toList(),
                    onChanged: (v) {
                      if (v != null) {
                        setS(() => opt = ExportOptions(
                            type: opt.type,
                            order: v,
                            landscape: opt.landscape));
                      }
                    },
                    decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        filled: true,
                        isDense: true),
                  ),
                  const SizedBox(height: 12),
                  Text('Orientasi',
                      style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 6),
                  SegmentedButton<bool>(
                    segments: const [
                      ButtonSegment(
                          value: false,
                          icon: Icon(Icons.stay_current_portrait_outlined),
                          label: Text('Tegak')),
                      ButtonSegment(
                          value: true,
                          icon: Icon(Icons.stay_current_landscape_outlined),
                          label: Text('Lebar')),
                    ],
                    selected: {opt.landscape},
                    onSelectionChanged: (s) => setS(() => opt =
                        ExportOptions(
                            type: opt.type,
                            order: opt.order,
                            landscape: s.first)),
                  ),
                  if (pending > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                          '$pending antrean belum sync — export memakai data perangkat. Tarik Sync dulu untuk lengkap.',
                          style: TextStyle(
                              fontSize: 11,
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant)),
                    ),
                  if (busy.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Row(children: [
                        const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                                strokeWidth: 2)),
                        const SizedBox(width: 8),
                        Text(busy,
                            style: const TextStyle(fontSize: 12)),
                      ]),
                    ),
                ]),
          ),
          actions: [
            TextButton(
                onPressed: busy.isNotEmpty
                    ? null
                    : () => Navigator.pop(ctx),
                child: const Text('Tutup')),
            FilledButton.tonalIcon(
              onPressed: busy.isNotEmpty
                  ? null
                  : () async {
                      setS(() => busy = 'Membuat Excel…');
                      try {
                        await _runExport(opt, false);
                        if (ctx.mounted) Navigator.pop(ctx);
                      } finally {
                        if (ctx.mounted) setS(() => busy = '');
                      }
                    },
              icon: const Icon(Icons.table_chart_outlined),
              label: const Text('Excel'),
            ),
            FilledButton.icon(
              onPressed: busy.isNotEmpty
                  ? null
                  : () async {
                      setS(() => busy = 'Membuat PDF…');
                      try {
                        await _runExport(opt, true);
                        if (ctx.mounted) Navigator.pop(ctx);
                      } finally {
                        if (ctx.mounted) setS(() => busy = '');
                      }
                    },
              icon:
                  const Icon(Icons.picture_as_pdf_outlined),
              label: const Text('PDF'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _runExport(ExportOptions opt, bool pdf) async {
    try {
      final rows = await exportRows(widget.event.id, opt);
      if (rows.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                  content: Text('Tidak ada data untuk diexport')));
        }
        return;
      }
      final user = await AuthStore.cachedUser();
      final uname =
          '${user?['name'] ?? user?['email'] ?? '-'}';
      if (pdf) {
        final bytes = await buildExportPdf(
            eventName: widget.event.namaAcara,
            userName: uname,
            opt: opt,
            rows: rows);
        await shareExportFile(bytes.toList(),
            exportFilename(widget.event.namaAcara, opt, 'pdf'),
            'application/pdf');
      } else {
        final bytes = buildExportXlsx(
            eventName: widget.event.namaAcara,
            opt: opt,
            rows: rows);
        if (bytes == null) throw 'gagal membuat excel';
        await shareExportFile(
            bytes,
            exportFilename(widget.event.namaAcara, opt, 'xlsx'),
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Export gagal: $e')));
      }
    }
  }
}
