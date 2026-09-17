import 'dart:io' show Platform;

import 'package:dio/dio.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:google_sign_in/google_sign_in.dart';
import 'package:path_provider/path_provider.dart';
import 'app_config.dart';
import 'auth_store.dart';

/// Dio + persistent cookie (Auth.js session) — mirror web login.
/// Credentials flow Auth.js v5:
///   GET /api/auth/csrf -> {csrfToken}
///   POST /api/auth/callback/credentials (form) -> cookie session
///
/// Fase 3: Bearer device-token diutamakan (header Authorization).
/// Cookie tetap sebagai fallback untuk server lama.
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
    // Fase 3: pulihkan Bearer dari secure storage bila ada.
    try {
      final t = await AuthStore.deviceToken();
      if (t != null && t.isNotEmpty) d.options.headers['Authorization'] = 'Bearer $t';
    } catch (_) {}
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
    // Fase 3: bila token ada, validasi via /device/me dulu.
    try {
      final t = await AuthStore.deviceToken();
      if (t != null && t.isNotEmpty) {
        final me = await deviceMe();
        if (me != null) return me;
      }
    } catch (_) {}
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

  /// Label platform untuk deviceName server (max 20 char di backend).
  static String get devicePlatform {
    if (kIsWeb) return 'web';
    if (Platform.isWindows) return 'windows';
    if (Platform.isLinux) return 'linux';
    if (Platform.isMacOS) return 'macos';
    if (Platform.isIOS) return 'ios';
    return 'android';
  }

  Future<Map<String, String>> _deviceMeta() async => {
        'deviceName': await AppConfig.getDeviceId(),
        'platform': devicePlatform,
      };

  void _applyToken(String? t) {
    if (_dio == null) return;
    if (t == null || t.isEmpty) {
      _dio!.options.headers.remove('Authorization');
    } else {
      _dio!.options.headers['Authorization'] = 'Bearer $t';
    }
  }

  /// Login via /api/auth/device/authorize (tanpa cookie).
  /// Returns (sukses, pesanError, notSupported=server lama 404).
  Future<(bool, String?, bool)> authorizeDevice(
      String email, String password) async {
    try {
      final d = await dio();
      final meta = await _deviceMeta();
      final r = await d.post('/api/auth/device/authorize', data: {
        'email': email.trim().toLowerCase(),
        'password': password,
        ...meta,
      });
      if ((r.statusCode == 200 || r.statusCode == 201) && r.data is Map) {
        final token = '${(r.data as Map)['token'] ?? ''}';
        if (token.isEmpty) return (false, 'Server tidak mengembalikan token', false);
        await AuthStore.saveDeviceToken(token);
        _applyToken(token);
        return (true, null, false);
      }
      return (false, 'Login gagal (${r.statusCode})', false);
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return (false, null, true);
      if (e.response?.statusCode == 401) return (false, 'Email / password salah', false);
      if (e.response?.statusCode == 429) {
        return (false, 'Terlalu banyak percobaan — tunggu 1 menit', false);
      }
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.connectionError) {
        return (false, 'Tidak ada koneksi ke server', false);
      }
      final err = (e.response?.data as Map?)?['error'];
      if (err is String && err.isNotEmpty) return (false, err, false);
      return (false, 'Login gagal: ${e.message}', false);
    } catch (e) {
      return (false, '$e', false);
    }
  }

  /// Tukar cookie session valid menjadi token (migrasi sekali jalan).
  Future<bool> upgradeToDeviceToken() async {
    try {
      if (await AuthStore.deviceToken() != null) return true;
      final d = await dio();
      final r = await d.post('/api/auth/device/upgrade',
          data: await _deviceMeta());
      if ((r.statusCode == 200 || r.statusCode == 201) && r.data is Map) {
        final token = '${(r.data as Map)['token'] ?? ''}';
        if (token.isEmpty) return false;
        await AuthStore.saveDeviceToken(token);
        _applyToken(token);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  /// Fase 4: tukar grant (loopback browser / tempel manual) menjadi Bearer.
  /// Returns (sukses, pesanError).
  Future<(bool, String?)> exchangeDeviceCode(String code) async {
    code = code.trim();
    if (code.length < 20) {
      return (false, 'Kode tidak valid — salin ulang dari browser');
    }
    try {
      final d = await dio();
      final meta = await _deviceMeta();
      final r = await d.post('/api/auth/device/code', data: {
        'code': code,
        ...meta,
      });
      if ((r.statusCode == 200 || r.statusCode == 201) && r.data is Map) {
        final token = '${(r.data as Map)['token'] ?? ''}';
        if (token.isEmpty) {
          return (false, 'Server tidak mengembalikan token');
        }
        await AuthStore.saveDeviceToken(token);
        _applyToken(token);
        return (true, null);
      }
      return (false, 'Gagal tukar kode (${r.statusCode})');
    } on DioException catch (e) {
      if (e.response?.statusCode == 429) {
        return (false, 'Terlalu banyak percobaan — tunggu 1 menit');
      }
      final err = (e.response?.data as Map?)?['error'];
      if (err is String && err.isNotEmpty) return (false, err);
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.connectionError) {
        return (false, 'Tidak ada koneksi ke server');
      }
      return (false, 'Gagal tukar kode: ${e.message}');
    } catch (e) {
      return (false, '$e');
    }
  }

  /// Validasi Bearer via /device/me → {user}. 401 → token dibersihkan.
  Future<Map<String, dynamic>?> deviceMe() async {
    try {
      final d = await dio();
      final r = await d.get('/api/auth/device/me');
      if (r.statusCode == 401) {
        await AuthStore.clearDeviceToken();
        _applyToken(null);
        return null;
      }
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
    // Fase 3: Bearer dulu; fallback cookie bila server lama (404).
    final (dok, derr, notSupported) =
        await authorizeDevice(email, password);
    if (dok) {
      final s = await deviceMe();
      if (s != null) return (true, null);
      return (false, 'Session tidak terbentuk, coba lagi');
    }
    if (!notSupported) return (false, derr);
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
        if (s != null) {
          await upgradeToDeviceToken(); // migrasi cookie → token, best-effort
          return (true, null);
        }
        return (false, 'Session tidak terbentuk, coba lagi');
      }
      if (res.statusCode == 302) {
        final loc = res.headers['location']?.first ?? '';
        if (loc.contains('error=')) return (false, 'Email / password salah');
        final s = await session();
        if (s != null) {
          await upgradeToDeviceToken(); // migrasi cookie → token, best-effort
          return (true, null);
        }
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
    // Fase 3: revoke token perangkat best-effort (header masih terpasang).
    try {
      final d = await dio();
      await d.post('/api/auth/device/revoke', data: {'self': true});
    } catch (_) {}
    try {
      await AuthStore.clearDeviceToken();
    } catch (_) {}
    _applyToken(null);
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
      // Fase 3: coba tukar ID token langsung menjadi Bearer (server baru).
      try {
        final meta = await _deviceMeta();
        final dr = await d.post('/api/auth/device/google',
            data: {'idToken': idToken, ...meta});
        if ((dr.statusCode == 200 || dr.statusCode == 201) &&
            dr.data is Map) {
          final token = '${(dr.data as Map)['token'] ?? ''}';
          if (token.isNotEmpty) {
            await AuthStore.saveDeviceToken(token);
            _applyToken(token);
            final s = await deviceMe();
            if (s != null) return (true, null);
          }
        }
      } on DioException catch (e) {
        // 404 = server lama → lanjut ke flow cookie legacy di bawah.
        if (e.response?.statusCode != 404) {
          final err = (e.response?.data as Map?)?['error'];
          if (err == 'INVALID_GOOGLE_TOKEN' || err == 'AUD_MISMATCH') {
            return (false, 'Token Google ditolak server — coba lagi');
          }
        }
      } catch (_) {}
      final r = await d.post('/api/auth/mobile/google',
          data: {'idToken': idToken});
      if (r.statusCode == 200) {
        final s = await session();
        if (s != null) {
          await upgradeToDeviceToken(); // migrasi cookie → token, best-effort
          return (true, null);
        }
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
