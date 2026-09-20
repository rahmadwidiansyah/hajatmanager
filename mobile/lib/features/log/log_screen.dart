import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/api_client.dart';
import '../../core/window_ui.dart';
import '../../widgets/error_screen.dart';
import '../../widgets/skeleton_list.dart';

const _aksiList = [
  'Semua',
  'CREATE_GUEST',
  'UPDATE_GUEST',
  'DELETE_GUEST',
  'CREATE_EVENT',
  'UPDATE_EVENT',
  'SYNC_ONLINE',
  'PUSH_SYNC',
];

/// Log aktivitas acara (server-only, butuh online).
/// Mirror GET /api/events/[id]/audit-logs.
///
/// v2: data lama tetap tampil saat filter berubah atau refresh —
/// tidak ada flash kosong. Spinner kecil di AppBar menggantikan
/// CircularProgressIndicator yang memblok seluruh list.
class LogScreen extends StatefulWidget {
  final String eventId;
  final String eventName;
  const LogScreen({
    super.key,
    required this.eventId,
    required this.eventName,
  });
  @override
  State<LogScreen> createState() => _LogScreenState();
}

class _LogScreenState extends State<LogScreen> {
  List<Map<String, dynamic>> logs = [];
  int page = 1;
  int total = 0;

  // _firstLoad: true sebelum data pertama berhasil dimuat.
  // Skeleton muncul HANYA saat _firstLoad=true && logs kosong.
  // Setelah itu, data lama tetap tampil saat refetch.
  bool _firstLoad = true;

  // _refreshing: true saat fetch berjalan untuk reset (bukan next page).
  // Dipakai untuk spinner kecil di AppBar — tidak blok list.
  bool _refreshing = false;

  bool more = false;
  String aksi = 'Semua';
  String q = '';
  String? error;
  int? errorStatus;
  final searchFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    _load(reset: true);
  }

  @override
  void dispose() {
    searchFocus.dispose();
    super.dispose();
  }

  Future<void> _load({bool reset = false, bool next = false}) async {
    if (reset) {
      // TIDAK hapus logs dulu — data lama tetap tampil sampai data baru siap.
      // Hanya set _refreshing=true untuk spinner kecil di AppBar.
      if (mounted) {
        setState(() {
          _refreshing = true;
          error = null;
          // Jangan: logs = []; page = 1; — menyebabkan flash kosong.
        });
      }
    } else if (next) {
      if (mounted) setState(() => more = true);
    }

    try {
      final dio = await ApiClient.instance.dio();
      final r = await dio.get(
        '/api/events/${widget.eventId}/audit-logs',
        queryParameters: {
          'page': '${next ? page + 1 : 1}',
          'limit': '30',
          if (aksi != 'Semua') 'aksi': aksi,
          if (q.trim().isNotEmpty) 'q': q.trim(),
        },
      );
      final j = Map<String, dynamic>.from(r.data as Map);
      final list = (j['logs'] as List? ?? []).cast<Map<String, dynamic>>();
      if (!mounted) return;
      setState(() {
        if (next) {
          page += 1;
          logs.addAll(list);
        } else {
          // Replace data lama dengan yang baru — instan, tidak ada jeda kosong.
          page = 1;
          logs = list;
        }
        total = (j['total'] as int?) ?? logs.length;
        _firstLoad = false;
        _refreshing = false;
        more = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      final offline = e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout;
      setState(() {
        _firstLoad = false;
        _refreshing = false;
        more = false;
        errorStatus = offline ? null : e.response?.statusCode;
        error = offline
            ? 'Log butuh koneksi — data aman, coba lagi saat online.'
            : 'Gagal memuat log (${e.response?.statusCode ?? '?'})';
        // TIDAK hapus logs — biarkan data lama tetap tampil saat error.
        // Error hanya tampil sebagai banner di atas list.
      });
    }
  }

  IconData _icon(String a) {
    if (a.startsWith('CREATE')) return Icons.person_add_outlined;
    if (a.startsWith('UPDATE')) return Icons.edit_outlined;
    if (a.startsWith('DELETE')) return Icons.delete_outline;
    if (a.contains('SYNC') || a.contains('PUSH')) {
      return Icons.cloud_upload_outlined;
    }
    return Icons.history_outlined;
  }

  String _when(Map<String, dynamic> l) {
    final dt = DateTime.tryParse('${l['createdAt'] ?? ''}')?.toLocal();
    if (dt == null) return '';
    return '${dt.day}/${dt.month} '
        '${dt.hour.toString().padLeft(2, '0')}:'
        '${dt.minute.toString().padLeft(2, '0')}';
  }

  Widget _pagerFooter(BuildContext context) {
    if (logs.length >= total || total == 0) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Center(
          child: Text(
            '$total aktivitas',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Center(
        child: FilledButton.tonalIcon(
          onPressed: more ? null : () => _load(next: true),
          icon: more
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.expand_more_outlined),
          label: const Text('Muat lagi'),
        ),
      ),
    );
  }

  Widget _logCard(Map<String, dynamic> l, ColorScheme scheme) {
    final u = (l['user'] as Map?) ?? {};
    final a = '${l['aksi'] ?? '-'}';
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        dense: true,
        leading: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: scheme.secondaryContainer,
            shape: BoxShape.circle,
          ),
          child: Icon(_icon(a), size: 18, color: scheme.onSecondaryContainer),
        ),
        title: Text(
          a,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
        ),
        subtitle: Text('${u['name'] ?? u['email'] ?? '?'} • ${_when(l)}'),
      ),
    );
  }

  Widget _logTable() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        columns: const [
          DataColumn(label: Text('Aksi')),
          DataColumn(label: Text('Pelaku')),
          DataColumn(label: Text('Waktu')),
        ],
        rows: logs.map((l) {
          final u = (l['user'] as Map?) ?? {};
          final a = '${l['aksi'] ?? '-'}';
          return DataRow(cells: [
            DataCell(Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(_icon(a), size: 18),
                const SizedBox(width: 8),
                Text(a, style: const TextStyle(fontWeight: FontWeight.w600)),
              ],
            )),
            DataCell(Text('${u['name'] ?? u['email'] ?? '?'}')),
            DataCell(Text(_when(l))),
          ]);
        }).toList(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyF, control: true): () =>
            searchFocus.requestFocus(),
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text('Log • ${widget.eventName}'),
          actions: [
            // Spinner kecil di AppBar — tidak blok list saat refresh.
            if (_refreshing)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 12),
                child: Center(
                  child: SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              ),
          ],
        ),
        body: LayoutBuilder(
          builder: (context, cons) {
            final wide = WindowUi.isWide(cons.maxWidth);
            final pad = WindowUi.pagePadding(cons.maxWidth);
            return Column(
              children: [
                // Error banner — tampil di atas list, TIDAK hapus list.
                if (error != null)
                  Material(
                    color: scheme.errorContainer,
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(pad.left, 8, pad.right, 8),
                      child: Row(
                        children: [
                          Icon(
                            Icons.cloud_off_outlined,
                            size: 18,
                            color: scheme.onErrorContainer,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              error!,
                              style: TextStyle(
                                color: scheme.onErrorContainer,
                                fontSize: 13,
                              ),
                            ),
                          ),
                          TextButton(
                            onPressed: () => _load(reset: true),
                            child: const Text('Coba lagi'),
                          ),
                        ],
                      ),
                    ),
                  ),
                Padding(
                  padding: EdgeInsets.fromLTRB(pad.left, 12, pad.right, 4),
                  child: TextField(
                    focusNode: searchFocus,
                    onChanged: (v) => setState(() => q = v),
                    onSubmitted: (_) => _load(reset: true),
                    decoration: const InputDecoration(
                      hintText: 'Cari aksi / nama / tamu… (Ctrl+F)',
                      border: OutlineInputBorder(),
                      filled: true,
                      isDense: true,
                      prefixIcon: Icon(Icons.search_outlined),
                    ),
                  ),
                ),
                SizedBox(
                  height: 44,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: EdgeInsets.symmetric(horizontal: pad.left),
                    children: _aksiList
                        .map(
                          (a) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: FilterChip(
                              label: Text(
                                a == 'Semua' ? a : a.split('_').last,
                              ),
                              selected: aksi == a,
                              onSelected: (_) {
                                setState(() => aksi = a);
                                _load(reset: true);
                              },
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ),
                const SizedBox(height: 4),
                Expanded(child: _buildBody(wide, pad, scheme)),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildBody(bool wide, EdgeInsets pad, ColorScheme scheme) {
    // Skeleton: hanya saat pertama kali load DAN belum ada data sama sekali.
    if (_firstLoad && logs.isEmpty) {
      return ListView(
        padding: EdgeInsets.fromLTRB(pad.left, 4, pad.right, 24),
        children: const [SkeletonList(count: 8, itemHeight: 60)],
      );
    }

    // Error penuh: hanya tampil kalau logs benar-benar kosong
    // (sudah di-handle sebagai banner di atas saat logs ada).
    if (error != null && logs.isEmpty) {
      return ErrorBody(
        icon: errorStatus == null
            ? Icons.cloud_off_outlined
            : errorStatus == 404
            ? Icons.search_off_outlined
            : errorStatus == 403
            ? Icons.lock_outlined
            : errorStatus != null && errorStatus! >= 500
            ? Icons.error_outline_outlined
            : Icons.cloud_off_outlined,
        title: errorStatus == null
            ? 'Belum bisa memuat'
            : errorStatus == 404
            ? 'Tidak ketemu di server'
            : errorStatus == 403
            ? 'Tidak punya izin'
            : errorStatus != null && errorStatus! >= 500
            ? 'Server bermasalah'
            : 'Belum bisa memuat',
        subtitle: error,
        primaryLabel: 'Coba lagi',
        onPrimary: () => _load(reset: true),
      );
    }

    // List normal — data lama tetap tampil saat _refreshing=true.
    return RefreshIndicator(
      onRefresh: () => _load(reset: true),
      child: wide
          ? ListView(
              padding: EdgeInsets.fromLTRB(pad.left, 4, pad.right, 24),
              children: [
                Card(
                  margin: EdgeInsets.zero,
                  clipBehavior: Clip.antiAlias,
                  child: _logTable(),
                ),
                _pagerFooter(context),
              ],
            )
          : ListView.builder(
              padding: EdgeInsets.fromLTRB(pad.left, 4, pad.right, 24),
              itemCount: logs.length + 1,
              itemBuilder: (_, i) {
                if (i >= logs.length) return _pagerFooter(context);
                return _logCard(logs[i], scheme);
              },
            ),
    );
  }
}
