import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/auth_store.dart';
import '../../core/local_db.dart';
import '../../core/sync_engine.dart';
import '../../models/models.dart';
import '../../core/window_ui.dart';
import '../../widgets/app_widgets.dart';
import '../events/events_screen.dart';

/// Pengaturan acara: info, edit (OWNER/ADMIN), meja, anggota (OWNER), hapus.
class EventSettingsScreen extends StatefulWidget {
  final EventModel event;
  const EventSettingsScreen({super.key, required this.event});
  @override
  State<EventSettingsScreen> createState() =>
      _EventSettingsScreenState();
}

class _EventSettingsScreenState extends State<EventSettingsScreen> {
  bool loading = true;
  bool saving = false;
  bool memberBusy = false;
  bool deleting = false;
  String myRole = 'VIEWER';
  List<Map<String, dynamic>> members = [];
  List<String> meja = [];
  int totalTamu = 0;
  int totalNominal = 0;
  int jmlBuku = 0;

  final namaC = TextEditingController();
  final tuanC = TextEditingController();
  final lokC = TextEditingController();
  final catC = TextEditingController();
  final tglC = TextEditingController();
  final mejaC = TextEditingController();
  final searchC = TextEditingController();
  String addRole = 'ADMIN';
  List<Map<String, dynamic>> searchResults = [];
  bool searching = false;
  bool searchNetError = false;
  Timer? _debounce;
  String? _busyUserId;
  DateTime? tanggal;

  bool get canEdit => myRole == 'OWNER' || myRole == 'ADMIN';
  bool get isOwner => myRole == 'OWNER';

  @override
  void initState() {
    super.initState();
    final e = widget.event;
    namaC.text = e.namaAcara;
    tuanC.text = e.namaTuanRumah ?? '';
    lokC.text = e.lokasi ?? '';
    catC.text = e.catatan ?? '';
    tanggal = e.tanggal;
    tglC.text = e.tanggal.toLocal().toString().split(' ').first;
    meja = [...e.mejaList];
    myRole = e.myRole;
    _load();
  }

  @override
  void dispose() {
    namaC.dispose();
    tuanC.dispose();
    lokC.dispose();
    catC.dispose();
    tglC.dispose();
    mejaC.dispose();
    searchC.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final dio = await ApiClient.instance.dio();
      final r = await dio.get('/api/events/${widget.event.id}');
      final j = Map<String, dynamic>.from(r.data as Map);
      if (!mounted) return;
      final user = await AuthStore.cachedUser();
      final myId = '${user?['id'] ?? ''}';
      String role = 'VIEWER';
      final ms = (j['members'] as List? ?? []).cast<Map<String, dynamic>>();
      for (final m in ms) {
        if ('${(m['user'] as Map?)?['id'] ?? m['userId']}' == myId) {
          role = '${m['role'] ?? 'VIEWER'}';
        }
      }
      final ml = (j['mejaList'] as List?)?.map((e) => '$e').toList();
      setState(() {
        myRole = role;
        members = ms;
        if (ml != null && ml.isNotEmpty) meja = ml;
        totalTamu = (j['totalTamu'] as int?) ?? 0;
        totalNominal = (j['totalNominal'] as int?) ?? 0;
        jmlBuku = (j['_count'] as Map?)?['guestBooks'] as int? ?? 0;
        namaC.text = '${j['namaAcara'] ?? namaC.text}';
        tuanC.text = '${j['namaTuanRumah'] ?? ''}';
        lokC.text = '${j['lokasi'] ?? ''}';
        catC.text = '${j['catatan'] ?? ''}';
        final t = DateTime.tryParse('${j['tanggal'] ?? ''}');
        if (t != null) {
          tanggal = t;
          tglC.text = t.toLocal().toString().split(' ').first;
        }
        loading = false;
      });
      await LocalDb.instance.setMyRole(widget.event.id, role);
    } catch (_) {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _saveInfo() async {
    if (namaC.text.trim().length < 2) {
      _snack('Nama acara minimal 2 huruf');
      return;
    }
    setState(() => saving = true);
    final fields = <String, dynamic>{
      'namaAcara': namaC.text.trim(),
      if (tuanC.text.trim().isNotEmpty)
        'namaTuanRumah': tuanC.text.trim(),
      if (lokC.text.trim().isNotEmpty) 'lokasi': lokC.text.trim(),
      if (catC.text.trim().isNotEmpty) 'catatan': catC.text.trim(),
      if (tanggal != null) 'tanggal': tanggal!.toIso8601String(),
      'mejaList': meja,
    };
    try {
      final dio = await ApiClient.instance.dio();
      await dio.patch('/api/events/${widget.event.id}', data: fields);
      await LocalDb.instance.outboxRemove(
          (await LocalDb.instance.outboxList(widget.event.id))
              .where((o) => o['action'] == 'UPDATE_EVENT')
              .map((o) => '${o['id']}')
              .toList());
      _snack('Acara tersimpan ✓');
    } on DioException catch (e) {
      final offline = e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout;
      if (!offline) {
        _snack(serverMsg(e));
      } else {
        // offline: antrekan sebagai UPDATE_EVENT
        await LocalDb.instance.enqueue(widget.event.id,
            'UPDATE_EVENT', 'events', {
          'id': widget.event.id,
          'fields': fields
        });
        await SyncEngine.instance.pending(widget.event.id);
        _snack('Offline — perubahan antre, auto-sync nanti');
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _pickDate() async {
    final d = await showDatePicker(
      context: context,
      initialDate: tanggal ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
    );
    if (d != null) {
      setState(() {
        tanggal = d;
        tglC.text = d.toLocal().toString().split(' ').first;
      });
    }
  }

  /// Search user ala web: ketik min 2 huruf (nama/username/email),
  /// debounce, tampilkan breakdown avatar + nama + email · @username.
  /// Wajib pilih dari hasil — tidak ada tambah via email manual.
  void _onSearchChanged(String v) {
    _debounce?.cancel();
    final q = v.trim();
    if (q.length < 2) {
      setState(() {
        searchResults = [];
        searching = false;
        searchNetError = false;
      });
      return;
    }
    setState(() => searching = true);
    _debounce = Timer(const Duration(milliseconds: 350), () => _searchNow(q));
  }

  Future<void> _searchNow(String q) async {
    final res = await ApiClient.instance.searchUsers(q);
    if (!mounted) return;
    // Abaikan hasil basi bila user sudah mengetik lain.
    if (searchC.text.trim() != q) return;
    setState(() {
      searchResults = res.users;
      searchNetError = res.netError;
      searching = false;
    });
  }

  /// PUTUS vs DITOLAK: error jaringan → antrekan; 403 aturan server → pesan jelas.
  bool _isNetErr(DioException e) =>
      e.type == DioExceptionType.connectionError ||
      e.type == DioExceptionType.connectionTimeout ||
      e.type == DioExceptionType.receiveTimeout;

  /// Adaptif: coba kirim langsung; jaringan putus → antre (auto-sync nanti).
  Future<void> _addMemberById(String userId) async {
    setState(() {
      memberBusy = true;
      _busyUserId = userId;
    });
    try {
      final dio = await ApiClient.instance.dio();
      await dio.post('/api/events/${widget.event.id}/members', data: {
        'userId': userId,
        'role': addRole,
      });
      searchC.clear();
      setState(() {
        searchResults = [];
        searching = false;
        searchNetError = false;
      });
      await _load();
      _snack('Anggota ditambah ✓');
    } on DioException catch (e) {
      if (_isNetErr(e)) {
        await LocalDb.instance.enqueue(widget.event.id, 'ADD_MEMBER',
            'members', {'userId': userId, 'role': addRole});
        await SyncEngine.instance.pending(widget.event.id);
        searchC.clear();
        if (mounted) {
          setState(() {
            searchResults = [];
            searching = false;
            searchNetError = false;
          });
        }
        _snack('Offline — tambah anggota antre, auto-sync nanti');
      } else {
        _snack(serverMsg(e));
      }
    } finally {
      if (mounted) {
        setState(() {
          memberBusy = false;
          _busyUserId = null;
        });
      }
    }
  }

  Future<void> _setRole(String userId, String role) async {
    setState(() => memberBusy = true);
    try {
      final dio = await ApiClient.instance.dio();
      await dio.patch('/api/events/${widget.event.id}/members',
          data: {'userId': userId, 'role': role});
      await _load();
      _snack('Peran diubah ✓');
    } on DioException catch (e) {
      if (_isNetErr(e)) {
        await LocalDb.instance.enqueue(widget.event.id, 'SET_ROLE',
            'members', {'userId': userId, 'role': role});
        await SyncEngine.instance.pending(widget.event.id);
        _snack('Offline — ubah peran antre, auto-sync nanti');
      } else {
        _snack(serverMsg(e));
      }
    } finally {
      if (mounted) setState(() => memberBusy = false);
    }
  }

  Future<void> _removeMember(String userId, String name) async {
    final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
              title: const Text('Hapus anggota?'),
              content: Text('$name tidak bisa akses acara ini lagi.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Batal')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Hapus')),
              ],
            ));
    if (ok != true) return;
    if (!mounted) return;
    setState(() => memberBusy = true);
    try {
      final dio = await ApiClient.instance.dio();
      await dio.delete('/api/events/${widget.event.id}/members',
          queryParameters: {'userId': userId});
      await _load();
      _snack('Anggota dihapus');
    } on DioException catch (e) {
      if (_isNetErr(e)) {
        await LocalDb.instance.enqueue(widget.event.id, 'REMOVE_MEMBER',
            'members', {'userId': userId});
        await SyncEngine.instance.pending(widget.event.id);
        await _load();
        _snack('Offline — hapus anggota antre, auto-sync nanti');
      } else {
        _snack(serverMsg(e));
      }
    } finally {
      if (mounted) setState(() => memberBusy = false);
    }
  }

  Future<void> _deleteEvent() async {
    final c = TextEditingController(text: '');
    final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
              title: const Text('Hapus acara permanen?'),
              content: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text(
                    'Semua tamu, buku tamu, dan log ikut terhapus. Ketik HAPUS untuk konfirmasi.'),
                const SizedBox(height: 8),
                TextField(controller: c),
              ]),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Batal')),
                FilledButton(
                    style: FilledButton.styleFrom(
                        backgroundColor:
                            Theme.of(context).colorScheme.error,
                        foregroundColor:
                            Theme.of(context).colorScheme.onError),
                    onPressed: () =>
                        Navigator.pop(context, c.text.trim() == 'HAPUS'),
                    child: const Text('Hapus')),
              ],
            ));
    if (ok != true) return;
    if (!mounted) return;
    // ignore: use_build_context_synchronously
    if (!await ensureOnline(context)) return;
    setState(() => deleting = true);
    try {
      final dio = await ApiClient.instance.dio();
      await dio.delete('/api/events/${widget.event.id}');
      // Bersihkan cache lokal juga — kalau tidak, baris hantu tetap
      // tampil saat offline dan terus di-sync sia-sia.
      await LocalDb.instance.deleteEventLocal(widget.event.id);
      if (!mounted) return;
      // Fallback kembali: pop semua sampai daftar acara. Kalau layar ini
      // ternyata rute pertama (dibuka langsung), ganti ke daftar acara.
      final nav = Navigator.of(context);
      nav.popUntil((route) => route.isFirst);
      if (mounted) {
        nav.pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const EventsScreen()),
          (_) => false,
        );
      }
      showTopSnack(
          nav.context, const SnackBar(content: Text('Acara dihapus')));
      // Picu refresh daftar (events screen reload dari cache lokal).
      unawaited(SyncEngine.instance.flushAll());
    } on DioException catch (e) {
      _snack(serverMsg(e));
    } finally {
      if (mounted) setState(() => deleting = false);
    }
  }

  void _snack(String m) {
    if (!mounted) return;
    showTopSnack(context, SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pengaturan Acara'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(child: RoleChip(myRole)),
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : LayoutBuilder(builder: (context, cons) {
              final wide = WindowUi.isWide(cons.maxWidth);
              return ListView(
                  padding: WindowUi.pagePadding(cons.maxWidth),
                  children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(children: [
                    const Icon(Icons.groups_outlined, size: 32),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                          crossAxisAlignment:
                              CrossAxisAlignment.start,
                          children: [
                            Text('$totalTamu tamu • $jmlBuku buku',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700)),
                            Text('Total Rp $totalNominal',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall),
                          ]),
                    ),
                  ]),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Info acara',
                            style: Theme.of(context)
                                .textTheme
                                .titleSmall),
                        const SizedBox(height: 12),
                        if (wide)
                          Row(
                              crossAxisAlignment:
                                  CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                    child: TextField(
                                        controller: namaC,
                                        enabled: canEdit,
                                        textCapitalization:
                                            TextCapitalization.words,
                                        decoration:
                                            const InputDecoration(
                                                labelText:
                                                    'Nama acara',
                                                border:
                                                    OutlineInputBorder(),
                                                filled: true,
                                                prefixIcon: Icon(Icons
                                                    .celebration_outlined)))),
                                const SizedBox(width: 12),
                                Expanded(
                                    child: TextField(
                                        controller: tuanC,
                                        enabled: canEdit,
                                        textCapitalization:
                                            TextCapitalization.words,
                                        decoration:
                                            const InputDecoration(
                                                labelText:
                                                    'Tuan rumah',
                                                border:
                                                    OutlineInputBorder(),
                                                filled: true,
                                                prefixIcon: Icon(Icons
                                                    .person_outline)))),
                              ])
                        else ...[
                          TextField(
                              controller: namaC,
                              enabled: canEdit,
                              textCapitalization:
                                  TextCapitalization.words,
                              decoration: const InputDecoration(
                                  labelText: 'Nama acara',
                                  border: OutlineInputBorder(),
                                  filled: true,
                                  prefixIcon: Icon(
                                      Icons.celebration_outlined))),
                          const SizedBox(height: 12),
                          TextField(
                              controller: tuanC,
                              enabled: canEdit,
                              textCapitalization:
                                  TextCapitalization.words,
                              decoration: const InputDecoration(
                                  labelText: 'Tuan rumah',
                                  border: OutlineInputBorder(),
                                  filled: true,
                                  prefixIcon:
                                      Icon(Icons.person_outline))),
                        ],
                        const SizedBox(height: 12),
                        if (wide)
                          Row(
                              crossAxisAlignment:
                                  CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                    child: TextField(
                                        controller: tglC,
                                        enabled: canEdit,
                                        readOnly: true,
                                        onTap: canEdit
                                            ? _pickDate
                                            : null,
                                        decoration:
                                            const InputDecoration(
                                                labelText:
                                                    'Tanggal',
                                                border:
                                                    OutlineInputBorder(),
                                                filled: true,
                                                prefixIcon: Icon(Icons
                                                    .calendar_month_outlined)))),
                                const SizedBox(width: 12),
                                Expanded(
                                    child: TextField(
                                        controller: lokC,
                                        enabled: canEdit,
                                        textCapitalization:
                                            TextCapitalization.words,
                                        decoration:
                                            const InputDecoration(
                                                labelText: 'Lokasi',
                                                border:
                                                    OutlineInputBorder(),
                                                filled: true,
                                                prefixIcon: Icon(Icons
                                                    .location_on_outlined)))),
                              ])
                        else ...[
                          TextField(
                              controller: tglC,
                              enabled: canEdit,
                              readOnly: true,
                              onTap: canEdit ? _pickDate : null,
                              decoration: const InputDecoration(
                                  labelText: 'Tanggal',
                                  border: OutlineInputBorder(),
                                  filled: true,
                                  prefixIcon: Icon(
                                      Icons.calendar_month_outlined))),
                          const SizedBox(height: 12),
                          TextField(
                              controller: lokC,
                              enabled: canEdit,
                              textCapitalization:
                                  TextCapitalization.words,
                              decoration: const InputDecoration(
                                  labelText: 'Lokasi',
                                  border: OutlineInputBorder(),
                                  filled: true,
                                  prefixIcon:
                                      Icon(Icons.location_on_outlined))),
                        ],
                        const SizedBox(height: 12),
                        TextField(
                            controller: catC,
                            enabled: canEdit,
                            maxLines: 2,
                            decoration: const InputDecoration(
                                labelText: 'Catatan',
                                border: OutlineInputBorder(),
                                filled: true,
                                prefixIcon:
                                    Icon(Icons.note_outlined))),
                        if (canEdit) ...[
                          const SizedBox(height: 12),
                          FilledButton.icon(
                            onPressed:
                                saving ? null : _saveInfo,
                            icon: const Icon(Icons.save_outlined),
                            label: const Text('Simpan Perubahan'),
                          ),
                        ] else
                          const Padding(
                            padding: EdgeInsets.only(top: 8),
                            child: Text(
                                'Mode lihat saja — kamu VIEWER di acara ini.',
                                style: TextStyle(fontSize: 12)),
                          ),
                      ]),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Meja kasir (${meja.length})',
                            style: Theme.of(context)
                                .textTheme
                                .titleSmall),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: meja
                              .map((m) => Chip(
                                    label: Text(m),
                                    deleteIcon: canEdit
                                        ? const Icon(Icons.close,
                                            size: 16)
                                        : null,
                                    onDeleted: canEdit
                                        ? () => setState(() =>
                                            meja.remove(m))
                                        : null,
                                  ))
                              .toList(),
                        ),
                        if (canEdit) ...[
                          const SizedBox(height: 8),
                          Row(children: [
                            Expanded(
                              child: TextField(
                                  controller: mejaC,
                                  textCapitalization:
                                      TextCapitalization
                                          .characters,
                                  decoration: const InputDecoration(
                                      labelText: 'MEJA-3…',
                                      border:
                                          OutlineInputBorder(),
                                      filled: true,
                                      isDense: true)),
                            ),
                            const SizedBox(width: 8),
                            FilledButton.tonalIcon(
                              onPressed: () {
                                final v = mejaC.text
                                    .trim()
                                    .toUpperCase();
                                if (v.isEmpty) return;
                                if (meja.length >= 10) {
                                  _snack('Maksimal 10 meja');
                                  return;
                                }
                                if (meja.contains(v)) return;
                                setState(() {
                                  meja.add(v);
                                  mejaC.clear();
                                });
                              },
                              icon: const Icon(Icons.add),
                              label: const Text('Tambah'),
                            ),
                          ]),
                          const Text(
                              'Jangan lupa Simpan Perubahan di Info acara.',
                              style: TextStyle(fontSize: 11)),
                        ],
                      ]),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Anggota (${members.length})',
                            style: Theme.of(context)
                                .textTheme
                                .titleSmall),
                        const SizedBox(height: 8),
                        ...members.map((m) {
                          final u =
                              (m['user'] as Map?) ?? {};
                          final uid = '${u['id'] ?? ''}';
                          final role = '${m['role'] ?? ''}';
                          return ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            leading: CircleAvatar(
                                child: Text(
                                    ('${u['name'] ?? '?'}').isNotEmpty
                                        ? '${u['name']}'
                                            .substring(0, 1)
                                            .toUpperCase()
                                        : '?')),
                            title: Text(
                                '${u['name'] ?? '-'}',
                                style: const TextStyle(
                                    fontWeight:
                                        FontWeight.w600)),
                            subtitle:
                                Text('${u['email'] ?? ''}'),
                            trailing: isOwner
                                ? Row(
                                    mainAxisSize:
                                        MainAxisSize.min,
                                    children: [
                                      DropdownButton<String>(
                                        value: [
                                          'OWNER',
                                          'ADMIN',
                                          'VIEWER'
                                        ].contains(role)
                                            ? role
                                            : 'VIEWER',
                                        items: const [
                                          DropdownMenuItem(
                                              value: 'OWNER',
                                              child:
                                                  Text('OWNER')),
                                          DropdownMenuItem(
                                              value: 'ADMIN',
                                              child:
                                                  Text('ADMIN')),
                                          DropdownMenuItem(
                                              value: 'VIEWER',
                                              child:
                                                  Text('VIEWER')),
                                        ],
                                        onChanged: memberBusy
                                            ? null
                                            : (v) {
                                                if (v != null &&
                                                    v != role) {
                                                  _setRole(uid, v);
                                                }
                                              },
                                      ),
                                      IconButton(
                                        tooltip: 'Hapus',
                                        icon: memberBusy
                                            ? const SizedBox(
                                                width: 18,
                                                height: 18,
                                                child:
                                                    CircularProgressIndicator(
                                                        strokeWidth: 2))
                                            : const Icon(
                                                Icons
                                                    .person_remove_outlined,
                                                size: 20),
                                        onPressed: memberBusy
                                            ? null
                                            : () =>
                                                _removeMember(uid,
                                                    '${u['name'] ?? ''}'),
                                      ),
                                    ],
                                  )
                                : RoleChip(role),
                          );
                        }),
                        if (isOwner) ...[
                          const Divider(),
                          Row(children: [
                            Expanded(
                              child: TextField(
                                  controller: searchC,
                                  keyboardType: TextInputType.text,
                                  textInputAction: TextInputAction.search,
                                  onChanged: _onSearchChanged,
                                  decoration: InputDecoration(
                                      labelText:
                                          'Cari anggota (nama/username/email)',
                                      hintText:
                                          'Ketik min 2 huruf…',
                                      border:
                                          const OutlineInputBorder(),
                                      filled: true,
                                      isDense: true,
                                      prefixIcon: searching
                                          ? const SizedBox(
                                              width: 18,
                                              height: 18,
                                              child: Padding(
                                                  padding:
                                                      EdgeInsets.all(
                                                          12),
                                                  child:
                                                      CircularProgressIndicator(
                                                          strokeWidth:
                                                              2)))
                                          : const Icon(Icons
                                              .search_outlined),
                                      suffixIcon:
                                          searchC.text.isEmpty
                                              ? null
                                              : IconButton(
                                                  tooltip: 'Bersihkan',
                                                  icon: const Icon(Icons
                                                      .clear_outlined),
                                                  onPressed: () {
                                                    searchC.clear();
                                                    setState(() {
                                                      searchResults =
                                                          [];
                                                      searching =
                                                          false;
                                                      searchNetError =
                                                          false;
                                                    });
                                                  }))),
                            ),
                            const SizedBox(width: 8),
                            DropdownButton<String>(
                              value: addRole,
                              items: const [
                                DropdownMenuItem(
                                    value: 'ADMIN',
                                    child: Text('ADMIN')),
                                DropdownMenuItem(
                                    value: 'OWNER',
                                    child: Text('OWNER')),
                                DropdownMenuItem(
                                    value: 'VIEWER',
                                    child: Text('VIEWER')),
                              ],
                              onChanged: (v) {
                                if (v != null) {
                                  setState(
                                      () => addRole = v);
                                }
                              },
                            ),
                          ]),
                          const SizedBox(height: 8),
                          if (searching)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 4),
                              child: Row(children: [
                                SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2)),
                                SizedBox(width: 8),
                                Text('Mencari…',
                                    style: TextStyle(fontSize: 12)),
                              ]),
                            ),
                          if (!searching &&
                              searchC.text.trim().length >= 2 &&
                              searchResults.isEmpty)
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                  vertical: 4),
                              child: Row(
                                crossAxisAlignment:
                                    CrossAxisAlignment.start,
                                children: [
                                  Icon(
                                    searchNetError
                                        ? Icons.cloud_off_outlined
                                        : Icons.search_off_outlined,
                                    size: 20,
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                        searchNetError
                                            ? 'Server tak terjangkau — cek URL server / koneksi internet, lalu ketik ulang.'
                                            : 'Tidak ketemu "${searchC.text.trim()}" — coba nama, username, atau email lain.',
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall),
                                  ),
                                ],
                              ),
                            ),
                          if (searchResults.isNotEmpty)
                            Container(
                              margin:
                                  const EdgeInsets.only(top: 4),
                              decoration: BoxDecoration(
                                  border: Border.all(
                                      color: Theme.of(context)
                                          .colorScheme
                                          .outlineVariant),
                                  borderRadius:
                                      BorderRadius.circular(12)),
                              child: Column(
                                children: searchResults.map((u) {
                                  final uid = '${u['id'] ?? ''}';
                                  final name =
                                      '${u['name'] ?? '-'}';
                                  final email =
                                      '${u['email'] ?? ''}';
                                  final username =
                                      (u['username'] as String?)
                                              ?.trim() ??
                                          '';
                                  final busyThis =
                                      memberBusy &&
                                          _busyUserId == uid;
                                  return ListTile(
                                    dense: true,
                                    leading: CircleAvatar(
                                        child: Text(name.isNotEmpty
                                            ? name
                                                .substring(0, 1)
                                                .toUpperCase()
                                            : '?')),
                                    title: Text(name,
                                        style: const TextStyle(
                                            fontWeight:
                                                FontWeight.w600)),
                                    subtitle: Text(username.isEmpty
                                        ? email
                                        : '$email · @$username'),
                                    trailing: FilledButton.tonal(
                                      onPressed: (memberBusy)
                                          ? null
                                          : () =>
                                              _addMemberById(uid),
                                      child: busyThis
                                          ? const SizedBox(
                                              width: 16,
                                              height: 16,
                                              child:
                                                  CircularProgressIndicator(
                                                      strokeWidth:
                                                          2))
                                          : const Text('Tambah'),
                                    ),
                                  );
                                }).toList(),
                              ),
                            ),
                        ],
                      ]),
                ),
              ),
              if (isOwner) ...[
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                      foregroundColor:
                          Theme.of(context).colorScheme.error),
                  onPressed: deleting ? null : _deleteEvent,
                  icon: deleting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2))
                      : const Icon(
                          Icons.delete_forever_outlined),
                  label: Text(
                      deleting ? 'Menghapus…' : 'Hapus Acara Permanen'),
                ),
              ],
                  ]);
              }),
    );
  }
}
