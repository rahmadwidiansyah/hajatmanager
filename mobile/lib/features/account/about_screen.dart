import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/app_config.dart';
import '../../core/auth_store.dart';
import '../auth/login_screen.dart';

/// Sub: Tentang & Keluar.
class AboutScreen extends StatefulWidget {
  const AboutScreen({super.key});
  @override
  State<AboutScreen> createState() => _AboutScreenState();
}

class _AboutScreenState extends State<AboutScreen> {
  String baseUrl = '…';
  bool online = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final u = await AppConfig.getBaseUrl();
    final ok = await ApiClient.instance.health().timeout(
      const Duration(seconds: 6),
      onTimeout: () => false,
    ).catchError((_) => false);
    if (mounted) {
      setState(() {
        baseUrl = u;
        online = ok;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Tentang & Keluar')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              Icon(Icons.celebration_outlined,
                  size: 48, color: scheme.primary),
              const SizedBox(height: 8),
              const Text('Hajat Manager',
                  style: TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 18)),
              Text('Android client • v1.0.0+1',
                  style: Theme.of(context).textTheme.bodySmall),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: ListTile(
            leading: Icon(
                online
                    ? Icons.cloud_done_outlined
                    : Icons.cloud_off_outlined,
                color: online
                    ? scheme.primary
                    : scheme.onSurfaceVariant),
            title: const Text('Server aktif',
                style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('$baseUrl\nStatus: ${online ? 'Online ✓' : 'Offline ✗'}'),
            isThreeLine: true,
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 12),
          child: Text(
              'Ganti server cukup dari layar Login (kolom Server + Tes).',
              style: Theme.of(context).textTheme.bodySmall),
        ),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(
              foregroundColor: scheme.error),
          onPressed: () async {
            final ok = await showDialog<bool>(
                context: context,
                builder: (_) => AlertDialog(
                      title: const Text('Keluar akun?'),
                      content: const Text(
                          'Session + PIN di perangkat ini dihapus. Data antrean yang belum sync ikut terhapus.'),
                      actions: [
                        TextButton(
                            onPressed: () =>
                                Navigator.pop(context, false),
                            child: const Text('Batal')),
                        FilledButton(
                            onPressed: () =>
                                Navigator.pop(context, true),
                            child: const Text('Keluar')),
                      ],
                    ));
            if (ok != true || !context.mounted) return;
            await ApiClient.instance.logout();
            await AuthStore.logout();
            if (context.mounted) {
              // ignore: use_build_context_synchronously
              Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(
                      builder: (_) => const LoginScreen()),
                  (_) => false);
            }
          },
          icon: const Icon(Icons.logout_outlined),
          label: const Text('Keluar Akun'),
        ),
      ]),
    );
  }
}
