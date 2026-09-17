import 'package:flutter/material.dart';
import 'auth_store.dart';

/// Fase A: pilihan tema Terang/Gelap/Sistem.
/// Diubah dari layar Akun → berlaku instan tanpa restart.
class ThemeController {
  static final ValueNotifier<ThemeMode> mode =
      ValueNotifier(ThemeMode.system);

  static ThemeMode _parse(String v) => switch (v) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };

  static String _name(ThemeMode m) => switch (m) {
        ThemeMode.light => 'light',
        ThemeMode.dark => 'dark',
        ThemeMode.system => 'system',
      };

  /// Panggil sekali saat boot sebelum runApp.
  static Future<void> load() async {
    try {
      mode.value = _parse(await AuthStore.themeMode());
    } catch (_) {
      mode.value = ThemeMode.system;
    }
  }

  static Future<void> set(ThemeMode m) async {
    mode.value = m;
    try {
      await AuthStore.setThemeMode(_name(m));
    } catch (_) {}
  }
}
