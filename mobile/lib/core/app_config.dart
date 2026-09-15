import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:shared_preferences/shared_preferences.dart';

/// Config server — bisa diganti di Settings.
/// Default: localhost untuk desktop, 10.0.2.2 untuk emulator Android.
class AppConfig {
  static const _kBaseUrl = 'base_url';
  static const _kDeviceId = 'device_id';
  static const _kMeja = 'meja_label';

  static const defaultEmulator = 'http://192.168.1.85:3000';
  static const defaultDesktop = 'http://192.168.1.85:3000';
  static const defaultLaptop = 'http://192.168.1.85:3000';

  static Future<String> getBaseUrl() async {
    final p = await SharedPreferences.getInstance();
    final saved = p.getString(_kBaseUrl);
    if (saved != null && saved.isNotEmpty) return saved;
    if (!kIsWeb && (Platform.isWindows || Platform.isLinux || Platform.isMacOS)) {
      return defaultDesktop;
    }
    return defaultEmulator;
  }

  static Future<void> setBaseUrl(String v) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_kBaseUrl, v.trim().replaceAll(RegExp(r'/$'), ''));
  }

  static Future<String> getDeviceId() async {
    final p = await SharedPreferences.getInstance();
    var id = p.getString(_kDeviceId);
    if (id == null) {
      final tag = (!kIsWeb && Platform.isWindows)
          ? 'windows'
          : (!kIsWeb && (Platform.isLinux || Platform.isMacOS))
              ? 'desktop'
              : (!kIsWeb && Platform.isIOS)
                  ? 'ios'
                  : 'android';
      id =
          '$tag-${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}';
      await p.setString(_kDeviceId, id);
    }
    return id;
  }

  /// Meja terakhir per acara.
  static Future<String?> getMejaFor(String eventId) async {
    final p = await SharedPreferences.getInstance();
    return p.getString('$_kMeja:$eventId');
  }

  static Future<void> setMejaFor(String eventId, String v) async {
    final p = await SharedPreferences.getInstance();
    await p.setString('$_kMeja:$eventId', v);
  }
}
