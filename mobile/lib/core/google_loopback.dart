import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

/// Fase 4: login Google desktop via browser sistem + loopback lokal.
/// Alur: start() → buka /device/google?state=&port= di browser →
/// server redirect ke http://127.0.0.1:port/callback?code=&state= → tukar code
/// menjadi Bearer via ApiClient.exchangeDeviceCode().
class GoogleLoopbackResult {
  final String code;
  final String state;
  const GoogleLoopbackResult(this.code, this.state);
}

class GoogleLoopback {
  final HttpServer _server;
  final String state;
  GoogleLoopback._(this._server, this.state);

  int get port => _server.port;

  static Future<GoogleLoopback> start() async {
    final server =
        await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    return GoogleLoopback._(server, _randomState());
  }

  static String _randomState() {
    final r = Random.secure();
    final bytes = List<int>.generate(32, (_) => r.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }

  static String buildStartUrl(
      String base, int port, String state, String device) {
    final q = {
      'state': state,
      'port': '$port',
      if (device.isNotEmpty) 'device': device,
    };
    final query =
        q.entries.map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}').join('&');
    return '${base.replaceAll(RegExp(r'/$'), '')}/device/google?$query';
  }

  static const _okHtml = "<html><body style='font-family:sans-serif;"
      "text-align:center;padding-top:60px'><h2>Login berhasil ✓</h2>"
      "<p>Kembali ke aplikasi Hajat Manager.<br>Halaman ini bisa ditutup.</p>"
      "</body></html>";

  static const _missHtml = "<html><body style='font-family:sans-serif;"
      "text-align:center;padding-top:60px'><h2>Tautan tidak dikenali</h2>"
      "<p>Abaikan halaman ini dan ulangi dari aplikasi.</p></body></html>";

  /// Tunggu satu callback valid (default 5 menit). Null bila timeout/gagal.
  Future<GoogleLoopbackResult?> wait(
      {Duration timeout = const Duration(minutes: 5)}) async {
    final completer = Completer<GoogleLoopbackResult?>();
    late final StreamSubscription<HttpRequest> sub;
    final timer = Timer(timeout, () {
      if (!completer.isCompleted) completer.complete(null);
    });
    try {
      sub = _server.listen((req) async {
        try {
          if (req.uri.path == '/callback') {
            final code = req.uri.queryParameters['code'] ?? '';
            final st = req.uri.queryParameters['state'] ?? '';
            if (code.isNotEmpty && st == state) {
              req.response
                ..statusCode = 200
                ..headers.contentType = ContentType.html
                ..write(_okHtml);
              await req.response.close();
              if (!completer.isCompleted) {
                completer.complete(GoogleLoopbackResult(code, st));
              }
              return;
            }
          }
          req.response
            ..statusCode = 200
            ..headers.contentType = ContentType.html
            ..write(_missHtml);
          await req.response.close();
        } catch (_) {}
      }, onError: (_) {
        if (!completer.isCompleted) completer.complete(null);
      });
      final res = await completer.future;
      timer.cancel();
      await sub.cancel();
      return res;
    } catch (_) {
      timer.cancel();
      return null;
    }
  }

  Future<void> close() async {
    try {
      await _server.close(force: true);
    } catch (_) {}
  }
}
