import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../core/api_client.dart';
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

  @override
  void initState() {
    super.initState();
    _load(reset: true);
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

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text('Log • ${widget.eventName}')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: TextField(
            onChanged: (v) => setState(() => q = v),
            onSubmitted: (_) => _load(reset: true),
            decoration: const InputDecoration(
                hintText: 'Cari aksi / nama / tamu…',
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
            padding: const EdgeInsets.symmetric(horizontal: 12),
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
                    )
                  : RefreshIndicator(
                      onRefresh: () => _load(reset: true),
                      child: ListView.builder(
                        padding:
                            const EdgeInsets.fromLTRB(12, 4, 12, 24),
                        itemCount: logs.length + 1,
                        itemBuilder: (_, i) {
                          if (i >= logs.length) {
                            if (logs.length >= total || total == 0) {
                              return Padding(
                                padding:
                                    const EdgeInsets.all(16),
                                child: Center(
                                    child: Text('$total aktivitas',
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall)),
                              );
                            }
                            return Padding(
                              padding: const EdgeInsets.all(12),
                              child: FilledButton.tonalIcon(
                                onPressed: more
                                    ? null
                                    : () => _load(next: true),
                                icon: more
                                    ? const SizedBox(
                                        width: 16,
                                        height: 16,
                                        child:
                                            CircularProgressIndicator(
                                                strokeWidth: 2))
                                    : const Icon(
                                        Icons.expand_more_outlined),
                                label: const Text('Muat lagi'),
                              ),
                            );
                          }
                          final l = logs[i];
                          final u = (l['user'] as Map?) ?? {};
                          final a = '${l['aksi'] ?? '-'}';
                          final dt = DateTime.tryParse(
                                  '${l['createdAt'] ?? ''}')
                              ?.toLocal();
                          final when = dt == null
                              ? ''
                              : '${dt.day}/${dt.month} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
                          return Card(
                            margin: const EdgeInsets.symmetric(
                                vertical: 4),
                            child: ListTile(
                              dense: true,
                              leading: Container(
                                width: 36,
                                height: 36,
                                decoration: BoxDecoration(
                                  color:
                                      scheme.secondaryContainer,
                                  shape: BoxShape.circle,
                                ),
                                child: Icon(_icon(a),
                                    size: 18,
                                    color: scheme
                                        .onSecondaryContainer),
                              ),
                              title: Text(a,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13)),
                              subtitle: Text(
                                  '${u['name'] ?? u['email'] ?? '?'} • $when'),
                            ),
                          );
                        },
                      ),
                    ),
        ),
      ]),
    );
  }
}
