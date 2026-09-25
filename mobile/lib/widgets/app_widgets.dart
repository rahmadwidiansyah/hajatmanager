import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../core/app_theme.dart';
import '../core/sync_engine.dart';
import '../core/window_ui.dart';

/// Dialog ramah-desktop: min 400px di layar lebar (cermin maxWidth 480
/// login), full di HP. Esc/native-back tetap dismiss (bawaan showDialog).
Future<T?> showWideDialog<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  double minWidth = 400,
  double maxWidth = 560,
}) {
  return showDialog<T>(
    context: context,
    builder: (ctx) {
      final w = MediaQuery.sizeOf(ctx).width;
      final min = w > maxWidth + 64 ? minWidth : 0.0;
      final content = builder(ctx);
      // Konten mentah (Column/ListView sheet) butuh permukaan Material —
      // tanpa ini teks tak terbaca di atas scrim (terlihat "blank").
      // AlertDialog/Dialog sudah punya permukaan sendiri, jangan dibungkus ganda.
      final Widget surfaced = (content is Dialog || content is AlertDialog)
          ? content
          : Card(margin: EdgeInsets.zero, child: content);
      return Center(
        child: ConstrainedBox(
          constraints: BoxConstraints(minWidth: min, maxWidth: maxWidth),
          child: surfaced,
        ),
      );
    },
  );
}

/// Bottom-sheet di HP, dialog di desktop lebar (>=900px).
/// Builder yang sama bisa dipakai untuk keduanya.
Future<T?> showAdaptiveSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
}) {
  final wide = WindowUi.isWide(MediaQuery.sizeOf(context).width);
  if (wide) return showWideDialog<T>(context: context, builder: builder);
  return showModalBottomSheet<T>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(child: builder(ctx)),
  );
}

/// Tampilkan SnackBar di ATAS (floating, di bawah AppBar) — bukan bottom default.
/// Menerima SnackBar apa adanya, paksa posisi top + auto-hilang sesuai
/// [SnackBar.duration] (default Flutter 4 dtk).
void showTopSnack(BuildContext context, SnackBar bar) {
  final mq = MediaQuery.of(context);
  final h = mq.size.height;
  final topPad = mq.padding.top;
  // Dorong ke atas: margin bottom besar agar floating muncul di bawah AppBar.
  final bottomMargin = (h - topPad - kToolbarHeight - 76).clamp(0.0, h);
  final messenger = ScaffoldMessenger.of(context);
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(SnackBar(
    content: bar.content,
    backgroundColor: bar.backgroundColor,
    elevation: bar.elevation,
    margin: EdgeInsets.fromLTRB(12, 0, 12, bottomMargin),
    padding: bar.padding,
    behavior: SnackBarBehavior.floating,
    duration: bar.duration,
    action: bar.action,
    shape: bar.shape ??
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
  ));
}

/// Cek online cepat sebelum aksi yang wajib server.
/// False = sudah tampilkan snackbar, batalkan aksi.
Future<bool> ensureOnline(BuildContext context) async {
  if (SyncEngine.instance.online) return true;
  await SyncEngine.instance.checkNow();
  if (SyncEngine.instance.online) return true;
  if (context.mounted) {
    showTopSnack(
        context,
        const SnackBar(
            content: Text(
                'Butuh online — tidak ada perubahan, coba lagi saat tersambung')));
  }
  return false;
}

/// Terjemahkan error server jadi bahasa manusia.
String serverMsg(DioException e) {
  final m = e.response?.data;
  if (m is Map) {
    final raw = '${m['message'] ?? m['error'] ?? ''}';
    if (raw.contains('OFFLINE_LOCKED')) {
      return 'Acara mode Offline — Sync ke Server dulu untuk kelola anggota';
    }
    if (raw.contains('belum terdaftar')) return raw;
    if (raw.contains('satu-satunya OWNER')) return raw;
    if (raw.contains('sudah jadi anggota')) return raw;
    if (raw.contains('USERNAME_TAKEN')) {
      return 'Username sudah dipakai orang lain';
    }
    if (raw.contains('EMAIL_TAKEN')) {
      return 'Email sudah dipakai akun lain';
    }
    if (raw.contains('WRONG_PASSWORD')) {
      return 'Password lama salah';
    }
    if (raw.isNotEmpty &&
        !raw.startsWith('{') &&
        raw != 'null') {
      return raw;
    }
  }
  if (e.type == DioExceptionType.connectionError ||
      e.type == DioExceptionType.connectionTimeout ||
      e.type == DioExceptionType.receiveTimeout) {
    return 'Server tak terjangkau (>12 dtk) — cek URL server / koneksi internet, lalu coba lagi';
  }
  final s = e.response?.statusCode ?? 0;
  if (s == 404) return 'Tidak ketemu di server (mungkin sudah dihapus)';
  if (s == 403) return 'Tidak punya izin — perlu peran OWNER/ADMIN';
  if (s == 400) return 'Data ditolak server — periksa isian';
  if (s >= 500) return 'Server bermasalah (HTTP $s) — coba lagi sebentar';
  return 'Gagal (${s == 0 ? 'jaringan' : 'HTTP $s'}) — coba lagi';
}

/// Empty state konsisten: ikon besar + judul + deskripsi + aksi opsional.
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;
  const EmptyState(
      {super.key,
      required this.icon,
      required this.title,
      this.subtitle,
      this.action});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 88,
            height: 88,
            decoration: BoxDecoration(
              color: scheme.secondaryContainer,
              shape: BoxShape.circle,
            ),
            child: Icon(icon,
                size: 44, color: scheme.onSecondaryContainer),
          ),
          const SizedBox(height: 16),
          Text(title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium),
          if (subtitle != null) ...[
            const SizedBox(height: 6),
            Text(subtitle!,
                textAlign: TextAlign.center,
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: scheme.onSurfaceVariant)),
          ],
          if (action != null) ...[
            const SizedBox(height: 16),
            action!,
          ],
        ]),
      ),
    );
  }
}

/// Chip metode dengan dot warna — mirror `methodChipClass` web.
class MethodChip extends StatelessWidget {
  final String method;
  final bool compact;
  const MethodChip(this.method, {super.key, this.compact = true});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final b = Theme.of(context).brightness;
    final (bg, fg) = AppColors.methodChip(method, scheme);
    return Chip(
      label: Text(method),
      avatar: Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(
          color: AppColors.methodDot(method, scheme, b),
          shape: BoxShape.circle,
        ),
      ),
      backgroundColor: bg,
      labelStyle: TextStyle(
          color: fg,
          fontSize: 11,
          fontWeight: FontWeight.w600),
      side: BorderSide(color: scheme.outlineVariant),
      visualDensity: VisualDensity.compact,
      padding: EdgeInsets.zero,
    );
  }
}

/// Chip role anggota — mirror `roleChipClass` web.
class RoleChip extends StatelessWidget {
  final String role;
  const RoleChip(this.role, {super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final b = Theme.of(context).brightness;
    final (bg, fg) = AppColors.roleChip(role, scheme, b);
    return Chip(
      label: Text(role),
      backgroundColor: bg,
      labelStyle: TextStyle(
          color: fg, fontSize: 11, fontWeight: FontWeight.w700),
      side: BorderSide(color: scheme.outlineVariant),
      visualDensity: VisualDensity.compact,
      padding: EdgeInsets.zero,
    );
  }
}

/// Badge antrean offline di AppBar: ikon sync + count.
class SyncBadge extends StatelessWidget {
  final int pending;
  final VoidCallback onTap;
  const SyncBadge(
      {super.key, required this.pending, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: pending == 0 ? 'Tersinkron' : '$pending antre — tap untuk sync',
      onPressed: onTap,
      icon: Badge(
        isLabelVisible: pending > 0,
        label: Text('$pending'),
        child: Icon(pending == 0
            ? Icons.cloud_done_outlined
            : Icons.cloud_upload_outlined),
      ),
    );
  }
}
