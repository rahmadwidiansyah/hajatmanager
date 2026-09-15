import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/auth_store.dart';
import 'about_screen.dart';
import 'pin_lock_screen.dart';
import 'profile_screen.dart';
import 'security_screen.dart';

/// Hub akun: 4 sub-halaman.
class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});
  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  Map<String, dynamic>? me;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final cached = await AuthStore.cachedUser();
    if (mounted) setState(() => me = cached);
    try {
      final dio = await ApiClient.instance.dio();
      final r = await dio.get('/api/users/me');
      final j = Map<String, dynamic>.from(r.data as Map);
      await AuthStore.saveUser(j);
      if (mounted) setState(() => me = j);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final name = '${me?['name'] ?? '…'}';
    final email = '${me?['email'] ?? ''}';
    return Scaffold(
      appBar: AppBar(title: const Text('Akun')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: scheme.primaryContainer,
                child: Text(
                    name.isNotEmpty
                        ? name.substring(0, 1).toUpperCase()
                        : '?',
                    style: TextStyle(
                        fontSize: 24,
                        color: scheme.onPrimaryContainer)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                    crossAxisAlignment:
                        CrossAxisAlignment.start,
                    children: [
                      Text(name,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 16)),
                      Text(email,
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall),
                    ]),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        _tile(
          context,
          icon: Icons.person_outline,
          title: 'Profil',
          subtitle: 'Nama, username, email',
          page: const ProfileScreen(),
        ),
        _tile(
          context,
          icon: Icons.lock_reset_outlined,
          title: 'Keamanan & Password',
          subtitle: 'Ganti password (butuh online)',
          page: const SecurityScreen(),
        ),
        _tile(
          context,
          icon: Icons.phonelink_lock_outlined,
          title: 'PIN & Kunci Layar',
          subtitle: 'Ganti PIN + jeda kunci otomatis',
          page: const PinLockScreen(),
        ),
        _tile(
          context,
          icon: Icons.info_outline,
          title: 'Tentang & Keluar',
          subtitle: 'Versi, server, keluar akun',
          page: const AboutScreen(),
        ),
      ]),
    );
  }

  Widget _tile(BuildContext context,
      {required IconData icon,
      required String title,
      required String subtitle,
      required Widget page}) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: scheme.secondaryContainer,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon,
              color: scheme.onSecondaryContainer),
        ),
        title: Text(title,
            style:
                const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => page))
            .then((_) => _load()),
      ),
    );
  }
}
