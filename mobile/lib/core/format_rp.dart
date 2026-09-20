import 'package:intl/intl.dart';

final _rp = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

/// NBSP (U+00A0) dari intl id_ID diganti spasi biasa agar aman untuk
/// font Helvetica standar package:pdf (tanpa TTF custom) — cermin web utils.ts.
String formatRp(num v) {
  try {
    return _rp.format(v).replaceAll('\u00A0', ' ');
  } catch (_) {
    // Locale belum init (release build): fallback manual rupiah.
    final s = v.toInt().toString();
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      final rev = s.length - i;
      buf.write(s[i]);
      if (rev > 1 && rev % 3 == 1) buf.write('.');
    }
    return 'Rp $buf';
  }
}

int parseNominal(String raw) {
  final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
  if (digits.isEmpty) return 0;
  return int.tryParse(digits) ?? 0;
}
