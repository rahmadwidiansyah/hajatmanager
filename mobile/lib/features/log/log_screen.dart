import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/api_client.dart';
import '../../core/window_ui.dart';
import '../../widgets/error_screen.dart';

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
class LogScreen extends StatefulWidget {
  final String eventId;
  final String eventName;
  const LogScreen(
      {super.key, required this.eventId, required this.eventName});
  @override
  State<LogScreen> createState() => _LogScreenState();
}

class _LogScreenState extends State<LogScreen> {
  List<Map<String, dynamic>> logs = [];
  int page = 1;
  int total = 0;
  bool loading = true;
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
      setState(() {
        loading = true;
        page = 1;
        logs = [];
        error = null;
      });
    } else if (next) {
      setState(() => more = true);
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
          });
      final j = Map<String, dynamic>.from(r.data as Map);
      final list =
          ((j['logs'] as List? ?? []).cast<Map<String, dynamic>>());
      if (!mounted) return;
      setState(() {
        if (next) {
          page += 1;
          logs.addAll(list);
        } else {
          page = 1;
          logs = list;
        }
        total = (j['total'] as int?) ?? logs.length;
        loading = false;
        more = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      final offline = e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout;
      setState(() {
        loading = false;
        more = false;
        errorStatus = offline ? null : e.response?.statusCode;
        error = offline
            ? 'Log butuh koneksi — data aman, coba lagi saat online.'
            : 'Gagal memuat log (${e.response?.statusCode ?? '?'})';
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
    final dt =
        DateTime.tryParse('${l['createdAt'] ?? ''}')?.toLocal();
    if (dt == null) return '';
    return '${dt.day}/${dt.month} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  Widget _pagerFooter(BuildContext context) {
    if (logs.length >= total || total == 0) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Center(
            child: Text('$total aktivitas',
                style: Theme.of(context).textTheme.bodySmall)),
      );
    }
    return Padding(
      padding: const EdgeInsets.all(12),
      child: FilledButton.tonalIcon(
        onPressed: more ? null : () => _load(next: true),
        icon: more
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.expand_more_outlined),
        label: const Text('Muat lagi'),
      ),
    );
  }

  /// Baris kartu (HP) — dipertahankan untuk layar sempit.
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
          child: Icon(_icon(a),
              size: 18, color: scheme.onSecondaryContainer),
        ),
        title: Text(a,
            style:
                const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
        subtitle:
            Text('${u['name'] ?? u['email'] ?? '?'} • ${_when(l)}'),
      ),
    );
  }

  /// Tabel desktop (>=900px): kolom Aksi/Pelaku/Waktu ala rekap web.
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
                Text(a,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
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
    // Ctrl+F fokus ke pencarian — standar app desktop.
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyF, control: true):
            () => searchFocus.requestFocus(),
      },
      child: Scaffold(
        appBar: AppBar(title: Text('Log • ${widget.eventName}')),
        // LayoutBuilder agar resize window desktop update live.
        body: LayoutBuilder(builder: (context, cons) {
          final wide = WindowUi.isWide(cons.maxWidth);
          final pad = WindowUi.pagePadding(cons.maxWidth);
          return Column(children: [
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
                    prefixIcon: Icon(Icons.search_outlined)),
              ),
            ),
            SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: EdgeInsets.symmetric(horizontal: pad.left),
                children: _aksiList
                    .map((a) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: FilterChip(
                            label: Text(a == 'Semua' ? a : a.split('_').last),
                            selected: aksi == a,
                            onSelected: (_) {
                              setState(() => aksi = a);
                              _load(reset: true);
                            },
                          ),
                        ))
                    .toList(),
              ),
            ),
            const SizedBox(height: 4),
            Expanded(
              child: loading
                  ? const Center(child: CircularProgressIndicator())
                  : error != null && logs.isEmpty
                      ? ErrorBody(
                          icon: errorStatus == null
                              ? Icons.cloud_off_outlined
                              : errorStatus == 404
                                  ? Icons.search_off_outlined
                                  : errorStatus == 403
                                      ? Icons.lock_outlined
                                      : errorStatus != null &&
                                              errorStatus! >= 500
                                          ? Icons.error_outline_outlined
                                          : Icons.cloud_off_outlined,
                          title: errorStatus == null
                              ? 'Belum bisa memuat'
                              : errorStatus == 404
                                  ? 'Tidak ketemu di server'
                                  : errorStatus == 403
                                      ? 'Tidak punya izin'
                                      : errorStatus != null &&
                                              errorStatus! >= 500
                                          ? 'Server bermasalah'
                                          : 'Belum bisa memuat',
                          subtitle: error,
                          primaryLabel: 'Coba lagi',
                          onPrimary: () => _load(reset: true),
                        )
                      : RefreshIndicator(
                          onRefresh: () => _load(reset: true),
                          child: wide
                              // Desktop: tabel + footer paginasi.
                              ? ListView(
                                  padding: EdgeInsets.fromLTRB(
                                      pad.left, 4, pad.right, 24),
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
                                  padding: EdgeInsets.fromLTRB(
                                      pad.left, 4, pad.right, 24),
                                  itemCount: logs.length + 1,
                                  itemBuilder: (_, i) {
                                    if (i >= logs.length) {
                                      return _pagerFooter(context);
                                    }
                                    return _logCard(logs[i], scheme);
                                  },
                                ),
                        ),
            ),
          ]);
        }),
      ),
    );
  }
}
