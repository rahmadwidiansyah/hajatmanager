import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../core/api_client.dart';
import '../../core/app_config.dart';
import '../../core/auth_store.dart';
import '../../core/sync_engine.dart';
import 'pin_screen.dart';
import '../../widgets/app_widgets.dart';

/// Login Email — mirror /login web (credentials).
/// Sukses -> cache user -> wajib buat PIN offline -> ke daftar acara.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  // Form kosong — user ketik sendiri.
  final emailC = TextEditingController(text: '');
  final passC = TextEditingController(text: '');
  final nameC = TextEditingController();
  final serverC = TextEditingController();
  String serverStatus = '…';
  bool reg = false;
  bool busy = false;
  bool gBusy = false;
  bool testing = false;
  String? googleId;
  bool googleChecked = false;

  @override
  void initState() {
    super.initState();
    _loadServer();
  }

  Future<void> _loadServer() async {
    serverC.text = await AppConfig.getBaseUrl();
    final ok = await ApiClient.instance.health();
    final gid = await ApiClient.instance.googleServerClientId();
    if (mounted) {
      setState(() {
        serverStatus = ok ? 'Online ✓' : 'Offline ✗';
        googleId = gid;
        googleChecked = true;
      });
    }
  }

  Future<void> _saveServer() async {
    setState(() => testing = true);
    try {
      await AppConfig.setBaseUrl(serverC.text);
      await ApiClient.instance.rebuild();
      await SyncEngine.instance.checkNow();
      final ok = await ApiClient.instance.health();
      final gid = await ApiClient.instance.googleServerClientId();
      if (mounted) {
        setState(() {
          serverStatus = ok ? 'Online ✓' : 'Offline ✗';
          googleId = gid;
          googleChecked = true;
        });
        showTopSnack(context, SnackBar(
            content: Text(ok
                ? 'Server tersambung ✓'
                : 'Masih tak terjangkau — cek URL / koneksi internet')));
      }
    } finally {
      if (mounted) setState(() => testing = false);
    }
  }

  @override
  void dispose() {
    emailC.dispose();
    passC.dispose();
    nameC.dispose();
    serverC.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Hajat Manager')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: ListView(padding: const EdgeInsets.all(24), children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Image.asset('assets/app_icon.png',
                  width: 72, height: 72),
            ),
            const SizedBox(height: 12),
            Text('Catat pemberian satset,\nonline maupun offline.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 24),
            if (reg)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextField(
                    controller: nameC,
                    decoration: const InputDecoration(
                        labelText: 'Nama',
                        border: OutlineInputBorder(),
                        filled: true,
                        prefixIcon: Icon(Icons.person_outline))),
              ),
            TextField(
                controller: emailC,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                    labelText: 'Email',
                    border: OutlineInputBorder(),
                        filled: true,
                    prefixIcon: Icon(Icons.email_outlined))),
            const SizedBox(height: 12),
            TextField(
                controller: passC,
                obscureText: true,
                decoration: const InputDecoration(
                    labelText: 'Password (min 6)',
                    border: OutlineInputBorder(),
                        filled: true,
                    prefixIcon: Icon(Icons.lock_outline))),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: busy ? null : _submit,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: busy
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(reg ? 'Daftar & Masuk' : 'Masuk'),
              ),
            ),
            TextButton(
                onPressed: () => setState(() => reg = !reg),
                child: Text(reg
                    ? 'Sudah punya akun? Masuk'
                    : 'Belum punya akun? Daftar')),
            if (!googleChecked)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Center(
                    child: SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2))),
              ),
            if (googleChecked &&
                googleId != null &&
                ApiClient.supportsGoogleSignIn) ...[
              const SizedBox(height: 8),
              Row(children: [
                const Expanded(child: Divider()),
                Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12),
                  child: Text('atau',
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall),
                ),
                const Expanded(child: Divider()),
              ]),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: (gBusy || busy) ? null : _google,
                icon: gBusy
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2))
                    : SvgPicture.asset('assets/g_logo.svg',
                        width: 20,
                        height: 20,
                        semanticsLabel: 'Logo Google',
                        placeholderBuilder: (context) =>
                            const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2))),
                label: Padding(
                  padding:
                      const EdgeInsets.symmetric(vertical: 8),
                  child: Text(gBusy
                      ? 'Menghubungkan…'
                      : 'Lanjutkan dengan Google'),
                ),
              ),
            ],
            if (googleChecked &&
                (googleId == null ||
                    !ApiClient.supportsGoogleSignIn)) ...[
              const SizedBox(height: 8),
              Row(children: [
                const Expanded(child: Divider()),
                Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12),
                  child: Text('atau',
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall),
                ),
                const Expanded(child: Divider()),
              ]),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed:
                    ApiClient.supportsGoogleSignIn ? _loadServer : null,
                icon: const Icon(Icons.account_circle_outlined,
                    size: 20),
                label: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('Login Google belum tersedia'),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                  ApiClient.supportsGoogleSignIn
                      ? 'Server offline atau GOOGLE_CLIENT_ID belum diisi di server. Cek kolom Server + Tes, lalu tap tombol di atas untuk coba lagi.'
                      : 'Login Google hanya tersedia di Android/iOS — di perangkat ini silakan masuk dengan email.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall),
            ],
            const SizedBox(height: 8),
            const Divider(),
            Text('Server ($serverStatus)',
                style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 6),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextField(
                      controller: serverC,
                      keyboardType: TextInputType.url,
                      decoration: const InputDecoration(
                          hintText: 'https://hajat.widihhh.my.id',
                          border: OutlineInputBorder(),
                        filled: true,
                          prefixIcon: Icon(Icons.dns_outlined),
                          isDense: true)),
                ),
                const SizedBox(width: 8),
                FilledButton.tonal(
                  onPressed: testing ? null : _saveServer,
                  child: testing
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Tes'),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
                'Default: https://hajat.widihhh.my.id — tap Tes dulu sebelum masuk.',
                style: const TextStyle(fontSize: 11)),
          ]),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final email = emailC.text.trim();
    final pass = passC.text;
    if (!email.contains('@') || pass.length < 6) {
      if (!mounted) return;
      showTopSnack(context, 
          const SnackBar(content: Text('Email valid + password min 6')));
      return;
    }
    setState(() => busy = true);
    try {
      if (reg) {
        final (ok, err) = await ApiClient.instance.register(
            nameC.text.trim().isEmpty
                ? email.split('@').first
                : nameC.text.trim(),
            email,
            pass);
        if (!ok) {
          if (mounted) {
            showTopSnack(context, SnackBar(content: Text(err ?? 'Gagal daftar')));
          }
          return;
        }
      }
      final (ok, err) = await ApiClient.instance.loginEmail(email, pass);
      if (!ok) {
        if (mounted) {
          showTopSnack(context, SnackBar(content: Text(err ?? 'Gagal masuk')));
        }
        return;
      }
      final s = await ApiClient.instance.session();
      await AuthStore.saveUser(
          Map<String, dynamic>.from((s?['user'] ?? {'email': email}) as Map));
      if (mounted) {
        // PIN lokal dihapus saat logout; cek server agar tidak perlu buat baru.
        final next = await resolveNextAfterLogin();
        if (!mounted) return;
        // ignore: use_build_context_synchronously
        Navigator.of(context)
            .pushReplacement(MaterialPageRoute(builder: (_) => next));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  /// Login Google native: popup akun HP → session server → alur PIN sama.
  Future<void> _google() async {
    // Refresh ID server dulu (jangan percaya cache lama — env bisa ganti).
    if (googleId == null) await _loadServer();
    if (!mounted) return;
    setState(() => gBusy = true);
    try {
      final (ok, err) = await ApiClient.instance
          .loginGoogle(serverClientId: googleId);
      if (!ok) {
        if (err != null && mounted) {
          showTopSnack(context, SnackBar(content: Text(err)));
        }
        return;
      }
      final s = await ApiClient.instance.session();
      final email = '${(s?['user'] as Map?)?['email'] ?? ''}';
      await AuthStore.saveUser(Map<String, dynamic>.from(
          (s?['user'] ?? {'email': email}) as Map));
      if (mounted) {
        final next = await resolveNextAfterLogin();
        if (!mounted) return;
        // ignore: use_build_context_synchronously
        Navigator.of(context)
            .pushReplacement(MaterialPageRoute(builder: (_) => next));
      }
    } finally {
      if (mounted) setState(() => gBusy = false);
    }
  }
}
