import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api_client.dart';
import '../../core/app_config.dart';
import '../../core/auth_store.dart';
import '../../core/google_loopback.dart';
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
  GoogleLoopback? _loop;

  /// Fase 4: Google desktop (Windows/Linux/macOS) via browser + loopback.
  /// Mobile tetap pakai SDK native (supportsGoogleSignIn).
  static bool get _isDesktop =>
      !kIsWeb &&
      (Platform.isWindows || Platform.isLinux || Platform.isMacOS);

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
    _loop?.close();
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
                (ApiClient.supportsGoogleSignIn || _isDesktop)) ...[
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
                onPressed: (gBusy || busy)
                    ? null
                    : (ApiClient.supportsGoogleSignIn
                        ? _google
                        : _googleDesktop),
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
              if (_isDesktop && !ApiClient.supportsGoogleSignIn)
                TextButton(
                  onPressed: (gBusy || busy) ? null : _pasteGoogleCode,
                  child: const Text('Punya kode Google manual? Tempel di sini',
                      style: TextStyle(fontSize: 11)),
                ),
            ],
            if (googleChecked &&
                (googleId == null ||
                    (!ApiClient.supportsGoogleSignIn &&
                        !_isDesktop))) ...[
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
                    (ApiClient.supportsGoogleSignIn || _isDesktop)
                        ? _loadServer
                        : null,
                icon: const Icon(Icons.account_circle_outlined,
                    size: 20),
                label: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('Login Google belum tersedia'),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                  (ApiClient.supportsGoogleSignIn || _isDesktop)
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
                          hintText: 'https://hajat.sanding.online',
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
                'Default: https://hajat.sanding.online — tap Tes dulu sebelum masuk.',
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

  /// Ekor login remote bersama (Google native/desktop, kode manual):
  /// session → cache user → alur PIN. Return true bila navigasi jalan.
  Future<bool> _finishRemoteLogin(String emailFallback) async {
    final s = await ApiClient.instance.session();
    final userMap = s?['user'];
    await AuthStore.saveUser(Map<String, dynamic>.from(
        (userMap ?? {'email': emailFallback}) as Map));
    if (!mounted) return false;
    final next = await resolveNextAfterLogin();
    if (!mounted) return false;
    // ignore: use_build_context_synchronously
    Navigator.of(context)
        .pushReplacement(MaterialPageRoute(builder: (_) => next));
    return true;
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
      await _finishRemoteLogin('');
    } finally {
      if (mounted) setState(() => gBusy = false);
    }
  }

  /// Fase 4: Google desktop — buka browser sistem → tunggu loopback
  /// → tukar grant menjadi Bearer → alur PIN sama.
  /// Fase B: tiap langkah di-log ([GoogleDesktop]) + bila browser gagal
  /// dibuka, tampilkan tautan + tombol salin agar tidak mentok.
  Future<void> _googleDesktop() async {
    if (googleId == null) await _loadServer();
    if (!mounted) return;
    setState(() => gBusy = true);
    GoogleLoopback? loop;
    try {
      try {
        await _loop?.close();
        loop = await GoogleLoopback.start();
        _loop = loop;
        debugPrint('[GoogleDesktop] loopback siap di port ${loop.port}');
      } catch (e) {
        debugPrint('[GoogleDesktop] GAGAL buka port lokal: $e');
        if (mounted) {
          showTopSnack(context,
              SnackBar(content: Text('Tidak bisa buka port lokal: $e')));
        }
        return;
      }
      final base = await AppConfig.getBaseUrl();
      final device = await AppConfig.getDeviceId();
      final url = GoogleLoopback.buildStartUrl(
          base, loop.port, loop.state, device);
      debugPrint('[GoogleDesktop] start URL: $url');
      bool opened = false;
      try {
        opened = await launchUrl(Uri.parse(url),
            mode: LaunchMode.externalApplication);
      } catch (e) {
        debugPrint('[GoogleDesktop] launchUrl error: $e');
        opened = false;
      }
      debugPrint('[GoogleDesktop] browser opened=$opened');
      if (!opened) {
        if (mounted) await _showOpenLinkFallback(url);
        return;
      }
      debugPrint('[GoogleDesktop] menunggu callback loopback…');
      final hit = await loop.wait();
      debugPrint(
          '[GoogleDesktop] callback: ${hit == null ? 'TIMEOUT/BATAL' : 'diterima, state cocok'}');
      if (hit == null) {
        if (mounted) {
          showTopSnack(context,
              const SnackBar(content: Text('Login Google dibatalkan / timeout — coba lagi')));
        }
        return;
      }
      final (ok, err) =
          await ApiClient.instance.exchangeDeviceCode(hit.code);
      debugPrint('[GoogleDesktop] tukar kode: ok=$ok err=$err');
      if (!ok) {
        if (mounted) {
          showTopSnack(
              context, SnackBar(content: Text(err ?? 'Gagal tukar kode')));
        }
        return;
      }
      await _finishRemoteLogin('');
    } finally {
      try {
        await loop?.close();
      } catch (_) {}
      if (_loop == loop) _loop = null;
      if (mounted) setState(() => gBusy = false);
    }
  }

  /// Fallback kasat mata: browser gagal dibuka → tampilkan tautan start
  /// + tombol salin agar user bisa buka manual di browser mana pun.
  Future<void> _showOpenLinkFallback(String url) async {
    if (!mounted) return;
    await showWideDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Buka tautan manual'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
                'Browser tidak terbuka otomatis. Salin tautan ini, tempel di browser, selesaikan login Google, lalu kembali ke aplikasi.'),
            const SizedBox(height: 12),
            SelectableText(url,
                style: const TextStyle(
                    fontFamily: 'monospace', fontSize: 11)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Tutup'),
          ),
          FilledButton.icon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: url));
              if (ctx.mounted) Navigator.of(ctx).pop();
              if (mounted) {
                showTopSnack(context, const SnackBar(
                    content: Text('Tautan tersalin — tempel di browser')));
              }
            },
            icon: const Icon(Icons.copy_outlined, size: 18),
            label: const Text('Salin tautan'),
          ),
        ],
      ),
    );
  }

  /// Fallback: tempel kode dari halaman browser bila loopback tak terjangkau.
  Future<void> _pasteGoogleCode() async {
    final codeC = TextEditingController();
    try {
      final code = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Tempel kode Google'),
          content: TextField(
            controller: codeC,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'Salin dari tombol "Salin kode" di browser',
              border: OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Batal'),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.of(ctx).pop(codeC.text.trim()),
              child: const Text('Lanjutkan'),
            ),
          ],
        ),
      );
      if (code == null || code.length < 20 || !mounted) return;
      setState(() => gBusy = true);
      try {
        final (ok, err) =
            await ApiClient.instance.exchangeDeviceCode(code);
        if (!ok) {
          if (mounted) {
            showTopSnack(
                context, SnackBar(content: Text(err ?? 'Gagal tukar kode')));
          }
          return;
        }
        await _finishRemoteLogin('');
      } finally {
        if (mounted) setState(() => gBusy = false);
      }
    } finally {
      codeC.dispose();
    }
  }
}
