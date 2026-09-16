import 'package:flutter/material.dart';
import 'app_widgets.dart';

/// Layar error full-page M3: AppBar + [ErrorBody] di body.
/// Untuk 404 data, gagal jaringan, 403, dan 500 — konsisten di semua fitur.
class AppErrorScreen extends StatelessWidget {
  final String title;
  final IconData icon;
  final String? subtitle;
  final String appBarTitle;
  final String? primaryLabel;
  final VoidCallback? onPrimary;
  final IconData primaryIcon;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;

  const AppErrorScreen({
    super.key,
    this.appBarTitle = 'Hajat Manager',
    required this.icon,
    required this.title,
    this.subtitle,
    this.primaryLabel,
    this.onPrimary,
    this.primaryIcon = Icons.refresh_outlined,
    this.secondaryLabel,
    this.onSecondary,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(appBarTitle)),
      body: Center(
        child: SingleChildScrollView(
          child: ErrorBody(
            icon: icon,
            title: title,
            subtitle: subtitle,
            primaryLabel: primaryLabel,
            onPrimary: onPrimary,
            primaryIcon: primaryIcon,
            secondaryLabel: secondaryLabel,
            onSecondary: onSecondary,
          ),
        ),
      ),
    );
  }

  /// Data tidak ketemu di server (HTTP 404 / dihapus dari web).
  factory AppErrorScreen.notFound({
    Key? key,
    String appBarTitle = 'Hajat Manager',
    String? subtitle,
    VoidCallback? onRetry,
    VoidCallback? onBack,
  }) {
    return AppErrorScreen(
      key: key,
      appBarTitle: appBarTitle,
      icon: Icons.search_off_outlined,
      title: 'Tidak ketemu di server',
      subtitle: subtitle ?? 'Data mungkin sudah dihapus dari web.',
      primaryLabel: onRetry == null ? null : 'Coba lagi',
      onPrimary: onRetry,
      secondaryLabel: onBack == null ? null : 'Kembali',
      onSecondary: onBack,
    );
  }

  /// Tidak ada koneksi (timeout / offline).
  factory AppErrorScreen.noConnection({
    Key? key,
    String appBarTitle = 'Hajat Manager',
    String? subtitle,
    VoidCallback? onRetry,
    VoidCallback? onBack,
  }) {
    return AppErrorScreen(
      key: key,
      appBarTitle: appBarTitle,
      icon: Icons.cloud_off_outlined,
      title: 'Tidak ada koneksi',
      subtitle: subtitle ?? 'Cek URL server / koneksi internet, lalu coba lagi.',
      primaryLabel: onRetry == null ? null : 'Coba lagi',
      onPrimary: onRetry,
      secondaryLabel: onBack == null ? null : 'Kembali',
      onSecondary: onBack,
    );
  }

  /// Ditolak server (HTTP 403 — viewer).
  factory AppErrorScreen.forbidden({
    Key? key,
    String appBarTitle = 'Hajat Manager',
    VoidCallback? onBack,
  }) {
    return AppErrorScreen(
      key: key,
      appBarTitle: appBarTitle,
      icon: Icons.lock_outlined,
      title: 'Tidak punya izin',
      subtitle: 'Perlu peran OWNER/ADMIN untuk membuka ini.',
      secondaryLabel: onBack == null ? null : 'Kembali',
      onSecondary: onBack,
    );
  }

  /// Server error (HTTP 500).
  factory AppErrorScreen.serverError({
    Key? key,
    String appBarTitle = 'Hajat Manager',
    VoidCallback? onRetry,
    VoidCallback? onBack,
  }) {
    return AppErrorScreen(
      key: key,
      appBarTitle: appBarTitle,
      icon: Icons.error_outline_outlined,
      title: 'Server bermasalah',
      subtitle: 'Coba lagi sebentar. Kalau terus, hubungi admin.',
      primaryLabel: onRetry == null ? null : 'Coba lagi',
      onPrimary: onRetry,
      primaryIcon: Icons.refresh_outlined,
      secondaryLabel: onBack == null ? null : 'Kembali',
      onSecondary: onBack,
    );
  }
}

/// Isi error tanpa Scaffold — untuk dipakai di dalam body layar lain
/// (tab, kolom, hasil cari). Untuk full-page pakai [AppErrorScreen].
class ErrorBody extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? primaryLabel;
  final VoidCallback? onPrimary;
  final IconData primaryIcon;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;

  const ErrorBody({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.primaryLabel,
    this.onPrimary,
    this.primaryIcon = Icons.refresh_outlined,
    this.secondaryLabel,
    this.onSecondary,
  });

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: icon,
      title: title,
      subtitle: subtitle,
      action: (primaryLabel == null && secondaryLabel == null)
          ? null
          : Column(mainAxisSize: MainAxisSize.min, children: [
              if (primaryLabel != null)
                FilledButton.icon(
                  onPressed: onPrimary,
                  icon: Icon(primaryIcon),
                  label: Text(primaryLabel!),
                ),
              if (primaryLabel != null && secondaryLabel != null)
                const SizedBox(height: 8),
              if (secondaryLabel != null)
                OutlinedButton.icon(
                  onPressed: onSecondary,
                  icon: const Icon(Icons.arrow_back_outlined),
                  label: Text(secondaryLabel!),
                ),
            ]),
    );
  }
}
