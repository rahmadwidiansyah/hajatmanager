import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/api_client.dart';
import 'core/app_theme.dart';
import 'core/auth_store.dart';
import 'core/background_sync.dart';
import 'core/local_db.dart';
import 'core/sync_engine.dart';
import 'core/theme_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/pin_screen.dart';
import 'features/events/events_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Locale id_ID untuk DateFormat/NumberFormat di export — tanpa ini
  // release build throw "Locale data has not been initialized".
  try {
    await initializeDateFormatting('id_ID', null);
  } catch (_) {}
  await initLocalDb(); // wajib sebelum SQLite dipakai (desktop/FFI)
  await configureBackgroundSync();
  await ThemeController.load(); // Fase A: pilihan tema tersimpan
  runApp(const ProviderScope(child: HajatApp()));
}

class HajatApp extends StatelessWidget {
  const HajatApp({super.key});
  @override
  Widget build(BuildContext context) {
    // Fase A: ganti tema instan tanpa restart.
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: ThemeController.mode,
      builder: (_, mode, _) => MaterialApp(
        title: 'Hajat Manager',
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        themeMode: mode,
        home: const _Gate(),
      ),
    );
  }
}

/// Gate: belum login -> Login; sudah login + ada PIN -> PIN lock; sudah login tanpa PIN -> setup PIN.
class _Gate extends StatefulWidget {
  const _Gate();
  @override
  State<_Gate> createState() => _GateState();
}

class _GateState extends State<_Gate> {
  bool loading = true;
  bool logged = false;
  bool needPin = false;
  bool hasPin = false;
  bool serverHasPin = false;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    SyncEngine.instance.start();
    final cached = await AuthStore.cachedUser();
    if (cached != null) {
      // coba validasi session server best-effort (boleh offline)
      final s = await ApiClient.instance.session().timeout(
        const Duration(seconds: 6),
        onTimeout: () => cached,
      );
      logged = s != null;
    }
    hasPin = await AuthStore.hasPin();
    needPin = logged && !hasPin;
    if (needPin) {
      // Best-effort: kalau server masih punya PIN, minta PIN lama
      // (tidak perlu buat baru). Offline → tetap ke setup baru.
      serverHasPin =
          await ApiClient.instance
              .pinStatus()
              .timeout(const Duration(seconds: 6), onTimeout: () => null)
              .catchError((_) => null) ==
          true;
    }
    // Grace period: buka lagi dalam X menit → lewati PIN.
    if (logged && hasPin && await AuthStore.withinGrace()) {
      hasPin = false;
    }
    if (mounted) setState(() => loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (!logged) return const LoginScreen();
    if (hasPin) return const PinLockScreen();
    if (needPin) {
      if (serverHasPin) return const PinRestoreScreen();
      return const PinSetupScreen();
    }
    return const EventsScreen();
  }
}
