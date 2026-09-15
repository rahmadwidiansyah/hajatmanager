import 'package:flutter/material.dart';
import '../events/events_screen.dart';
import '../../core/api_client.dart';
import '../../core/auth_store.dart';

/// Tentukan layar berikutnya setelah login sukses:
/// - PIN lokal ada → langsung acara.
/// - PIN lokal tidak ada tapi server punya → verifikasi PIN lama (tidak buat baru).
/// - Selain itu (server belum punya / offline) → buat PIN baru.
Future<Widget> resolveNextAfterLogin() async {
  final local = await AuthStore.hasPin();
  if (local) return const EventsScreen();
  final serverHas = await ApiClient.instance.pinStatus();
  if (serverHas == true) return const PinRestoreScreen();
  return const PinSetupScreen();
}

/// PIN 6 digit untuk buka cepat di lapangan (offline-friendly).
class PinSetupScreen extends StatefulWidget {
  const PinSetupScreen({super.key});
  @override
  State<PinSetupScreen> createState() => _PinSetupScreenState();
}

class _PinSetupScreenState extends State<PinSetupScreen> {
  final c = TextEditingController();
  bool saving = false;
  @override
  void dispose() {
    c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Buat PIN lapangan')),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            const Text(
                'PIN dipakai panitia agar bisa buka aplikasi tanpa internet setelah login pertama. PIN tersimpan di server agar tetap bisa dipakai setelah logout.'),
            const SizedBox(height: 16),
            TextField(
                controller: c,
                keyboardType: TextInputType.number,
                maxLength: 6,
                obscureText: true,
                enabled: !saving,
                decoration: const InputDecoration(
                    labelText: 'PIN 6 digit',
                    helperText: 'Wajib 6 digit angka',
                    border: OutlineInputBorder())),
            const SizedBox(height: 12),
            FilledButton(
                onPressed: saving ? null : _save,
                child: saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Simpan PIN & Lanjut')),
          ]),
        ),
      );

  Future<void> _save() async {
    final pin = c.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(pin)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('PIN harus 6 digit angka')));
      return;
    }
    setState(() => saving = true);
    try {
      await AuthStore.setPin(pin);
      // Best-effort sync ke server (boleh offline).
      await ApiClient.instance.setServerPin(pin);
      if (!mounted) return;
      // ignore: use_build_context_synchronously
      Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const EventsScreen()));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }
}

/// Layar setelah login bila PIN lokal terhapus tapi server masih punya:
/// verifikasi PIN lama ke server lalu simpan ulang lokal (tidak buat baru).
class PinRestoreScreen extends StatefulWidget {
  const PinRestoreScreen({super.key});
  @override
  State<PinRestoreScreen> createState() => _PinRestoreScreenState();
}

class _PinRestoreScreenState extends State<PinRestoreScreen> {
  final c = TextEditingController();
  bool checking = false;

  @override
  void dispose() {
    c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Masukkan PIN lama')),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            const Text(
                'PIN di perangkat ini terhapus saat logout, tapi akunmu masih punya PIN di server. Masukkan PIN lama (6 digit) — tidak perlu buat baru.'),
            const SizedBox(height: 16),
            TextField(
                controller: c,
                keyboardType: TextInputType.number,
                maxLength: 6,
                obscureText: true,
                autofocus: true,
                enabled: !checking,
                onSubmitted: (_) => _verify(),
                decoration: const InputDecoration(
                    labelText: 'PIN lama (6 digit)',
                    border: OutlineInputBorder())),
            const SizedBox(height: 12),
            FilledButton(
                onPressed: checking ? null : _verify,
                child: checking
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Verifikasi & Lanjut')),
            TextButton(
                onPressed: checking
                    ? null
                    : () => Navigator.of(context).pushReplacement(
                        MaterialPageRoute(
                            builder: (_) => const PinSetupScreen())),
                child: const Text('Lupa PIN? Buat baru')),
          ]),
        ),
      );

  Future<void> _verify() async {
    if (checking) return;
    final pin = c.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(pin)) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('PIN harus 6 digit angka')));
      return;
    }
    setState(() => checking = true);
    try {
      final (ok, err) = await ApiClient.instance.verifyServerPin(pin);
      if (!mounted) return;
      if (ok) {
        await AuthStore.setPin(pin);
        if (!mounted) return;
        // ignore: use_build_context_synchronously
        Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const EventsScreen()));
        return;
      }
      if (err == 'PIN_NOT_SET') {
        // Server ternyata belum punya PIN → buat baru.
        // ignore: use_build_context_synchronously
        Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const PinSetupScreen()));
        return;
      }
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(err ?? 'PIN salah')));
    } finally {
      if (mounted) setState(() => checking = false);
    }
  }
}

/// Kunci PIN saat aplikasi dibuka ulang.
class PinLockScreen extends StatefulWidget {
  const PinLockScreen({super.key});
  @override
  State<PinLockScreen> createState() => _PinLockScreenState();
}

class _PinLockScreenState extends State<PinLockScreen> {
  final c = TextEditingController();
  bool checking = false;
  @override
  void dispose() {
    c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.lock_outline,
                    size: 56,
                    color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 12),
                Text('Masukkan PIN',
                    style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 16),
                TextField(
                    controller: c,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.done,
                    maxLength: 6,
                    obscureText: true,
                    autofocus: true,
                    enabled: !checking,
                    onChanged: (v) {
                      // Auto-kirim hanya saat 6 digit penuh.
                      if (v.trim().length >= 6) _go();
                    },
                    onSubmitted: (_) => _go(),
                    decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        filled: true,
                        labelText: 'PIN')),
                const SizedBox(height: 12),
                FilledButton(
                    onPressed: checking ? null : _go,
                    child: checking
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child:
                                CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Buka Aplikasi')),
              ]),
            ),
          ),
        ),
      );

  Future<void> _go() async {
    if (checking) return;
    final pin = c.text.trim();
    if (pin.length < 4) return;
    setState(() => checking = true);
    final ok = await AuthStore.verifyPin(pin);
    if (!mounted) return;
    if (ok) {
      await AuthStore.markUnlocked();
      if (!mounted) return;
      // ignore: use_build_context_synchronously
      Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const EventsScreen()));
    } else {
      setState(() => checking = false);
      c.clear();
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('PIN salah')));
    }
  }
}
