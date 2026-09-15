/// Aturan teks nama orang: huruf saja (boleh spasi, apostrof, titik, hubung),
/// tanpa angka/simbol lain. Kapital otomatis tiap awal kata.
final _namaOk =
    RegExp(r"^[\p{L} .'\-]+$", unicode: true);

bool isValidNama(String v) {
  final t = v.trim();
  if (t.length < 2 || t.length > 80) return false;
  return _namaOk.hasMatch(t);
}

/// "sutrisno WIJAYA" -> "Sutrisno Wijaya". Juga rapikan spasi ganda.
String capitalizeWords(String raw) {
  return raw
      .trim()
      .replaceAll(RegExp(r'\s+'), ' ')
      .split(' ')
      .map((w) {
        if (w.isEmpty) return w;
        final lower = w.toLowerCase();
        // jaga singkatan bertitik ("Hj.", "S.H.") tetap rapi
        return lower
            .split('.')
            .map((p) => p.isEmpty
                ? p
                : '${p[0].toUpperCase()}${p.substring(1)}')
            .join('.');
      })
      .join(' ');
}
