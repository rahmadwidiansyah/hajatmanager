import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Session + PIN offline.
/// Alur: login online sekali -> simpan user JSON (prefs) + set PIN (secure).
/// Buka berikutnya: PIN unlock walau offline.
class AuthStore {
  static const _kUser = 'cached_user';
  static const _kPinHash = 'app_pin_hash';
  static const _kLastUnlock = 'last_unlock_ms';
  static const _kPinGraceMin = 'pin_grace_min';
  static const _storage = FlutterSecureStorage();

  /// Grace period default 5 menit (bisa diubah di Pengaturan Akun).
  /// 0 = selalu kunci.
  static Future<int> pinGraceMin() async {
    final p = await SharedPreferences.getInstance();
    return p.getInt(_kPinGraceMin) ?? 5;
  }

  static Future<void> setPinGraceMin(int v) async {
    final p = await SharedPreferences.getInstance();
    await p.setInt(_kPinGraceMin, v);
  }

  /// True bila unlock terakhir masih dalam grace period.
  static Future<bool> withinGrace() async {
    final grace = await pinGraceMin();
    if (grace <= 0) return false;
    final p = await SharedPreferences.getInstance();
    final last = p.getInt(_kLastUnlock) ?? 0;
    return DateTime.now().millisecondsSinceEpoch - last <
        grace * 60 * 1000;
  }

  static Future<void> markUnlocked() async {
    final p = await SharedPreferences.getInstance();
    await p.setInt(
        _kLastUnlock, DateTime.now().millisecondsSinceEpoch);
  }

  static Future<void> saveUser(Map<String, dynamic> user) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_kUser, jsonEncode(user));
  }

  static Future<Map<String, dynamic>?> cachedUser() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString(_kUser);
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<bool> hasPin() async =>
      (await _storage.read(key: _kPinHash)) != null;

  static String _hash(String pin, String salt) =>
      sha256.convert(utf8.encode('$salt::$pin')).toString();

  static Future<void> setPin(String pin) async {
    final user = await cachedUser();
    final salt = '${user?['email'] ?? 'hajat'}';
    await _storage.write(key: _kPinHash, value: _hash(pin, salt));
    await markUnlocked();
  }

  static Future<bool> verifyPin(String pin) async {
    final stored = await _storage.read(key: _kPinHash);
    if (stored == null) return false;
    final user = await cachedUser();
    final salt = '${user?['email'] ?? 'hajat'}';
    return stored == _hash(pin, salt);
  }

  static Future<void> logout({bool keepPin = false}) async {
    final p = await SharedPreferences.getInstance();
    await p.remove(_kUser);
    if (!keepPin) await _storage.delete(key: _kPinHash);
  }
}
