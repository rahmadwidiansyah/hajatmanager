import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:shared_preferences/shared_preferences.dart';

/// Config server — bisa diganti di layar Login (kolom Server + Tes).
/// Default: server produksi. Install lama yang masih menyimpan IP dev
/// otomatis dimigrasi ke domain produksi (kecuali URL custom).
class AppConfig {
  static const _kBaseUrl = 'base_url';
  static const _kDeviceId = 'device_id';
  static const _kMeja = 'meja_label';

  static const defaultProd = 'https://hajat.sanding.online';
  static const defaultEmulator = defaultProd;
  static const defaultDesktop = defaultProd;
  static const defaultLaptop = defaultProd;

  /// Nilai lama (dev) yang otomatis dimigrasi ke produksi bila tersimpan.
  static const _legacyDefaults = {
    'http://192.168.1.85:3000',
    'http://127.0.0.1:3000',
    'http://10.0.2.2:3000',
    'https://hajat.widihhh.my.id',
    'http://hajat.widihhh.my.id',
  };

  static Future<String> getBaseUrl() async {
    final p = await SharedPreferences.getInstance();
    final saved = p.getString(_kBaseUrl);
    if (saved != null && saved.isNotEmpty) {
      if (_legacyDefaults.contains(saved.trim())) {
        await p.setString(_kBaseUrl, defaultProd);
        return defaultProd;
      }
      return saved;
    }
    return defaultProd;
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
