import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/auth_store.dart';

const _graceOptions = [0, 1, 5, 15];
String _graceLabel(int v) =>
    v <= 0 ? 'Segera (tiap buka)' : '$v menit';

/// Sub: PIN & Kunci Layar — ganti PIN (lama + baru 2x) + jeda kunci.
class PinLockScreen extends StatefulWidget {
  const PinLockScreen({super.key});
  @override
  State<PinLockScreen> createState() => _PinLockScreenState();
}

class _PinLockScreenState extends State<PinLockScreen> {
  int grace = 5;
  final oldC = TextEditingController();
  final newC = TextEditingController();
  final new2C = TextEditingController();
  bool saving = false;
  bool hideOld = true;
  bool hideNew = true;

  @override
  void initState() {
    super.initState();
    _loadGrace();
  }

  Future<void> _loadGrace() async {
    final v = await AuthStore.pinGraceMin();
    if (mounted) setState(() => grace = v);
  }

  @override
  void dispose() {
    oldC.dispose();
    newC.dispose();
    new2C.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final oldPin = oldC.text.trim();
    final newPin = newC.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(newPin)) {
      _snack('PIN baru harus 6 digit angka');
      return;
    }
    if (newPin != new2C.text.trim()) {
      _snack('Ulangi PIN baru tidak sama');
      return;
    }
    setState(() => saving = true);
    try {
      final ok = await AuthStore.verifyPin(oldPin);
      if (!ok) {
        _snack('PIN lama salah');
        return;
      }
      await AuthStore.setPin(newPin);
      // Best-effort sync ke server agar tetap bisa dipakai setelah logout.
      final (synced, err) = await ApiClient.instance
          .changeServerPin(newPin, currentPin: oldPin);
      oldC.clear();
      newC.clear();
      new2C.clear();
      _snack(synced ? 'PIN diganti ✓' : (err ?? 'PIN diganti lokal ✓'));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('PIN & Kunci Layar')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Text('Kunci otomatis bila app dibuka lagi lewat:',
              style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: _graceOptions
                .map((g) => ChoiceChip(
                      label: Text(_graceLabel(g)),
                      selected: grace == g,
                      onSelected: (_) async {
                        await AuthStore.setPinGraceMin(g);
                        if (!mounted) return;
                        setState(() => grace = g);
                        // ignore: use_build_context_synchronously
                        ScaffoldMessenger.of(context)
                            .showSnackBar(SnackBar(
                                content: Text(
                                    'Kunci: ${_graceLabel(g)}')));
                      },
                    ))
                .toList(),
          ),
          const SizedBox(height: 16),
          Text('Ganti PIN',
              style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          TextField(
              controller: oldC,
              keyboardType: TextInputType.number,
              maxLength: 6,
              obscureText: hideOld,
              decoration: InputDecoration(
                  labelText: 'PIN lama',
                  border: const OutlineInputBorder(),
                  filled: true,
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                      icon: Icon(hideOld
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined),
                      onPressed: () =>
                          setState(() => hideOld = !hideOld)))),
          const SizedBox(height: 12),
          TextField(
              controller: newC,
              keyboardType: TextInputType.number,
              maxLength: 6,
              obscureText: hideNew,
              decoration: InputDecoration(
                  labelText: 'PIN baru (6 digit)',
                  helperText: 'Wajib 6 digit angka',
                  border: const OutlineInputBorder(),
                  filled: true,
                  prefixIcon:
                      const Icon(Icons.lock_reset_outlined),
                  suffixIcon: IconButton(
                      icon: Icon(hideNew
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined),
                      onPressed: () =>
                          setState(() => hideNew = !hideNew)))),
          const SizedBox(height: 12),
          TextField(
              controller: new2C,
              keyboardType: TextInputType.number,
              maxLength: 6,
              obscureText: hideNew,
              onSubmitted: (_) => _save(),
              decoration: const InputDecoration(
                  labelText: 'Ulangi PIN baru (6 digit)',
                  helperText: 'Wajib 6 digit angka',
                  border: OutlineInputBorder(),
                  filled: true,
                  prefixIcon: Icon(Icons.lock_outline))),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: saving ? null : _save,
            icon: saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child:
                        CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.save_outlined),
            label: const Text('Ganti PIN'),
          ),
        ]),
      );
}
