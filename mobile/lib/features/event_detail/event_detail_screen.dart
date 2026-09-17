import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:uuid/uuid.dart';
import '../../core/api_client.dart';
import '../../core/app_config.dart';
import '../../core/app_theme.dart';
import '../../core/auth_store.dart';
import '../../core/exporter.dart';
import '../../core/format_rp.dart';
import '../../core/window_ui.dart';
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
  Map<String, int> alamatCount = {};
  Map<int, int> nominalCount = {};
  List<Map<String, dynamic>> members = [];
  String? mejaFilter;
  String? kasirFilter;
  String sortBy = 'Waktu'; // Waktu | Nama | Nominal
  bool sortDesc = true;
  Map<String, dynamic>? liveDup;
  Timer? _dupDebounce;
  List<Map<String, dynamic>> guests = [];
  List<Map<String, dynamic>> books = [];
  Map<String, dynamic>? rekap;
  int pending = 0;
  bool saving = false;
  String bookQ = '';
  String guestQ = '';
  // Limit tampil lokal (ganti pagination server ala web).
  int guestLimit = 20;
  int bookLimit = 50;
  // Sumber kebenaran label pending: id op di outbox (bukan prefix id).
  Set<String> pendingIds = {};
  bool _pendingLoaded = false;
  // Suggest nama: dropdown overlay absolut + navigasi keyboard.
  final namaFocus = FocusNode();
  final alamatFocus = FocusNode();
  final nominalFocus = FocusNode();
  final guestSearchFocus = FocusNode();
  final bookSearchFocus = FocusNode();
  final _namaKey = GlobalKey();
  OverlayEntry? _suggestOverlay;
  Timer? _suggestDebounce;
  int suggestHi = -1;
  bool suggestOpen = false;
  // Highlight keyboard/hover chips nominal ala web (terpisah dari nilai).
  int nominalHi = -1;
  List<Map<String, dynamic>> conflicts = [];
  bool goneServer = false;
  List<String> mejaList = ['MEJA-1', 'MEJA-2'];
  String mejaSelected = 'MEJA-1';
  bool get canEdit =>
      widget.event.myRole == 'OWNER' || widget.event.myRole == 'ADMIN';

  /// VIEWER read-only: tolak aksi tulis di client (server tetap enforce 403).
  /// True = ditolak, hentikan.
  bool denyViewer() {
    if (canEdit) return false;
    showTopSnack(context, const SnackBar(
        content: Text('Mode lihat saja — perlu peran OWNER/ADMIN untuk mengubah')));
    return true;
  }
  // Anti-double: token jalan + sidik payload terakhir (abaikan kirim ulang <3 dtk).
  int _saveToken = 0;
  String _lastSig = '';
  int _lastAt = 0;

  @override
  void initState() {
    super.initState();
    tab = TabController(length: 3, vsync: this);
    namaFocus.onKeyEvent = _onNamaKey;
    nominalFocus.onKeyEvent = _onNominalKey;
    tab.addListener(_onTabChanged);
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

  /// Tarik mejaList + members terbaru dari server (best-effort).
  /// Members dipakai untuk kolom Kasir (nama, bukan ID potong).
  Future<void> _loadMeja() async {
    try {
      final dio = await ApiClient.instance.dio();
      final r = await dio.get('/api/events/${widget.event.id}');
      final j = Map<String, dynamic>.from(r.data as Map);
      final ml =
          (j['mejaList'] as List?)?.map((e) => '$e').toList();
      final mm = (j['members'] as List? ?? [])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      if (!mounted) return;
      setState(() {
        if (ml != null && ml.isNotEmpty) {
          mejaList = ml;
          if (!mejaList.contains(mejaSelected)) {
            mejaSelected = mejaList.first;
          }
        }
        if (mm.isNotEmpty) members = mm;
      });
    } catch (_) {}
  }

  String _kasirName(Map<String, dynamic> g) {
    final pid = '${g['petugasId'] ?? ''}';
    if (pid.isEmpty || pid == 'null') return '—';
    for (final m in members) {
      final u = (m['user'] as Map?) ?? {};
      final uid = '${u['id'] ?? m['userId'] ?? ''}';
      if (uid == pid) {
        final nm = '${u['name'] ?? u['email'] ?? ''}';
        if (nm.isNotEmpty && nm != 'null') return nm;
      }
    }
    if (pid == 'lokal') return 'lokal';
    return pid.length > 6 ? pid.substring(0, 6) : pid;
  }

  /// Tambah meja baru (OWNER/ADMIN → PATCH server, else lokal sesi).
  Future<void> _addMeja() async {
    if (denyViewer()) return;
    final c = TextEditingController();
    final v = await showWideDialog<String>(
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
        showTopSnack(context, 
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

  void _onTabChanged() {
    if (!suggestOpen) return;
    setState(() {
      suggest = [];
      suggestHi = -1;
      suggestOpen = false;
    });
    _hideSuggestOverlay();
  }

  @override
  void dispose() {
    SyncEngine.instance.removeListener(_onSync);
    tab.removeListener(_onTabChanged);
    _suggestDebounce?.cancel();
    _dupDebounce?.cancel();
    _hideSuggestOverlay();
    namaFocus.dispose();
    alamatFocus.dispose();
    nominalFocus.dispose();
    guestSearchFocus.dispose();
    bookSearchFocus.dispose();
    namaC.dispose();
    alamatC.dispose();
    nominalC.dispose();
    catatanC.dispose();
    tab.dispose();
    super.dispose();
  }

  void _onSync() async {
    final c =
        SyncEngine.instance.pendingByEvent[widget.event.id] ?? pending;
    final ids =
        await LocalDb.instance.outboxIds(widget.event.id);
    if (!mounted) return;
    if (c != pending ||
        ids.length != pendingIds.length ||
        !ids.containsAll(pendingIds)) {
      setState(() {
        pending = c;
        pendingIds = ids;
        _pendingLoaded = true;
      });
    }
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
    pendingIds = await LocalDb.instance.outboxIds(widget.event.id);
    _pendingLoaded = true;
    // Bersihkan kembaran lama (bug rekonsiliasi): gst-* yang sudah punya
    // twin id-server identik dan tak lagi antre → hapus sekali jalan.
    final cleaned =
        await LocalDb.instance.dedupeSyncedLocalGuests(widget.event.id);
    if (cleaned > 0) {
      guests = await LocalDb.instance.guestsLocal(widget.event.id);
    }
    _recalcTops();
    _recalcRekap();
    if (mounted) setState(() {});
  }

  void _recalcTops() {
    final aCount = <String, int>{};
    final nCount = <int, int>{};
    for (final g in guests) {
      final a = '${g['alamat']}';
      if (a.isNotEmpty && a != 'null') aCount[a] = (aCount[a] ?? 0) + 1;
      final n = (g['nominal'] as int?) ?? 0;
      if (n > 0) nCount[n] = (nCount[n] ?? 0) + 1;
    }
    final as = aCount.entries.toList()
      ..sort((x, y) => y.value.compareTo(x.value));
    final ns = nCount.entries.toList()
      ..sort((x, y) => y.value.compareTo(x.value));
    alamatTop = as.take(4).map((e) => e.key).toList();
    nominalTop = ns.take(4).map((e) => e.key).toList();
    alamatCount = Map.fromEntries(as.take(4));
    nominalCount = Map.fromEntries(ns.take(4));
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
      // shortcuts server (best-effort, merge + jumlah untuk chips)
      try {
        final s = await dio
            .get('/api/events/${widget.event.id}/guests/shortcuts');
        final sj = Map<String, dynamic>.from(s.data as Map);
        final at = (sj['alamatTop'] as List? ?? [])
            .cast<Map>()
            .toList();
        final nt = (sj['nominalTop'] as List? ?? [])
            .cast<Map>()
            .toList();
        if (at.isNotEmpty) {
          alamatTop = at.take(4).map((e) => '${e['alamat']}').toList();
          alamatCount = {
            for (final e in at.take(4))
              '${e['alamat']}': ((e['jumlah'] as num?)?.toInt() ?? 0),
          };
        }
        if (nt.isNotEmpty) {
          nominalTop = nt
              .take(4)
              .map((e) => ((e['nominal'] as num).toInt()))
              .toList();
          nominalCount = {
            for (final e in nt.take(4))
              ((e['nominal'] as num).toInt()):
                  ((e['jumlah'] as num?)?.toInt() ?? 0),
          };
        }
      } catch (_) {}
    } on DioException catch (e) {
      // Acara dihapus dari web (404) — tandai agar UI tampilkan banner.
      if (e.response?.statusCode == 404 && mounted) {
        setState(() => goneServer = true);
      }
    } catch (_) {}
  }

  void _onNamaChanged(String q) {
    _suggestDebounce?.cancel();
    _scheduleDupCheck();
    if (q.trim().length < 2) {
      if (mounted) {
        setState(() {
          suggest = [];
          suggestHi = -1;
          suggestOpen = false;
        });
      }
      _hideSuggestOverlay();
      return;
    }
    // 1) lokal dulu (cepat, sinkron) agar responsif.
    final ql = q.toLowerCase();
    final local = books
        .where((b) => '${b['nama']}'.toLowerCase().contains(ql))
        .take(6)
        .toList();
    if (mounted) {
      setState(() {
        suggest = local;
        suggestHi = -1;
        suggestOpen = true;
      });
      _refreshSuggestOverlay();
    }
    // 2) server suggest (debounce 300ms, hanya yg belum tercatat).
    _suggestDebounce = Timer(const Duration(milliseconds: 300), () async {
      try {
        final dio = await ApiClient.instance.dio();
        final r = await dio.get(
            '/api/events/${widget.event.id}/guests/suggest',
            queryParameters: {'q': q.trim()});
        final list =
            (r.data as List? ?? []).cast<Map<String, dynamic>>();
        if (mounted && list.isNotEmpty) {
          setState(() {
            suggest = list.take(8).toList();
            suggestHi = -1;
            suggestOpen = true;
          });
          _refreshSuggestOverlay();
        }
      } catch (_) {}
    });
  }

  void _selectSuggest(Map<String, dynamic> s) {
    namaC.text = '${s['nama']}';
    final al = '${s['alamat'] ?? ''}';
    if (al.isNotEmpty) alamatC.text = al;
    setState(() {
      suggest = [];
      suggestHi = -1;
      suggestOpen = false;
    });
    _hideSuggestOverlay();
    _scheduleDupCheck();
    // Lanjut ke alamat agar alur Nama→Alamat→Nominal→Enter tetap cepat.
    alamatFocus.requestFocus();
  }

  /// Overlay absolut ala web: dropdown mengambang di bawah field nama,
  /// tidak mendorong form. Posisi dibaca dari RenderBox tiap build.
  void _refreshSuggestOverlay() {
    if (!mounted) return;
    if (!suggestOpen || suggest.isEmpty) {
      _hideSuggestOverlay();
      return;
    }
    if (_suggestOverlay == null) {
      _suggestOverlay = OverlayEntry(builder: _buildSuggestOverlay);
      Overlay.of(context).insert(_suggestOverlay!);
    } else {
      _suggestOverlay!.markNeedsBuild();
    }
  }

  void _hideSuggestOverlay() {
    _suggestOverlay?.remove();
    _suggestOverlay = null;
  }

  Widget _buildSuggestOverlay(BuildContext ctx) {
    final box =
        _namaKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.attached) return const SizedBox.shrink();
    final pos = box.localToGlobal(Offset.zero);
    final scheme = Theme.of(context).colorScheme;
    final screenW = MediaQuery.sizeOf(ctx).width;
    var left = pos.dx;
    final width = box.size.width;
    if (left + width > screenW - 16) {
      left = (screenW - 16 - width).clamp(16.0, screenW - 16);
    }
    return Positioned(
      left: left,
      top: pos.dy + box.size.height + 6,
      width: width,
      child: Material(
        elevation: 4,
        borderRadius: BorderRadius.circular(12),
        color: scheme.surfaceContainerLow,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 220),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  border: Border(
                      bottom: BorderSide(color: scheme.outlineVariant)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Buku Tamu (${suggest.length})',
                        style: TextStyle(
                            fontSize: 12,
                            color: scheme.onSurfaceVariant,
                            fontWeight: FontWeight.w600)),
                    Text('klik / Enter untuk pilih',
                        style: TextStyle(
                            fontSize: 11,
                            color: scheme.onSurfaceVariant)),
                  ],
                ),
              ),
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  padding: EdgeInsets.zero,
                  itemCount: suggest.length,
                  itemBuilder: (_, i) {
                    final s = suggest[i];
                    final hi = i == suggestHi;
                    return Material(
                      color:
                          hi ? scheme.surfaceContainer : Colors.transparent,
                      child: ListTile(
                        dense: true,
                        selected: hi,
                        selectedTileColor: scheme.surfaceContainer,
                        leading: CircleAvatar(
                          radius: 14,
                          child: Text(
                              '${s['nama']}'.isNotEmpty
                                  ? '${s['nama']}'
                                      .substring(0, 1)
                                      .toUpperCase()
                                  : '?',
                              style: const TextStyle(fontSize: 12)),
                        ),
                        title: Text('${s['nama']}',
                            style: const TextStyle(
                                fontWeight: FontWeight.w600)),
                        subtitle: Text('${s['alamat'] ?? ''}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                        trailing:
                            const Icon(Icons.north_west, size: 16),
                        onTap: () => _selectSuggest(s),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Navigasi keyboard chips nominal ala web: panah pilih, Enter isi,
  /// Esc batal. Cermin onKeyDown input nominal di EventClient web.
  KeyEventResult _onNominalKey(FocusNode node, KeyEvent e) {
    if (e is! KeyDownEvent) return KeyEventResult.ignored;
    if (nominalTop.isEmpty) return KeyEventResult.ignored;
    if (e.logicalKey == LogicalKeyboardKey.arrowRight ||
        e.logicalKey == LogicalKeyboardKey.arrowDown) {
      setState(() => nominalHi =
          nominalHi < 0 ? 0 : (nominalHi + 1) % nominalTop.length);
      return KeyEventResult.handled;
    }
    if (e.logicalKey == LogicalKeyboardKey.arrowLeft ||
        e.logicalKey == LogicalKeyboardKey.arrowUp) {
      setState(() => nominalHi = nominalHi < 0
          ? nominalTop.length - 1
          : (nominalHi - 1 + nominalTop.length) % nominalTop.length);
      return KeyEventResult.handled;
    }
    if (e.logicalKey == LogicalKeyboardKey.enter &&
        nominalHi >= 0 &&
        nominalHi < nominalTop.length) {
      setState(() {
        nominalC.text = '${nominalTop[nominalHi]}';
        nominalHi = -1;
      });
      return KeyEventResult.handled;
    }
    if (e.logicalKey == LogicalKeyboardKey.escape) {
      setState(() => nominalHi = -1);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  /// Cek duplikat live ala web: lokal instan + server /check debounce.
  /// Dipicu tiap nama/alamat berubah; hasil dipakai untuk warning +
  /// label tombol "Simpan dengan Catatan".
  void _scheduleDupCheck() {
    _dupDebounce?.cancel();
    _dupDebounce = Timer(const Duration(milliseconds: 400), () async {
      final nama = namaC.text.trim();
      final alamat = alamatC.text.trim();
      if (!mounted || nama.length < 2 || alamat.length < 2) {
        if (mounted && liveDup != null) setState(() => liveDup = null);
        return;
      }
      // 1) lokal dulu (offline-first).
      Map<String, dynamic>? local;
      try {
        local = guests.cast<Map<String, dynamic>?>().firstWhere(
              (g) =>
                  g != null &&
                  '${g['nama']}'.toLowerCase() == nama.toLowerCase() &&
                  '${g['alamat']}'.toLowerCase() == alamat.toLowerCase(),
              orElse: () => null,
            );
      } catch (_) {
        local = null;
      }
      if (mounted) {
        final found = local;
        setState(() => liveDup = found == null
            ? null
            : {
                'nama': '${found['nama']}',
                'nominalFormatted':
                    formatRp((found['nominal'] as int?) ?? 0),
                'source': 'lokal',
              });
      }
      // 2) server /check (best-effort).
      try {
        final dio = await ApiClient.instance.dio();
        final r = await dio.get(
          '/api/events/${widget.event.id}/guests/check',
          queryParameters: {'nama': nama, 'alamat': alamat},
        );
        final j = Map<String, dynamic>.from(r.data as Map);
        if (!mounted) return;
        if (j['exists'] == true && j['existing'] is Map) {
          final ex = Map<String, dynamic>.from(j['existing'] as Map);
          setState(() => liveDup = {
                'nama': '${ex['nama'] ?? nama}',
                'nominalFormatted':
                    '${ex['nominalFormatted'] ?? formatRp((ex['nominal'] as num?)?.toInt() ?? 0)}',
                'source': 'server',
              });
        } else if (local == null && mounted) {
          setState(() => liveDup = null);
        }
      } catch (_) {}
    });
  }

  KeyEventResult _onNamaKey(FocusNode node, KeyEvent e) {
    if (e is! KeyDownEvent) return KeyEventResult.ignored;
    if (!suggestOpen || suggest.isEmpty) {
      if (e.logicalKey == LogicalKeyboardKey.escape) {
        setState(() {
          suggest = [];
          suggestHi = -1;
          suggestOpen = false;
        });
        _hideSuggestOverlay();
        return KeyEventResult.handled;
      }
      return KeyEventResult.ignored;
    }
    if (e.logicalKey == LogicalKeyboardKey.arrowDown) {
      setState(() => suggestHi = (suggestHi + 1) % suggest.length);
      _refreshSuggestOverlay();
      return KeyEventResult.handled;
    }
    if (e.logicalKey == LogicalKeyboardKey.arrowUp) {
      setState(() => suggestHi =
          (suggestHi - 1 + suggest.length) % suggest.length);
      _refreshSuggestOverlay();
      return KeyEventResult.handled;
    }
    if (e.logicalKey == LogicalKeyboardKey.enter &&
        suggestHi >= 0 &&
        suggestHi < suggest.length) {
      _selectSuggest(suggest[suggestHi]);
      return KeyEventResult.handled;
    }
    if (e.logicalKey == LogicalKeyboardKey.escape) {
      setState(() {
        suggest = [];
        suggestHi = -1;
        suggestOpen = false;
      });
      _hideSuggestOverlay();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  Future<void> _saveGuest() async {
    if (denyViewer()) return;
    // Kapital tiap awal kata + validasi huruf saja (tanpa angka/simbol).
    final nama = capitalizeWords(namaC.text);
    final alamat = alamatC.text.trim().replaceAll(RegExp(r'\s+'), ' ');
    final nominal = parseNominal(nominalC.text);
    if (!isValidNama(nama)) {
      showTopSnack(context, const SnackBar(
          content: Text('Nama hanya boleh huruf (min 2), tanpa angka/simbol')));
      return;
    }
    if (alamat.length < 2 || nominal <= 0) {
      showTopSnack(context, const SnackBar(
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
          // Rekonsiliasi id: server bikin id baru (bukan gst-*). Ganti baris
          // lokal agar pull berikutnya tidak merge sebagai baris kedua.
          try {
            final srv = r.data is Map
                ? Map<String, dynamic>.from(r.data as Map)
                : null;
            if (srv != null &&
                '${srv['id']}'.isNotEmpty &&
                '${srv['id']}' != id) {
              await LocalDb.instance.replaceGuestWithServer(
                eventId: widget.event.id,
                oldId: id,
                server: srv,
              );
            }
          } catch (_) {
            // Bentuk respons tak dikenal — biarkan baris lokal apa adanya.
          }
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
      setState(() {
        suggest = [];
        suggestHi = -1;
        suggestOpen = false;
        guestLimit = 20;
        liveDup = null;
        nominalHi = -1;
      });
      _hideSuggestOverlay();
      await _loadLocal();
      await SyncEngine.instance.pending(widget.event.id);
      if (mounted) {
        showTopSnack(context, SnackBar(
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

  static const _tabs = [
    (Icons.bolt_outlined, 'Input'),
    (Icons.book_outlined, 'Buku Tamu'),
    (Icons.bar_chart_outlined, 'Rekap'),
  ];

  List<Widget> get _tabActions => [
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
                showTopSnack(context, SnackBar(
                    content: Text(e == null
                        ? 'Sync: $f terkirim, $c konflik'
                        : 'Sync tertunda ($e) — data aman di lokal')));
              }
            },
          ),
        ),
      ];

  @override
  Widget build(BuildContext context) {
    // Ctrl+S simpan pemberian dari tab Input, Ctrl+F fokus cari —
    // standar app desktop Linux/tablet dengan keyboard.
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyS, control: true):
            () {
          if (tab.index == 0 && canEdit && !saving) _saveGuest();
        },
        const SingleActivator(LogicalKeyboardKey.keyF, control: true):
            () {
          if (tab.index == 0) {
            guestSearchFocus.requestFocus();
          } else if (tab.index == 1) {
            bookSearchFocus.requestFocus();
          }
        },
      },
      child: LayoutBuilder(builder: (context, cons) {
        // Desktop lebar: NavigationRail samping (cermin tab web).
        if (WindowUi.isWide(cons.maxWidth)) return _wideScaffold();
        return Scaffold(
          appBar: AppBar(
            title: Text(widget.event.namaAcara,
                overflow: TextOverflow.ellipsis),
            actions: _tabActions,
            bottom: TabBar(
                controller: tab,
                tabs: const [
                  Tab(icon: Icon(Icons.bolt_outlined), text: 'Input'),
                  Tab(
                      icon: Icon(Icons.book_outlined),
                      text: 'Buku Tamu'),
                  Tab(
                      icon: Icon(Icons.bar_chart_outlined),
                      text: 'Rekap'),
                ]),
          ),
          body: TabBarView(controller: tab, children: [
            _inputTab(),
            _booksTab(),
            _rekapTab(),
          ]),
        );
      }),
    );
  }

  /// Scaffold desktop: rail kiri + konten tab.
  /// AnimatedBuilder agar swipe/klik tab update rail yang dipilih.
  Widget _wideScaffold() {
    return Scaffold(
      appBar: AppBar(
        title:
            Text(widget.event.namaAcara, overflow: TextOverflow.ellipsis),
        actions: _tabActions,
      ),
      body: AnimatedBuilder(
        animation: tab,
        builder: (context, _) => Row(
          children: [
            NavigationRail(
              selectedIndex: tab.index,
              onDestinationSelected: (i) => tab.animateTo(i),
              labelType: NavigationRailLabelType.all,
              destinations: _tabs
                  .map((t) => NavigationRailDestination(
                      icon: Icon(t.$1), label: Text(t.$2)))
                  .toList(),
            ),
            const VerticalDivider(width: 1),
            Expanded(
              child: TabBarView(controller: tab, children: [
                _inputTab(),
                _booksTab(),
                _rekapTab(),
              ]),
            ),
          ],
        ),
      ),
    );
  }

  /// Field form input — diekstrak agar bisa disusun vertikal (HP)
  /// maupun grid (desktop lebar) tanpa duplikasi.
  Widget _namaField() => TextField(
        key: _namaKey,
        controller: namaC,
        focusNode: namaFocus,
        onChanged: _onNamaChanged,
        onTap: () {
          if (suggest.isNotEmpty) setState(() => suggestOpen = true);
        },
        onSubmitted: (_) {
          if (suggestOpen && suggestHi >= 0 && suggestHi < suggest.length) {
            _selectSuggest(suggest[suggestHi]);
          } else {
            alamatFocus.requestFocus();
          }
        },
        textInputAction: TextInputAction.next,
        textCapitalization: TextCapitalization.words,
        decoration: const InputDecoration(
            labelText: 'Nama (huruf saja)',
            helperText: 'Ketik 2 huruf • ↑↓ pilih • Enter isi • Esc tutup',
            border: OutlineInputBorder(),
            filled: true,
            prefixIcon: Icon(Icons.person_search_outlined)),
      );

  Widget _alamatField() => TextField(
      controller: alamatC,
      focusNode: alamatFocus,
      enabled: canEdit,
      textInputAction: TextInputAction.next,
      textCapitalization: TextCapitalization.words,
      onChanged: (_) => _scheduleDupCheck(),
      decoration: const InputDecoration(
          labelText: 'Alamat / Desa',
          border: OutlineInputBorder(),
          filled: true,
          prefixIcon: Icon(Icons.home_outlined)));

  /// Chips alamat ala web: rapat di bawah input + count redup.
  /// Dibungkus ValueListenable agar status aktif ikut ketikan
  /// tanpa rebuild seluruh form.
  Widget _alamatChips() => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: ValueListenableBuilder<TextEditingValue>(
          valueListenable: alamatC,
          builder: (_, v, _) => Wrap(
              spacing: 6,
              runSpacing: 4,
              children: alamatTop.map((a) {
                final active = v.text.trim() == a;
                final count = alamatCount[a] ?? 0;
                final scheme = Theme.of(context).colorScheme;
                return ActionChip(
                    visualDensity: VisualDensity.compact,
                    label: Text.rich(
                      TextSpan(children: [
                        TextSpan(text: a),
                        if (count > 0)
                          TextSpan(
                            text: '  $count',
                            style: TextStyle(
                                color: scheme.onSurfaceVariant
                                    .withValues(alpha: 0.6)),
                          ),
                      ]),
                    ),
                    backgroundColor:
                        active ? scheme.primaryContainer : null,
                    side: BorderSide(
                        color: active
                            ? scheme.primary
                            : scheme.outlineVariant),
                    onPressed: canEdit
                        ? () {
                            alamatC.text = a;
                            _scheduleDupCheck();
                          }
                        : null);
              }).toList()),
        ),
      );

  Widget _nominalField() => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Nominal *',
                    style: Theme.of(context).textTheme.labelLarge),
                ValueListenableBuilder<TextEditingValue>(
                  valueListenable: nominalC,
                  builder: (_, v, _) {
                    final n = parseNominal(v.text);
                    if (n <= 0) return const SizedBox.shrink();
                    return Text(formatRp(n),
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color:
                                Theme.of(context).colorScheme.primary));
                  },
                ),
              ],
            ),
            const SizedBox(height: 6),
            TextField(
                controller: nominalC,
                focusNode: nominalFocus,
                enabled: canEdit,
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(15),
                ],
                // Tanpa setState tiap ketik (preview + chips ikut
                // ValueListenable sendiri) agar chips tidak loncat.
                onChanged: (_) {
                  if (nominalHi != -1) {
                    setState(() => nominalHi = -1);
                  }
                },
                decoration: const InputDecoration(
                    hintText: '100000',
                    prefixText: 'Rp ',
                    border: OutlineInputBorder(),
                    filled: true,
                    prefixIcon: Icon(Icons.payments_outlined))),
          ]);

  /// Chips nominal ala web: rapat + count redup + highlight keyboard
  /// (panah/hover) + klik. Nilai aktif ikut ValueListenable agar form
  /// tidak rebuild tiap ketik.
  Widget _nominalChips() => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: ValueListenableBuilder<TextEditingValue>(
          valueListenable: nominalC,
          builder: (_, v, _) => Wrap(
              spacing: 6,
              runSpacing: 4,
              children: nominalTop.asMap().entries.map((e) {
                final i = e.key;
                final n = e.value;
                final active = v.text.trim() == '$n';
                final hi = i == nominalHi;
                final count = nominalCount[n] ?? 0;
                final scheme = Theme.of(context).colorScheme;
                final chip = ActionChip(
                    visualDensity: VisualDensity.compact,
                    backgroundColor: active
                        ? scheme.primaryContainer
                        : hi
                            ? scheme.surfaceContainer
                            : null,
                    side: BorderSide(
                        color: active || hi
                            ? scheme.primary
                            : scheme.outlineVariant),
                    label: Text.rich(
                      TextSpan(children: [
                        TextSpan(text: formatRp(n)),
                        if (count > 0)
                          TextSpan(
                            text: '  $count',
                            style: TextStyle(
                                color: scheme.onSurfaceVariant
                                    .withValues(alpha: 0.6)),
                          ),
                      ]),
                    ),
                    onPressed: canEdit
                        ? () => setState(() {
                              nominalC.text = '$n';
                              nominalHi = -1;
                            })
                        : null);
                // Hover mouse = highlight ala web (desktop/Linux).
                return MouseRegion(
                  onEnter: (_) {
                    if (nominalHi != i) {
                      setState(() => nominalHi = i);
                    }
                  },
                  onExit: (_) {
                    if (nominalHi == i) {
                      setState(() => nominalHi = -1);
                    }
                  },
                  child: chip,
                );
              }).toList()),
        ),
      );

  Widget _metodeSection() => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Metode',
                style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: methodes.map((m) {
                final scheme = Theme.of(context).colorScheme;
                final b = Theme.of(context).brightness;
                final selected = metode == m;
                final (bg, fg) = AppColors.methodChip(m, scheme);
                return ChoiceChip(
                  label: Text(m,
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: selected ? scheme.onPrimary : fg)),
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
                  onSelected: canEdit
                      ? (_) => setState(() => metode = m)
                      : null,
                );
              }).toList(),
            ),
          ]);

  Widget _catatanField() {
    final dup = liveDup != null;
    final scheme = Theme.of(context).colorScheme;
    return TextField(
        controller: catatanC,
        enabled: canEdit,
        textCapitalization: TextCapitalization.sentences,
        maxLength: 200,
        maxLines: 1,
        decoration: InputDecoration(
            labelText:
                dup ? 'Catatan (wajib isi, duplikat)' : 'Catatan (opsional)',
            hintText: dup
                ? 'Wajib: bedakan dari data sebelumnya'
                : 'Opsional',
            // Sembunyikan counter agar field ramping sebaris ala web.
            counterText: '',
            border: const OutlineInputBorder(),
            filled: true,
            prefixIcon: const Icon(Icons.note_outlined),
            enabledBorder: dup
                ? OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide:
                        BorderSide(color: scheme.error, width: 1.5),
                  )
                : null,
            focusedBorder: dup
                ? OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide:
                        BorderSide(color: scheme.error, width: 1.5),
                  )
                : null));
  }

  Widget _dupWarning() {
    final d = liveDup;
    if (d == null) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.errorContainer,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Row(
        children: [
          Icon(Icons.warning_amber_outlined,
              size: 18, color: scheme.onErrorContainer),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
                '${d['nama']} sudah ${d['nominalFormatted']} — isi catatan penanda lalu simpan.',
                style: TextStyle(
                    fontSize: 12, color: scheme.onErrorContainer)),
          ),
        ],
      ),
    );
  }

  /// Tombol simpan dipakai ulang di dalam kartu (medium, sebaris dengan
  /// catatan ala web) maupun di bawah kartu (HP).
  Widget _saveButton() => FilledButton.icon(
        onPressed: saving ? null : _saveGuest,
        icon: saving
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.save_outlined),
        label: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(saving
                ? 'Menyimpan...'
                : liveDup != null
                    ? 'Simpan dengan Catatan'
                    : 'Simpan (offline-first)')),
      );

  /// Search pemberian (viewer) + daftar filter untuk list/tabel.
  /// Ctrl+F fokus ke sini di tablet/Linux.
  Widget _guestSearchField() => TextField(
      focusNode: guestSearchFocus,
      onChanged: (v) => setState(() {
        guestQ = v;
        guestLimit = 20;
      }),
      decoration: InputDecoration(
          hintText: 'Cari nama / alamat… (${guests.length}) (Ctrl+F)',
          border: const OutlineInputBorder(),
          filled: true,
          isDense: true,
          prefixIcon: const Icon(Icons.search_outlined)));

  List<Map<String, dynamic>> get shownGuests {
    final q = guestQ.trim().toLowerCase();
    var list = guests.where((g) {
      if (mejaFilter != null && '${g['mejaLabel'] ?? ''}' != mejaFilter) {
        return false;
      }
      if (kasirFilter != null && '${g['petugasId'] ?? ''}' != kasirFilter) {
        return false;
      }
      if (q.isEmpty) return true;
      return '${g['nama']}'.toLowerCase().contains(q) ||
          '${g['alamat']}'.toLowerCase().contains(q) ||
          '${g['mejaLabel'] ?? ''}'.toLowerCase().contains(q) ||
          '${g['catatan'] ?? ''}'.toLowerCase().contains(q);
    }).toList();
    int cmp(Map<String, dynamic> a, Map<String, dynamic> b) {
      int r;
      if (sortBy == 'Nama') {
        r = '${a['nama']}'
            .toLowerCase()
            .compareTo('${b['nama']}'.toLowerCase());
      } else if (sortBy == 'Nominal') {
        r = (((a['nominal'] as int?) ?? 0))
            .compareTo(((b['nominal'] as int?) ?? 0));
      } else {
        r = '${a['createdAt'] ?? ''}'.compareTo('${b['createdAt'] ?? ''}');
      }
      return sortDesc ? -r : r;
    }

    list.sort(cmp);
    return list;
  }

  /// Filter meja + kasir + sort ala web (dipakai di atas tabel pemberian).
  /// Horizontal scroll agar muat di tablet portrait / window Linux sempit.
  Widget _guestFilters() {
    final scheme = Theme.of(context).colorScheme;
    final kasirSeen = <String, String>{};
    for (final g in guests) {
      final pid = '${g['petugasId'] ?? ''}';
      if (pid.isEmpty || pid == 'null') continue;
      kasirSeen.putIfAbsent(pid, () => _kasirName(g));
    }
    final kasirIds = kasirSeen.keys.toList()..sort();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              Text('Meja:',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: scheme.onSurfaceVariant)),
              const SizedBox(width: 6),
              ChoiceChip(
                label: const Text('Semua', style: TextStyle(fontSize: 12)),
                selected: mejaFilter == null,
                onSelected: (_) =>
                    setState(() => mejaFilter = null),
              ),
              ...mejaList.map((m) => Padding(
                    padding: const EdgeInsets.only(left: 6),
                    child: ChoiceChip(
                      label: Text(m, style: const TextStyle(fontSize: 12)),
                      selected: mejaFilter == m,
                      onSelected: (_) => setState(() =>
                          mejaFilter = mejaFilter == m ? null : m),
                    ),
                  )),
              const SizedBox(width: 12),
              Text('Kasir:',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: scheme.onSurfaceVariant)),
              const SizedBox(width: 6),
              ChoiceChip(
                label: const Text('Semua', style: TextStyle(fontSize: 12)),
                selected: kasirFilter == null,
                onSelected: (_) =>
                    setState(() => kasirFilter = null),
              ),
              ...kasirIds.take(8).map((pid) => Padding(
                    padding: const EdgeInsets.only(left: 6),
                    child: ChoiceChip(
                      label: Text(kasirSeen[pid] ?? pid,
                          style: const TextStyle(fontSize: 12)),
                      selected: kasirFilter == pid,
                      onSelected: (_) => setState(() => kasirFilter =
                          kasirFilter == pid ? null : pid),
                    ),
                  )),
              if (mejaFilter != null || kasirFilter != null)
                Padding(
                  padding: const EdgeInsets.only(left: 6),
                  child: TextButton(
                    onPressed: () => setState(() {
                      mejaFilter = null;
                      kasirFilter = null;
                    }),
                    child: const Text('Reset',
                        style: TextStyle(fontSize: 12)),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: sortBy,
                decoration: const InputDecoration(
                    isDense: true,
                    border: OutlineInputBorder(),
                    filled: true),
                items: const ['Waktu', 'Nama', 'Nominal']
                    .map((e) =>
                        DropdownMenuItem(value: e, child: Text(e)))
                    .toList(),
                onChanged: (v) {
                  if (v == null) return;
                  setState(() => sortBy = v);
                },
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: DropdownButtonFormField<bool>(
                initialValue: sortDesc,
                decoration: const InputDecoration(
                    isDense: true,
                    border: OutlineInputBorder(),
                    filled: true),
                items: const [
                  DropdownMenuItem(
                      value: true, child: Text('↓ Desc')),
                  DropdownMenuItem(
                      value: false, child: Text('↑ Asc')),
                ],
                onChanged: (v) {
                  if (v == null) return;
                  setState(() => sortDesc = v);
                },
              ),
            ),
          ],
        ),
      ],
    );
  }

  bool _isPendingGuest(Map<String, dynamic> g) {
    final id = '${g['id']}';
    // Jujur ikut antrean outbox (cermin badge pending web untuk local-*).
    if (pendingIds.contains(id)) return true;
    if ('${g['petugasId']}' == 'lokal') return true;
    // Fallback sebelum outbox sempat dibaca: prefix gst- = belum sync.
    if (!_pendingLoaded && id.startsWith('gst-')) return true;
    return false;
  }

  String _kasirShort(Map<String, dynamic> g) {
    final full = _kasirName(g);
    if (full == '—' || full == 'lokal') return full;
    return full.length > 12 ? '${full.substring(0, 12)}…' : full;
  }

  /// Tile pemberian (HP <600px) — tampilkan semua info tanpa truncate ala web
  /// mobile card: nomor, nama+pending, alamat, catatan, metode+meja+kasir.
  Widget _guestTile(Map<String, dynamic> g, [int? no]) => Card(
        margin: const EdgeInsets.symmetric(vertical: 4),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (no != null)
                Padding(
                  padding: const EdgeInsets.only(top: 10, right: 4),
                  child: SizedBox(
                    width: 28,
                    child: Text('$no',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant)),
                  ),
                ),
              CircleAvatar(
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
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 6,
                      children: [
                        Text('${g['nama']}',
                            style:
                                const TextStyle(fontWeight: FontWeight.w700)),
                        if (_isPendingGuest(g))
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: Theme.of(context).colorScheme.error,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text('pending',
                                style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onError)),
                          ),
                      ],
                    ),
                    Text('${g['alamat']}',
                        style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant)),
                    if ('${g['catatan'] ?? ''}'.isNotEmpty)
                      Text('↳ ${g['catatan']}',
                          style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant)),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        MethodChip('${g['metode'] ?? 'AMPLOP'}'),
                        if ('${g['mejaLabel'] ?? ''}'.isNotEmpty)
                          Chip(
                            label: Text('${g['mejaLabel']}'),
                            labelStyle: TextStyle(
                                fontSize: 11,
                                color: Theme.of(context)
                                    .colorScheme
                                    .onTertiaryContainer),
                            backgroundColor: Theme.of(context)
                                .colorScheme
                                .tertiaryContainer,
                            side: BorderSide(
                                color: Theme.of(context)
                                    .colorScheme
                                    .outlineVariant),
                            visualDensity: VisualDensity.compact,
                            padding: EdgeInsets.zero,
                          ),
                        Text(_kasirShort(g),
                            style: TextStyle(
                                fontSize: 11,
                                color: Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(formatRp((g['nominal'] as int?) ?? 0),
                      style: TextStyle(
                          fontWeight: FontWeight.w800,
                          color: Theme.of(context).colorScheme.primary,
                          fontFeatures: const [FontFeature.tabularFigures()])),
                  if (canEdit)
                    IconButton(
                      tooltip: 'Aksi',
                      visualDensity: VisualDensity.compact,
                      icon: const Icon(Icons.more_vert_outlined),
                      onPressed: () => _guestSheet(g),
                    ),
                ],
              ),
            ],
          ),
        ),
      );

  /// Tabel pemberian — cermin tabel web (No/Nama+catatan/Alamat/Nominal/
  /// Meja/Kasir/Metode/Aksi) + footer total. Dipakai di tablet (>=600px)
  /// maupun desktop lebar (>=900px); HP kecil tetap card.
  /// Lebar: kolom Nama/Alamat dilebarkan proporsional mengisi viewport
  /// (cermin `w-full` web); scroll horizontal hanya bila viewport sempit.
  Widget _guestTable([List<Map<String, dynamic>>? rows]) {
    final all = rows ?? shownGuests;
    final totalShown = all.fold<int>(
        0, (s, g) => s + (((g['nominal'] as int?) ?? 0)));
    final data = all.take(guestLimit).toList();
    final startNo = 1;
    return LayoutBuilder(builder: (context, cons) {
      final avail = cons.maxWidth;
      final spacing = avail >= 1000 ? 20.0 : 12.0;
      // Estimasi kolom fix: #32 + Nominal110 + Meja80 + Kasir100 +
      // Metode100 + Aksi44 + margin DataTable 24+24.
      const fixedCols = 32.0 + 110.0 + 80.0 + 100.0 + 100.0 + 44.0;
      const margins = 48.0;
      final flex = avail - fixedCols - margins - spacing * 7;
      // Bagi sisa ruang Nama 58% : Alamat 42%; bila tak muat, pakai lebar
      // fallback dan biarkan scroll horizontal.
      double? namaW;
      double? alamatW;
      if (flex >= 250) {
        var n = (flex * 0.58).clamp(140.0, 340.0);
        var a = flex - n;
        if (a < 100) {
          a = 100;
          n = flex - 100;
        }
        if (n >= 140) {
          namaW = n;
          alamatW = a;
        }
      }
      final contentMin = fixedCols +
          margins +
          spacing * 7 +
          (namaW ?? 160) +
          (alamatW ?? 120);
      final minWidth = contentMin > avail ? contentMin : avail;
      return Card(
        margin: const EdgeInsets.symmetric(vertical: 4),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: ConstrainedBox(
                constraints: BoxConstraints(minWidth: minWidth),
                child: _guestDataTable(
                  data,
                  startNo,
                  spacing,
                  namaW ?? 160,
                  alamatW ?? 120,
                ),
              ),
            ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainer,
              border: Border(
                  top: BorderSide(
                      color:
                          Theme.of(context).colorScheme.outlineVariant)),
            ),
            child: Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              children: [
                Text(
                    'Total tampil: ${formatRp(totalShown)} • ${all.length} data',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: Theme.of(context).colorScheme.onSurface)),
                if (all.length > data.length)
                  TextButton.icon(
                    onPressed: () =>
                        setState(() => guestLimit += 20),
                    icon: const Icon(Icons.expand_more_outlined, size: 16),
                    label: Text(
                        'Muat 20 lagi (${all.length - data.length} sisa)'),
                  )
                else
                  Text('Semua tampil',
                      style: TextStyle(
                          fontSize: 11,
                          color: Theme.of(context)
                              .colorScheme
                              .onSurfaceVariant)),
              ],
            ),
          ),
        ],
      ),
      );
    });
  }

  /// Isi DataTable pemberian dengan lebar kolom Nama/Alamat fix hasil
  /// hitung viewport (agar tabel selalu selebar wadah, cermin `w-full`).
  Widget _guestDataTable(
    List<Map<String, dynamic>> data,
    int startNo,
    double spacing,
    double namaW,
    double alamatW,
  ) {
    return DataTable(
      columnSpacing: spacing,
      headingRowHeight: 40,
      dataRowMinHeight: 48,
      dataRowMaxHeight: 64,
      columns: const [
        DataColumn(label: Text('#')),
        DataColumn(label: Text('Nama')),
        DataColumn(label: Text('Alamat')),
        DataColumn(label: Text('Nominal'), numeric: true),
        DataColumn(label: Text('Meja')),
        DataColumn(label: Text('Kasir')),
        DataColumn(label: Text('Metode')),
        DataColumn(label: Text('Aksi')),
      ],
      rows: List.generate(data.length, (idx) {
        final g = data[idx];
        final no = startNo + idx;
        final pending = _isPendingGuest(g);
        final meja = '${g['mejaLabel'] ?? ''}';
        final catatan = '${g['catatan'] ?? ''}';
        return DataRow(cells: [
          DataCell(Text('$no',
              style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(context)
                      .colorScheme
                      .onSurfaceVariant))),
          DataCell(SizedBox(
            width: namaW,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Flexible(
                      child: Text('${g['nama']}',
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700)),
                    ),
                    if (pending)
                      Container(
                        margin: const EdgeInsets.only(left: 6),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color:
                              Theme.of(context).colorScheme.error,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text('pending',
                            style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: Theme.of(context)
                                    .colorScheme
                                    .onError)),
                      ),
                  ],
                ),
                if (catatan.isNotEmpty && catatan != 'null')
                  Text('↳ $catatan',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 11,
                          color: Theme.of(context)
                              .colorScheme
                              .onSurfaceVariant)),
              ],
            ),
          )),
          DataCell(SizedBox(
            width: alamatW,
            child: Text('${g['alamat']}',
                maxLines: 1, overflow: TextOverflow.ellipsis),
          )),
          DataCell(Text(
              formatRp((g['nominal'] as int?) ?? 0),
              style: TextStyle(
                  fontWeight: FontWeight.w800,
                  color: Theme.of(context).colorScheme.primary,
                  fontFeatures: const [
                    FontFeature.tabularFigures()
                  ]))),
          DataCell(meja.isNotEmpty && meja != 'null'
              ? Chip(
                  label: Text(meja),
                  labelStyle: TextStyle(
                      fontSize: 11,
                      color: Theme.of(context)
                          .colorScheme
                          .onTertiaryContainer),
                  backgroundColor: Theme.of(context)
                      .colorScheme
                      .tertiaryContainer,
                  side: BorderSide(
                      color: Theme.of(context)
                          .colorScheme
                          .outlineVariant),
                  visualDensity: VisualDensity.compact,
                  padding: EdgeInsets.zero,
                )
              : const Text('—')),
          DataCell(Tooltip(
            message:
                '${_kasirName(g)} • ${g['petugasId'] ?? '—'}',
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                  maxWidth: 110, minWidth: 60),
              child: Text(_kasirShort(g),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
            ),
          )),
          DataCell(
              MethodChip('${g['metode'] ?? 'AMPLOP'}')),
          DataCell(canEdit
              ? IconButton(
                  tooltip: 'Aksi',
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(
                      Icons.more_vert_outlined),
                  onPressed: () => _guestSheet(g),
                )
              : const SizedBox.shrink()),
        ]);
      }),
    );
  }

  Widget _inputTab() => LayoutBuilder(builder: (context, cons) {
        // Tablet (>=600px) + desktop lebar (>=900px) pakai tabel compact
        // full-info; HP kecil (<600px) tetap card.
        final medium = WindowUi.isMedium(cons.maxWidth);
        // Tutup dropdown overlay saat form di-scroll (posisi overlay
        // tidak mengikuti scroll ListView).
        return NotificationListener<ScrollNotification>(
          onNotification: (n) {
            if (n is ScrollUpdateNotification && suggestOpen) {
              setState(() {
                suggest = [];
                suggestHi = -1;
                suggestOpen = false;
              });
              _hideSuggestOverlay();
            }
            return false;
          },
          child: ListView(
            padding: WindowUi.pagePadding(cons.maxWidth), children: [
        if (goneServer)
          Card(
            color: Theme.of(context).colorScheme.errorContainer,
            child: ListTile(
              leading: Icon(Icons.search_off_outlined,
                  color: Theme.of(context).colorScheme.onErrorContainer),
              title: Text('Acara ini sudah dihapus dari server',
                  style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: Theme.of(context)
                          .colorScheme
                          .onErrorContainer)),
              subtitle: const Text('Data lokal masih bisa dilihat.'),
              trailing: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Kembali'),
              ),
            ),
          ),
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
        // VIEWER: tanpa form/meja sama sekali — hanya search + lihat.
        if (!canEdit) ...[
          _guestSearchField(),
          const SizedBox(height: 8),
          _guestFilters(),
          const SizedBox(height: 8),
          Text('Pemberian (${shownGuests.length})',
              style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          if (shownGuests.isEmpty)
            EmptyState(
              icon: guests.isEmpty
                  ? Icons.inbox_outlined
                  : Icons.search_off_outlined,
              title: guests.isEmpty
                  ? 'Belum ada pemberian tercatat'
                  : 'Tidak ketemu “$guestQ”',
              subtitle: guests.isEmpty
                  ? 'Minta OWNER/ADMIN untuk menambah data.'
                  : 'Coba kata kunci lain.',
            )
          else ...(medium
              ? [_guestTable(shownGuests)]
              : [
                  ...List.generate(
                      shownGuests.take(guestLimit).length,
                      (i) => _guestTile(
                          shownGuests.take(guestLimit).toList()[i], i + 1)),
                  if (shownGuests.length > guestLimit)
                    TextButton.icon(
                      onPressed: () =>
                          setState(() => guestLimit += 20),
                      icon: const Icon(Icons.expand_more_outlined, size: 16),
                      label: Text(
                          'Muat 20 lagi (${shownGuests.length - guestLimit} sisa)'),
                    ),
                ]),
        ],
        // EDITOR: form input lengkap.
        // Meja kasir: bar kompak paling atas, selalu terlihat.
        if (canEdit)
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
        if (canEdit)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Siapa yang memberi?',
                  style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 12),
              if (medium)
                Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                          child: Column(children: [
                        _namaField(),
                      ])),
                      const SizedBox(width: 12),
                      Expanded(
                          child: Column(children: [
                        _alamatField(),
                        if (alamatTop.isNotEmpty) _alamatChips(),
                      ])),
                    ])
              else ...[
                _namaField(),
                const SizedBox(height: 12),
                _alamatField(),
                if (alamatTop.isNotEmpty) _alamatChips(),
              ],
            ]),
          ),
        ),
        const SizedBox(height: 12),
        if (canEdit)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Nominal & metode',
                  style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 12),
              if (medium) ...[
                _nominalField(),
                if (nominalTop.isNotEmpty) _nominalChips(),
                const SizedBox(height: 12),
                // Cermin web: Metode(4) + Catatan(5) + Simpan(3) sebaris,
                // tombol rata bawah dengan field catatan.
                Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(flex: 4, child: _metodeSection()),
                      const SizedBox(width: 12),
                      Expanded(flex: 5, child: _catatanField()),
                      const SizedBox(width: 12),
                      Expanded(flex: 3, child: _saveButton()),
                    ]),
                _dupWarning(),
              ] else ...[
                _nominalField(),
                if (nominalTop.isNotEmpty) _nominalChips(),
                const SizedBox(height: 12),
                _metodeSection(),
                const SizedBox(height: 12),
                _catatanField(),
              ],
            ]),
          ),
        ),
        if (canEdit && !medium) _dupWarning(),
        if (canEdit && !medium) const SizedBox(height: 12),
        if (canEdit && !medium)
          Align(
            alignment: Alignment.center,
            child: SizedBox(
              width: double.infinity,
              child: _saveButton(),
            ),
          ),
        if (canEdit) const SizedBox(height: 16),
        if (canEdit)
          Text('Terakhir di perangkat ini (${shownGuests.length})',
              style: Theme.of(context).textTheme.titleSmall),
        if (canEdit) const SizedBox(height: 8),
        if (canEdit) _guestSearchField(),
        if (canEdit) const SizedBox(height: 8),
        if (canEdit) _guestFilters(),
        if (canEdit) const SizedBox(height: 8),
        if (canEdit && shownGuests.isEmpty)
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(guests.isEmpty
                      ? 'Belum ada pemberian tercatat.'
                      : 'Tidak ketemu “$guestQ”.'))),
        if (canEdit)
          ...(medium
              ? [_guestTable()]
              : [
                  ...List.generate(
                      shownGuests.take(guestLimit).length,
                      (i) => _guestTile(
                          shownGuests.take(guestLimit).toList()[i], i + 1)),
                  if (shownGuests.length > guestLimit)
                    TextButton.icon(
                      onPressed: () =>
                          setState(() => guestLimit += 20),
                      icon: const Icon(Icons.expand_more_outlined, size: 16),
                      label: Text(
                          'Muat 20 lagi (${shownGuests.length - guestLimit} sisa)'),
                    ),
                ]),
          ]));
      });

  /// Tile buku tamu (HP <600px) — nomor + nama + alamat + aksi.
  Widget _bookTile(Map<String, dynamic> b, [int? no]) {
    final nm = '${b['nama']}';
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        dense: true,
        leading: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (no != null)
              SizedBox(
                width: 28,
                child: Text('$no',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 12,
                        color: Theme.of(context)
                            .colorScheme
                            .onSurfaceVariant)),
              ),
            CircleAvatar(
                child: Text(nm.isNotEmpty
                    ? nm.substring(0, 1).toUpperCase()
                    : '?')),
          ],
        ),
        title: Text(nm,
            style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text('${b['alamat']}',
            maxLines: 2, overflow: TextOverflow.ellipsis),
        trailing: canEdit
            ? IconButton(
                tooltip: 'Aksi',
                icon: const Icon(Icons.more_vert_outlined),
                onPressed: () => _bookSheet(b),
              )
            : null,
      ),
    );
  }

  /// Tabel buku tamu — cermin tabel web (No/Nama/Alamat/Aksi + footer Total).
  /// Dipakai di tablet (>=600px) dan desktop; HP kecil tetap list.
  Widget _bookTable(List<Map<String, dynamic>> shown) {
    final data = shown.take(bookLimit).toList();
    return Card(
      margin: const EdgeInsets.fromLTRB(12, 4, 12, 4),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minWidth: 520),
              child: DataTable(
                columnSpacing: 12,
                headingRowHeight: 40,
                dataRowMinHeight: 48,
                columns: const [
                  DataColumn(label: Text('#')),
                  DataColumn(label: Text('Nama')),
                  DataColumn(label: Text('Alamat')),
                  DataColumn(label: Text('Aksi')),
                ],
                rows: List.generate(data.length, (i) {
                  final b = data[i];
                  return DataRow(cells: [
                    DataCell(Text('${i + 1}',
                        style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant))),
                    DataCell(ConstrainedBox(
                      constraints: const BoxConstraints(
                          maxWidth: 220, minWidth: 120),
                      child: Text('${b['nama']}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style:
                              const TextStyle(fontWeight: FontWeight.w700)),
                    )),
                    DataCell(ConstrainedBox(
                      constraints: const BoxConstraints(
                          maxWidth: 260, minWidth: 120),
                      child: Text('${b['alamat']}',
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                    )),
                    DataCell(canEdit
                        ? IconButton(
                            tooltip: 'Aksi',
                            visualDensity: VisualDensity.compact,
                            icon: const Icon(
                                Icons.more_vert_outlined),
                            onPressed: () => _bookSheet(b),
                          )
                        : const SizedBox.shrink()),
                  ]);
                }),
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainer,
              border: Border(
                  top: BorderSide(
                      color:
                          Theme.of(context).colorScheme.outlineVariant)),
            ),
            child: Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              children: [
                Text('Total: ${shown.length} tamu',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: Theme.of(context).colorScheme.onSurface)),
                if (shown.length > data.length)
                  TextButton.icon(
                    onPressed: () =>
                        setState(() => bookLimit += 50),
                    icon: const Icon(Icons.expand_more_outlined, size: 16),
                    label: Text(
                        'Muat 50 lagi (${shown.length - data.length} sisa)'),
                  )
                else
                  Text('Semua tampil',
                      style: TextStyle(
                          fontSize: 11,
                          color: Theme.of(context)
                              .colorScheme
                              .onSurfaceVariant)),
              ],
            ),
          ),
        ],
      ),
    );
  }

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
    return LayoutBuilder(builder: (context, cons) {
      // Tablet (>=600px) langsung tabel full-info; HP kecil list bernomor.
      final medium = WindowUi.isMedium(cons.maxWidth);
      // Pusatkan max 1120px di layar lebar (cermin page-shell web).
      final side = (cons.maxWidth - WindowUi.maxContentWidth) / 2;
      final hPad = side > 0 ? side : 0.0;
      return Padding(
        padding: EdgeInsets.symmetric(horizontal: hPad),
        child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: Row(children: [
            if (canEdit)
              Expanded(
                  child: FilledButton.icon(
                      onPressed: _addBookDialog,
                      icon: const Icon(Icons.add),
                      label: const Text('Tamu'))),
            if (canEdit) const SizedBox(width: 8),
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
              focusNode: bookSearchFocus,
              onChanged: (v) => setState(() {
                bookQ = v;
                bookLimit = 50;
              }),
              decoration: InputDecoration(
                  hintText:
                      'Cari buku tamu… (${books.length}) (Ctrl+F)',
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
                      ? 'Minta OWNER/ADMIN untuk menambah data.'
                      : 'Coba kata kunci lain.',
                  action: books.isEmpty && canEdit
                      ? FilledButton.icon(
                          onPressed: _addBookDialog,
                          icon: const Icon(Icons.person_add_outlined),
                          label: const Text('Tambah tamu pertama'),
                        )
                      : null,
                )
              : medium
                  ? SingleChildScrollView(child: _bookTable(shown))
                  : ListView.builder(
                      padding:
                          const EdgeInsets.fromLTRB(12, 4, 12, 12),
                      itemCount: shown.take(bookLimit).length + 1,
                      itemBuilder: (_, i) {
                        if (i >= shown.take(bookLimit).length) {
                          if (shown.length <= bookLimit) {
                            return Padding(
                              padding: const EdgeInsets.all(12),
                              child: Center(
                                  child: Text('Semua tampil',
                                      style: TextStyle(
                                          fontSize: 11,
                                          color: Theme.of(context)
                                              .colorScheme
                                              .onSurfaceVariant))),
                            );
                          }
                          return TextButton.icon(
                            onPressed: () =>
                                setState(() => bookLimit += 50),
                            icon: const Icon(Icons.expand_more_outlined,
                                size: 16),
                            label: Text(
                                'Muat 50 lagi (${shown.length - bookLimit} sisa)'),
                          );
                        }
                        return _bookTile(
                            shown.take(bookLimit).toList()[i], i + 1);
                      },
                    ),
        ),
        ]),
      );
    });
  }

  Future<void> _addBookDialog() async {
    if (denyViewer()) return;
    final n = TextEditingController();
    final a = TextEditingController();
    final ok = await showWideDialog<bool>(
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
        showTopSnack(context, const SnackBar(
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
    await showAdaptiveSheet(
      context: context,
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
    final ok = await showWideDialog<bool>(
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
        showTopSnack(context, const SnackBar(
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
    await showAdaptiveSheet(
      context: context,
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
    final ok = await showWideDialog<bool>(
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
    final ok = await showWideDialog<bool>(
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
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                              LengthLimitingTextInputFormatter(15),
                            ],
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
        showTopSnack(context, 
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
    if (denyViewer()) return;
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
    if (denyViewer()) return;
    final ok = await showWideDialog<bool>(
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
    await showAdaptiveSheet(
      context: context,
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
    if (denyViewer()) return;
    final id = '${b['id']}';
    final n = TextEditingController(text: '${b['nama']}');
    final a = TextEditingController(text: '${b['alamat']}');
    final ok = await showWideDialog<bool>(
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
        showTopSnack(context, 
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
    if (denyViewer()) return;
    final ok = await showWideDialog<bool>(
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
    return LayoutBuilder(builder: (context, cons) {
      final wide = WindowUi.isWide(cons.maxWidth);
      final medium = WindowUi.isMedium(cons.maxWidth);
      return ListView(
          padding: WindowUi.pagePadding(cons.maxWidth),
          children: [
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
            if (wide)
              Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                        child: Column(
                            crossAxisAlignment:
                                CrossAxisAlignment.start,
                            children: [
                          Text('Per alamat',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium),
                          _rekapAlamatTable(perAlamat),
                        ])),
                    const SizedBox(width: 12),
                    Expanded(
                        child: Column(
                            crossAxisAlignment:
                                CrossAxisAlignment.start,
                            children: [
                          Text('Per metode',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium),
                          _rekapMetodeTable(perMetode),
                        ])),
                  ])
            else if (medium) ...[
              Text('Per alamat',
                  style: Theme.of(context).textTheme.titleMedium),
              _rekapAlamatTable(perAlamat),
              const SizedBox(height: 8),
              Text('Per metode',
                  style: Theme.of(context).textTheme.titleMedium),
              _rekapMetodeTable(perMetode),
            ] else ...[
              Text('Per alamat',
                  style: Theme.of(context).textTheme.titleMedium),
              ...perAlamat.map((e) => _rekapAlamatTile(e)),
              const SizedBox(height: 8),
              Text('Per metode',
                  style: Theme.of(context).textTheme.titleMedium),
              ...perMetode.map((e) => _rekapMetodeTile(e)),
            ],
          ]);
    });
  }

  /// Tile rekap per alamat — dipakai vertikal (HP) maupun 2-kolom (desktop).
  Widget _rekapAlamatTile(Map e) => Card(
        margin: const EdgeInsets.symmetric(vertical: 4),
        child: ListTile(
          dense: true,
          leading: const Icon(Icons.location_on_outlined),
          title: Text('${e['alamat']}',
              style: const TextStyle(fontWeight: FontWeight.w600)),
          trailing:
              Text('${e['jumlah']} • ${formatRp(e['total'] as int)}'),
        ),
      );

  /// Tile rekap per metode.
  Widget _rekapMetodeTile(Map e) => Card(
        margin: const EdgeInsets.symmetric(vertical: 4),
        child: ListTile(
          dense: true,
          leading: MethodChip('${e['metode']}'),
          title: Text('${e['jumlah']} tamu',
              style: const TextStyle(fontWeight: FontWeight.w600)),
          trailing: Text(formatRp(e['total'] as int)),
        ),
      );

  /// Tabel rekap tablet/desktop: kolom ala rekap web (dipakai >=600px,
  /// stacked vertikal di tablet, side-by-side di desktop lebar).
  Widget _rekapAlamatTable(List<Map> rows) => Card(
        margin: const EdgeInsets.symmetric(vertical: 4),
        clipBehavior: Clip.antiAlias,
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 480),
            child: DataTable(
              columnSpacing: 12,
              headingRowHeight: 40,
              columns: const [
                DataColumn(label: Text('Alamat')),
                DataColumn(label: Text('Jumlah'), numeric: true),
                DataColumn(label: Text('Total'), numeric: true),
              ],
              rows: rows
                  .map((e) => DataRow(cells: [
                        DataCell(ConstrainedBox(
                          constraints: const BoxConstraints(
                              maxWidth: 220, minWidth: 120),
                          child: Text('${e['alamat']}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w600)),
                        )),
                        DataCell(Text('${e['jumlah']}')),
                        DataCell(Text(formatRp(e['total'] as int),
                            style: TextStyle(fontWeight: FontWeight.w700))),
                      ]))
                  .toList(),
            ),
          ),
        ),
      );

  Widget _rekapMetodeTable(List<Map> rows) => Card(
        margin: const EdgeInsets.symmetric(vertical: 4),
        clipBehavior: Clip.antiAlias,
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 480),
            child: DataTable(
              columnSpacing: 12,
              headingRowHeight: 40,
              columns: const [
                DataColumn(label: Text('Metode')),
                DataColumn(label: Text('Jumlah'), numeric: true),
                DataColumn(label: Text('Total'), numeric: true),
              ],
              rows: rows
                  .map((e) => DataRow(cells: [
                        DataCell(MethodChip('${e['metode']}')),
                        DataCell(Text('${e['jumlah']} tamu')),
                        DataCell(Text(formatRp(e['total'] as int),
                            style: TextStyle(fontWeight: FontWeight.w700))),
                      ]))
                  .toList(),
            ),
          ),
        ),
      );

  /// Dialog opsi export ala web + unduh/share file beneran (offline OK).
  Future<void> _exportDialog() async {
    var opt = const ExportOptions();
    var busy = '';
    await showWideDialog(
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
          showTopSnack(context, 
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
        showTopSnack(context, 
            SnackBar(content: Text('Export gagal: $e')));
      }
    }
  }
}
