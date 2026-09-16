import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../widgets/app_widgets.dart';

/// Sub: Keamanan & Password.
class SecurityScreen extends StatefulWidget {
  const SecurityScreen({super.key});
  @override
  State<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends State<SecurityScreen> {
  final curC = TextEditingController();
  final newC = TextEditingController();
  final new2C = TextEditingController();
  bool saving = false;
  bool hideCur = true;
  bool hideNew = true;

  @override
  void dispose() {
    curC.dispose();
    newC.dispose();
    new2C.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (newC.text.length < 6) {
      _snack('Password baru minimal 6 karakter');
      return;
    }
    if (newC.text != new2C.text) {
      _snack('Ulangi password baru tidak sama');
      return;
    }
    if (!await ensureOnline(context)) return;
    setState(() => saving = true);
    try {
      final dio = await ApiClient.instance.dio();
      await dio.patch('/api/users/me', data: {
        'newPassword': newC.text,
        if (curC.text.isNotEmpty)
          'currentPassword': curC.text,
      });
      curC.clear();
      newC.clear();
      new2C.clear();
      _snack('Password diganti ✓');
    } on DioException catch (e) {
      _snack(serverMsg(e));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  void _snack(String m) {
    if (!mounted) return;
    showTopSnack(context, SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Keamanan & Password')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const Text(
              'Ganti password butuh koneksi. Bila akun punya password lama, wajib diisi.'),
          const SizedBox(height: 12),
          TextField(
              controller: curC,
              obscureText: hideCur,
              decoration: InputDecoration(
                  labelText: 'Password lama (bila ada)',
                  border: const OutlineInputBorder(),
                  filled: true,
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                      icon: Icon(hideCur
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined),
                      onPressed: () =>
                          setState(() => hideCur = !hideCur)))),
          const SizedBox(height: 12),
          TextField(
              controller: newC,
              obscureText: hideNew,
              decoration: InputDecoration(
                  labelText: 'Password baru (min 6)',
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
              obscureText: hideNew,
              onSubmitted: (_) => _save(),
              decoration: const InputDecoration(
                  labelText: 'Ulangi password baru',
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
            label: const Text('Ganti Password'),
          ),
        ]),
      );
}
