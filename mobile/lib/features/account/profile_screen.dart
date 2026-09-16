import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/auth_store.dart';
import '../../widgets/app_widgets.dart';

/// Sub: Profil — nama, username, email.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final nameC = TextEditingController();
  final unameC = TextEditingController();
  final emailC = TextEditingController();
  bool loading = true;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    nameC.dispose();
    unameC.dispose();
    emailC.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final cached = await AuthStore.cachedUser();
    if (mounted && cached != null) {
      setState(() {
        nameC.text = '${cached['name'] ?? ''}';
        unameC.text = '${cached['username'] ?? ''}';
        emailC.text = '${cached['email'] ?? ''}';
        loading = false;
      });
    }
    try {
      final dio = await ApiClient.instance.dio();
      final r = await dio.get('/api/users/me');
      final j = Map<String, dynamic>.from(r.data as Map);
      await AuthStore.saveUser(j);
      if (!mounted) return;
      setState(() {
        nameC.text = '${j['name'] ?? ''}';
        unameC.text = '${j['username'] ?? ''}';
        emailC.text = '${j['email'] ?? ''}';
        loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _save() async {
    if (nameC.text.trim().length < 2) {
      _snack('Nama minimal 2 huruf');
      return;
    }
    if (!await ensureOnline(context)) return;
    setState(() => saving = true);
    try {
      final dio = await ApiClient.instance.dio();
      final r = await dio.patch('/api/users/me', data: {
        'name': nameC.text.trim(),
        if (unameC.text.trim().isNotEmpty)
          'username': unameC.text.trim(),
        if (emailC.text.trim().isNotEmpty)
          'email': emailC.text.trim(),
      });
      final j = Map<String, dynamic>.from(r.data as Map);
      final cached = await AuthStore.cachedUser() ?? {};
      await AuthStore.saveUser({...cached, ...j});
      _snack('Profil tersimpan ✓');
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
        appBar: AppBar(title: const Text('Profil')),
        body: loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(padding: const EdgeInsets.all(16), children: [
                TextField(
                    controller: nameC,
                    textCapitalization:
                        TextCapitalization.words,
                    decoration: const InputDecoration(
                        labelText: 'Nama',
                        border: OutlineInputBorder(),
                        filled: true,
                        prefixIcon:
                            Icon(Icons.person_outline))),
                const SizedBox(height: 12),
                TextField(
                    controller: unameC,
                    decoration: const InputDecoration(
                        labelText: 'Username (opsional)',
                        border: OutlineInputBorder(),
                        filled: true,
                        prefixIcon: Icon(
                            Icons.alternate_email_outlined))),
                const SizedBox(height: 12),
                TextField(
                    controller: emailC,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                        labelText: 'Email',
                        border: OutlineInputBorder(),
                        filled: true,
                        prefixIcon:
                            Icon(Icons.email_outlined))),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: saving ? null : _save,
                  icon: saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2))
                      : const Icon(Icons.save_outlined),
                  label: const Text('Simpan Profil'),
                ),
              ]),
      );
}
