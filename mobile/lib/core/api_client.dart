import 'dart:io' show Platform;

import 'package:dio/dio.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:google_sign_in/google_sign_in.dart';
import 'package:path_provider/path_provider.dart';
import 'app_config.dart';

/// Dio + persistent cookie (Auth.js session) — mirror web login.
/// Credentials flow Auth.js v5:
///   GET /api/auth/csrf -> {csrfToken}
///   POST /api/auth/callback/credentials (form) -> cookie session
class ApiClient {
  static final ApiClient instance = ApiClient._();
  ApiClient._();
  Dio? _dio;
  PersistCookieJar? _jar;

  Future<Dio> dio() async {
    if (_dio != null) return _dio!;
    final dir = await getApplicationDocumentsDirectory();
    _jar = PersistCookieJar(storage: FileStorage('${dir.path}/cookies'));
    final base = await AppConfig.getBaseUrl();
    final d = Dio(BaseOptions(
      baseUrl: base,
      connectTimeout: const Duration(seconds: 12),
      receiveTimeout: const Duration(seconds: 12),
      headers: {'Accept': 'application/json'},
    ));
    d.interceptors.add(CookieManager(_jar!));
    d.interceptors.add(LogInterceptor(requestBody: false, responseBody: false));
    _dio = d;
    return d;
  }

  Future<void> rebuild() async {
    _dio = null;
    await dio();
  }

  Future<bool> health() async {
    try {
      final d = await dio();
      final r = await d.get('/api/health');
      return r.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<Map<String, dynamic>?> session() async {
    try {
      final d = await dio();
      final r = await d.get('/api/auth/session');
      if (r.statusCode == 200 && r.data is Map) {
        final m = Map<String, dynamic>.from(r.data as Map);
        if (m['user'] != null) return m;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<(bool, String?)> loginEmail(String email, String password) async {
    try {
      final d = await dio();
      final csrf = await d.get('/api/auth/csrf');
      final token = (csrf.data is Map)
          ? '${(csrf.data as Map)['csrfToken'] ?? ''}'
          : '';
      final res = await d.post(
        '/api/auth/callback/credentials',
        data: {
          'csrfToken': token,
          'email': email,
          'password': password,
          'callbackUrl': '/dashboard',
          'json': 'true',
        },
        options: Options(
            contentType: Headers.formUrlEncodedContentType,
            followRedirects: false,
            validateStatus: (s) => (s ?? 500) < 500),
      );
      // Auth.js return 200 {url} tanpa ?error= pada sukses
      final data = res.data;
      if (res.statusCode == 200) {
        if (data is Map && '${data['url'] ?? ''}'.contains('error=')) {
          return (false, 'Email / password salah');
        }
        final s = await session();
        if (s != null) return (true, null);
        return (false, 'Session tidak terbentuk, coba lagi');
      }
      if (res.statusCode == 302) {
        final loc = res.headers['location']?.first ?? '';
        if (loc.contains('error=')) return (false, 'Email / password salah');
        final s = await session();
        if (s != null) return (true, null);
      }
      return (false, 'Login gagal (${res.statusCode})');
    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.connectionError) {
        return (false, 'Tidak ada koneksi ke server');
      }
      return (false, 'Login gagal: ${e.message}');
    } catch (e) {
      return (false, '$e');
    }
  }

  Future<(bool, String?)> register(
      String name, String email, String password) async {
    try {
      final d = await dio();
      final r = await d.post('/api/register',
          data: {'name': name, 'email': email, 'password': password});
      if (r.statusCode == 200 || r.statusCode == 201) return (true, null);
      return (false, 'Gagal daftar (${r.statusCode})');
    } on DioException catch (e) {
      final msg = (e.response?.data is Map)
          ? '${(e.response!.data as Map)['error'] ?? e.message}'
          : '${e.message}';
      return (false, msg);
    }
  }

  Future<void> logout() async {
    if (supportsGoogleSignIn) {
      try {
        await GoogleSignIn.instance.signOut();
      } catch (_) {}
    }
    try {
      final d = await dio();
      await d.post('/api/auth/signout');
    } catch (_) {}
    try {
      await _jar?.deleteAll();
    } catch (_) {}
  }

  /// Web client ID publik dari server (null = Google nonaktif).
  Future<String?> googleServerClientId() async {
    try {
      final d = await dio();
      final r = await d.get('/api/auth/mobile/config');
      final id = (r.data as Map?)?['googleServerClientId'];
      return id is String && id.isNotEmpty ? id : null;
    } catch (_) {
      return null;
    }
  }

  /// Google Sign-In native hanya ada di Android/iOS.
  /// Di Windows/Linux/Web plugin tidak ada → pakai login email.
  static bool get supportsGoogleSignIn =>
      !kIsWeb && (Platform.isAndroid || Platform.isIOS);

  /// serverClientId yang dipakai initialize() terakhir.
  /// SDK mewajibkan initialize() exactly-once — jangan panggil tiap tap.
  String? _googleInitFor;

  /// Pastikan GoogleSignIn ter-init sekali per serverClientId.
  Future<void> ensureGoogleInitialized(String? serverClientId) async {
    if (_googleInitFor == serverClientId && serverClientId != null) return;
    await GoogleSignIn.instance
        .initialize(serverClientId: serverClientId);
    _googleInitFor = serverClientId;
  }

  /// Login Google native: popup akun HP → ID token → session cookie server.
  /// Returns (sukses, pesanError). pesanError selalu terisi bila gagal,
  /// termasuk saat user membatalkan (agar UI tidak diam).
  Future<(bool, String?)> loginGoogle({String? serverClientId}) async {
    if (!supportsGoogleSignIn) {
      return (false, 'Login Google hanya di Android/iOS — pakai email');
    }
    try {
      await ensureGoogleInitialized(serverClientId);
      // Bersihkan credential state basi (SDK: jangan authenticate ulang
      // tanpa signOut) — abaikan bila gagal, bukan fatal.
      try {
        await GoogleSignIn.instance.signOut();
      } catch (_) {}
      final account =
          await GoogleSignIn.instance.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        return (false, 'Token Google kosong — coba lagi');
      }
      final d = await dio();
      final r = await d.post('/api/auth/mobile/google',
          data: {'idToken': idToken});
      if (r.statusCode == 200) {
        final s = await session();
        if (s != null) return (true, null);
        return (false, 'Session tidak terbentuk, coba lagi');
      }
      return (false, 'Login Google gagal (${r.statusCode})');
    } on GoogleSignInException catch (e) {
      // Catat detail agar cancel-sistem (CredentialManager) bisa dibedakan
      // dari user-back — kirim via logcat: adb logcat | grep GoogleSignIn
      debugPrint(
          '[GoogleSignIn] code=${e.code.name} description=${e.description} details=${e.details}');
      if (e.code == GoogleSignInExceptionCode.canceled) {
        return (false, 'Login Google dibatalkan — tap lagi untuk coba');
      }
      if (e.code ==
          GoogleSignInExceptionCode.clientConfigurationError) {
        return (
          false,
          'Google belum dikonfigurasi (SHA-1 / client ID) — hubungi admin'
        );
      }
      return (false, 'Google: ${e.description ?? e.code.name}');
    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.connectionError) {
        return (false, 'Tidak ada koneksi ke server');
      }
      final err = (e.response?.data as Map?)?['error'];
      if (err == 'INVALID_GOOGLE_TOKEN' || err == 'AUD_MISMATCH') {
        return (false, 'Token Google ditolak server — coba lagi');
      }
      return (false, 'Login Google gagal: ${err ?? e.message}');
    } catch (e) {
      return (false, '$e');
    }
  }

  /// Search user untuk tambah anggota (mirror web `/api/users/search?q=`).
  /// Cari by nama / username / email (backend `OR contains insensitive`).
  /// netError=true bila query >= 2 huruf tapi request gagal (jaringan/server),
  /// agar UI bisa bedakan "tak terjangkau" vs "tidak ketemu".
  Future<
      ({
        List<Map<String, dynamic>> users,
        bool netError
      })> searchUsers(String q) async {
    final query = q.trim();
    if (query.length < 2) {
      return (users: <Map<String, dynamic>>[], netError: false);
    }
    try {
      final d = await dio();
      final r = await d.get('/api/users/search',
          queryParameters: {'q': query});
      if (r.statusCode == 200 && r.data is List) {
        return (
          users: (r.data as List)
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList(),
          netError: false
        );
      }
      return (users: <Map<String, dynamic>>[], netError: true);
    } catch (_) {
      return (users: <Map<String, dynamic>>[], netError: true);
    }
  }

  /// PIN server (6 digit, bcrypt di `User.appPinHash`).
  /// Dipakai agar logout (yang hapus PIN lokal) → login lagi
  /// tidak perlu buat baru kalau server masih punya PIN.
  /// Return null bila offline / gagal (fallback ke logika lokal).

  Future<bool?> pinStatus() async {
    try {
      final d = await dio();
      final r = await d.get('/api/users/pin');
      if (r.statusCode == 200 && r.data is Map) {
        final m = r.data as Map;
        if (m.containsKey('hasPin')) return m['hasPin'] == true;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<bool> setServerPin(String pin) async {
    try {
      final d = await dio();
      final r = await d.post('/api/users/pin', data: {'pin': pin});
      return r.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// Verifikasi PIN lama ke server (tanpa mengubah).
  /// Returns (ok, pesanError).
  Future<(bool, String?)> verifyServerPin(String pin) async {
    try {
      final d = await dio();
      final r = await d.post('/api/users/pin/verify', data: {'pin': pin});
      if (r.statusCode == 200) return (true, null);
      return (false, 'PIN salah');
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      final err = (e.response?.data as Map?)?['error'];
      if (code == 404 || err == 'PIN_NOT_SET') {
        return (false, 'PIN_NOT_SET');
      }
      if (code == 400) return (false, 'PIN salah');
      return (false, 'Tidak ada koneksi ke server');
    } catch (e) {
      return (false, '$e');
    }
  }

  /// Ganti PIN server (dipakai dari Settings → Ganti PIN).
  /// Best-effort: return false bila offline (PIN lokal tetap diganti).
  Future<(bool, String?)> changeServerPin(String pin,
      {String? currentPin}) async {
    try {
      final d = await dio();
      final data = <String, String>{'pin': pin};
      if (currentPin != null) data['currentPin'] = currentPin;
      final r = await d.patch('/api/users/pin', data: data);
      if (r.statusCode == 200) return (true, null);
      return (false, 'Gagal sync PIN ke server');
    } on DioException catch (e) {
      final err = (e.response?.data as Map?)?['error'];
      if (err == 'PIN lama salah') return (false, 'PIN lama salah (server)');
      return (false, null); // offline → diam, PIN lokal tetap sah
    } catch (_) {
      return (false, null);
    }
  }
}
