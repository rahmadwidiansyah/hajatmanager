import 'dart:io';
import 'dart:typed_data';
import 'package:excel/excel.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:share_plus/share_plus.dart';
import 'format_rp.dart';
import 'local_db.dart';

/// Export mirror web (`EventClient.handleExport`):
/// jenis Pemberian/Buku Tamu, urutan, orientasi, header hijau + footer TOTAL.
class ExportOptions {
  final String type; // 'pemberian' | 'tamu'
  final String order; // nama_az|nama_za|alamat_az|nominal_desc|waktu_desc
  final bool landscape;
  const ExportOptions(
      {this.type = 'pemberian',
      this.order = 'waktu_desc',
      this.landscape = false});
}

const _exportOrders = {
  'waktu_desc': 'Waktu terbaru',
  'nama_az': 'Nama A–Z',
  'nama_za': 'Nama Z–A',
  'alamat_az': 'Alamat A–Z',
  'nominal_desc': 'Nominal terbesar',
};

Map<String, String> exportOrderLabels() =>
    Map<String, String>.from(_exportOrders);

List<Map<String, dynamic>> sortGuests(
    List<Map<String, dynamic>> rows, String order) {
  final list = [...rows];
  int cmpStr(String a, String b) =>
      a.toLowerCase().compareTo(b.toLowerCase());
  switch (order) {
    case 'nama_az':
      list.sort((a, b) => cmpStr('${a['nama']}', '${b['nama']}'));
    case 'nama_za':
      list.sort((a, b) => cmpStr('${b['nama']}', '${a['nama']}'));
    case 'alamat_az':
      list.sort((a, b) {
        final c = cmpStr('${a['alamat']}', '${b['alamat']}');
        return c != 0 ? c : cmpStr('${a['nama']}', '${b['nama']}');
      });
    case 'nominal_desc':
      list.sort((a, b) => ((b['nominal'] as int?) ?? 0)
          .compareTo((a['nominal'] as int?) ?? 0));
    case 'waktu_desc':
    default:
      list.sort((a, b) => '${b['createdAt'] ?? ''}'
          .compareTo('${a['createdAt'] ?? ''}'));
  }
  return list;
}

List<Map<String, dynamic>> sortBooks(
    List<Map<String, dynamic>> rows, String order) {
  final list = [...rows];
  int cmpStr(String a, String b) =>
      a.toLowerCase().compareTo(b.toLowerCase());
  switch (order) {
    case 'nama_za':
      list.sort((a, b) => cmpStr('${b['nama']}', '${a['nama']}'));
    case 'alamat_az':
      list.sort((a, b) {
        final c = cmpStr('${a['alamat']}', '${b['alamat']}');
        return c != 0 ? c : cmpStr('${a['nama']}', '${b['nama']}');
      });
    case 'nama_az':
    default:
      list.sort((a, b) => cmpStr('${a['nama']}', '${b['nama']}'));
  }
  return list;
}

final _green = PdfColor.fromInt(0xFF059669);
final _greenLight = PdfColor.fromInt(0xFFD1FAE5);
final _greenDark = PdfColor.fromInt(0xFF064E3B);
final _greyLine = PdfColor.fromInt(0xFFD2D2D2);
final _greyAlt = PdfColor.fromInt(0xFFF9FAFB);

bool _localeReady = false;

Future<void> ensureLocaleId() async {
  if (_localeReady) return;
  try {
    await initializeDateFormatting('id_ID', null);
    _localeReady = true;
  } catch (_) {
    // Fallback: pakai locale default, jangan throw saat export.
  }
}

String _stamp() {
  try {
    return DateFormat('d/M/yyyy HH:mm', 'id_ID').format(DateTime.now());
  } catch (_) {
    // Belum init (misal path export dipanggil sebelum main selesai):
    // fallback tanpa locale agar export tetap jalan.
    final n = DateTime.now();
    final d = n.day.toString().padLeft(2, '0');
    final m = n.month.toString().padLeft(2, '0');
    final h = n.hour.toString().padLeft(2, '0');
    final mi = n.minute.toString().padLeft(2, '0');
    return '$d/$m/${n.year} $h:$mi';
  }
}

String _fileDate() => DateFormat('yyyy-MM-dd').format(DateTime.now());

pw.Widget _cell(String t,
    {bool bold = false,
    PdfColor? color,
    double fontSize = 7,
    pw.Alignment align = pw.Alignment.centerLeft}) =>
    pw.Container(
      alignment: align,
      padding: const pw.EdgeInsets.all(4),
      child: pw.Text(t,
          style: pw.TextStyle(
              fontSize: fontSize,
              fontWeight:
                  bold ? pw.FontWeight.bold : pw.FontWeight.normal,
              color: color)),
    );

Future<Uint8List> buildExportPdf({
  required String eventName,
  required String userName,
  required ExportOptions opt,
  required List<Map<String, dynamic>> rows,
}) async {
  await ensureLocaleId();
  final doc = pw.Document();
  final landscaped = opt.landscape;
  final format =
      landscaped ? PdfPageFormat.a4.landscape : PdfPageFormat.a4;
  final isPemberian = opt.type == 'pemberian';
  final headers = isPemberian
      ? ['No', 'Nama', 'Alamat', 'Nominal', 'Metode', 'Meja', 'Catatan']
      : ['No', 'Nama', 'Alamat'];
  final widths = isPemberian
      ? <int, pw.TableColumnWidth>{
          0: const pw.FixedColumnWidth(24),
          3: const pw.FixedColumnWidth(64),
          4: const pw.FixedColumnWidth(52),
          5: const pw.FixedColumnWidth(44),
        }
      : <int, pw.TableColumnWidth>{
          0: const pw.FixedColumnWidth(28),
        };
  int totalNominal = 0;
  final bodyRows = <pw.TableRow>[];
  for (var i = 0; i < rows.length; i++) {
    final g = rows[i];
    final cells = isPemberian
        ? [
            '${i + 1}',
            '${g['nama']}',
            '${g['alamat']}',
            formatRp((g['nominal'] as int?) ?? 0),
            '${g['metode'] ?? '-'}',
            '${g['mejaLabel'] ?? '-'}',
            '${g['catatan'] ?? '-'}',
          ]
        : ['${i + 1}', '${g['nama']}', '${g['alamat']}'];
    if (isPemberian) totalNominal += (g['nominal'] as int?) ?? 0;
    bodyRows.add(pw.TableRow(
      decoration: pw.BoxDecoration(
          color: i.isEven ? PdfColors.white : _greyAlt),
      children: cells.map((t) => _cell(t)).toList(),
    ));
  }
  final footCells = isPemberian
      ? ['', '', 'TOTAL', formatRp(totalNominal), '',
          '${rows.length} tamu', '']
      : ['', 'TOTAL', '${rows.length} tamu'];
  // Title aman-font: ASCII saja (| dan -), jangan samakan web yang pakai
  // em-dash/bullet (U+2014/U+2022) karena Helvetica standar pdf-Dart throw.
  final safeEvent =
      eventName.trim().isEmpty ? 'Acara' : eventName.trim();
  final safeUser = userName.trim().isEmpty ? '-' : userName.trim();
  final title =
      '$safeEvent - ${isPemberian ? 'Laporan Pemberian' : 'Buku Tamu'}';
  final meta =
      '${_stamp()} | $safeUser | ${rows.length} tamu${isPemberian ? ' | ${formatRp(totalNominal)}' : ''}';
  final perPage = landscaped ? 24 : 32;
  final totalPages = (rows.length / perPage).ceil().clamp(1, 9999);
  pw.Widget table() => pw.Column(children: [
        pw.Table(
          border: pw.TableBorder.all(color: _greyLine, width: 0.4),
          columnWidths: widths,
          children: [
            pw.TableRow(
              decoration: pw.BoxDecoration(color: _green),
              children: headers
                  .map((h) => _cell(h,
                      bold: true,
                      color: PdfColors.white,
                      fontSize: 8,
                      align: pw.Alignment.center))
                  .toList(),
            ),
            ...bodyRows,
            pw.TableRow(
              decoration: pw.BoxDecoration(color: _greenLight),
              children: footCells
                  .map((t) => _cell(t,
                      bold: true,
                      color: _greenDark,
                      fontSize: 8,
                      align: pw.Alignment.center))
                  .toList(),
            ),
          ],
        ),
      ]);

  // --- Rincian per Metode (cermin web EventClient 1213-1244) ---
  pw.Widget metodeTable() {
    if (!isPemberian) return pw.SizedBox();
    final map = <String, (int, int)>{};
    for (final g in rows) {
      final m = '${g['metode'] ?? '-'}';
      final n = (g['nominal'] as int?) ?? 0;
      final cur = map[m] ?? (0, 0);
      map[m] = (cur.$1 + 1, cur.$2 + n);
    }
    final entries = map.entries.toList()
      ..sort((a, b) => b.value.$2.compareTo(a.value.$2));
    final mBody = <pw.TableRow>[];
    for (var i = 0; i < entries.length; i++) {
      final e = entries[i];
      final porsi = totalNominal > 0
          ? '${((e.value.$2 / totalNominal) * 100).round()}%'
          : '0%';
      mBody.add(pw.TableRow(
        decoration: pw.BoxDecoration(
            color: i.isEven ? PdfColors.white : _greyAlt),
        children: [
          _cell(e.key),
          _cell('${e.value.$1}', align: pw.Alignment.center),
          _cell(formatRp(e.value.$2), align: pw.Alignment.centerRight),
          _cell(porsi, align: pw.Alignment.center),
        ],
      ));
    }
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.SizedBox(height: 12),
        pw.Text('Rincian per Metode',
            style:
                pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold)),
        pw.Text('Total ${rows.length} catatan | ${formatRp(totalNominal)}',
            style: const pw.TextStyle(fontSize: 7)),
        pw.SizedBox(height: 6),
        pw.Table(
          border: pw.TableBorder.all(color: _greyLine, width: 0.4),
          children: [
            pw.TableRow(
              decoration: pw.BoxDecoration(color: _green),
              children: ['Metode', 'Jumlah', 'Total', 'Porsi']
                  .map((h) => _cell(h,
                      bold: true,
                      color: PdfColors.white,
                      fontSize: 8,
                      align: pw.Alignment.center))
                  .toList(),
            ),
            ...mBody,
            pw.TableRow(
              decoration: pw.BoxDecoration(color: _greenLight),
              children: [
                _cell('TOTAL', bold: true, color: _greenDark, fontSize: 8,
                    align: pw.Alignment.center),
                _cell('${rows.length}', bold: true, color: _greenDark,
                    fontSize: 8, align: pw.Alignment.center),
                _cell(formatRp(totalNominal), bold: true, color: _greenDark,
                    fontSize: 8, align: pw.Alignment.centerRight),
                _cell('100%', bold: true, color: _greenDark, fontSize: 8,
                    align: pw.Alignment.center),
              ],
            ),
          ],
        ),
      ],
    );
  }

  // --- Serah terima 3 kolom (cermin web 1246-1294) ---
  pw.Widget signBlock(String title, String subtitle, bool optional) =>
      pw.Expanded(
        child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text(title,
                style: pw.TextStyle(
                    fontSize: 7.5, fontWeight: pw.FontWeight.bold)),
            pw.Text(subtitle,
                style: pw.TextStyle(
                    fontSize: 6.5,
                    fontStyle: optional
                        ? pw.FontStyle.italic
                        : pw.FontStyle.normal)),
            pw.SizedBox(height: 4),
            for (final label in ['Nama', 'Tanggal', 'Tanda tangan'])
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Row(children: [
                    pw.SizedBox(
                        width: 52, child: _cell(label, fontSize: 7)),
                    pw.Expanded(
                        child: pw.Container(
                            height: 14,
                            decoration: const pw.BoxDecoration(
                                border: pw.Border(
                                    bottom: pw.BorderSide(
                                        color: PdfColors.grey, width: 0.5))))),
                  ]),
                  pw.SizedBox(height: label == 'Tanda tangan' ? 14 : 8),
                ],
              ),
          ],
        ),
      );

  pw.Widget signSection() {
    if (!isPemberian) return pw.SizedBox();
    return pw.Column(children: [
      pw.SizedBox(height: 12),
      pw.Divider(color: _greyLine, thickness: 0.5),
      pw.SizedBox(height: 6),
      pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          signBlock('Diserahkan oleh,', 'Petugas/Admin', false),
          pw.SizedBox(width: 12),
          signBlock('Diterima oleh,', 'Owner/Tuan Rumah', false),
          pw.SizedBox(width: 12),
          signBlock('Saksi,', 'Nama (opsional)', true),
        ],
      ),
    ]);
  }

  doc.addPage(pw.MultiPage(
    pageFormat: format,
    margin: const pw.EdgeInsets.all(16),
    header: (ctx) => ctx.pageNumber > 1
        ? pw.SizedBox()
        : pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
                pw.Text(title,
                    maxLines: 2,
                    style: pw.TextStyle(
                        fontSize: 11,
                        fontWeight: pw.FontWeight.bold)),
                pw.Text(meta,
                    style: const pw.TextStyle(fontSize: 8)),
                pw.SizedBox(height: 8),
              ]),
    footer: (ctx) => pw.Container(
        alignment: pw.Alignment.centerRight,
        child: pw.Text(
            'Halaman ${ctx.pageNumber} / $totalPages',
            style: const pw.TextStyle(fontSize: 7))),
    build: (_) => [table(), metodeTable(), signSection()],
  ));
  return doc.save();
}

void _styleLastRow(Sheet sh, CellStyle style) {
  if (sh.rows.isEmpty) return;
  for (final cell in sh.rows.last) {
    cell?.cellStyle = style;
  }
}

List<int>? buildExportXlsx({
  required String eventName,
  required ExportOptions opt,
  required List<Map<String, dynamic>> rows,
}) {
  final isPemberian = opt.type == 'pemberian';
  final ex = Excel.createExcel();
  final sh = ex['Rekap'];
  final headStyle = CellStyle(
      bold: true,
      backgroundColorHex: ExcelColor.fromHexString('#059669'),
      fontColorHex: ExcelColor.fromHexString('#FFFFFF'));
  final footStyle = CellStyle(
      bold: true,
      backgroundColorHex: ExcelColor.fromHexString('#D1FAE5'),
      fontColorHex: ExcelColor.fromHexString('#064E3B'));
  final safeEventX =
      eventName.trim().isEmpty ? 'Acara' : eventName.trim();
  sh.appendRow([TextCellValue(safeEventX)]);
  sh.appendRow([
    TextCellValue(
        '${isPemberian ? 'Laporan Pemberian' : 'Buku Tamu'} | ${_stamp()} | ${rows.length} tamu')
  ]);
  sh.appendRow([]);
  final head = isPemberian
      ? ['No', 'Nama', 'Alamat', 'Nominal', 'Metode', 'Meja', 'Catatan']
      : ['No', 'Nama', 'Alamat'];
  sh.appendRow(head.map(TextCellValue.new).toList());
  _styleLastRow(sh, headStyle);
  int totalNominal = 0;
  for (var i = 0; i < rows.length; i++) {
    final g = rows[i];
    if (isPemberian) {
      totalNominal += (g['nominal'] as int?) ?? 0;
      sh.appendRow([
        IntCellValue(i + 1),
        TextCellValue('${g['nama']}'),
        TextCellValue('${g['alamat']}'),
        IntCellValue((g['nominal'] as int?) ?? 0),
        TextCellValue('${g['metode'] ?? '-'}'),
        TextCellValue('${g['mejaLabel'] ?? '-'}'),
        TextCellValue('${g['catatan'] ?? '-'}'),
      ]);
    } else {
      sh.appendRow([
        IntCellValue(i + 1),
        TextCellValue('${g['nama']}'),
        TextCellValue('${g['alamat']}'),
      ]);
    }
  }
  if (isPemberian) {
    sh.appendRow([
      TextCellValue(''),
      TextCellValue(''),
      TextCellValue('TOTAL'),
      IntCellValue(totalNominal),
      TextCellValue(''),
      TextCellValue('${rows.length} tamu'),
      TextCellValue(''),
    ]);
  } else {
    sh.appendRow([
      TextCellValue(''),
      TextCellValue('TOTAL'),
      TextCellValue('${rows.length} tamu'),
    ]);
  }
  _styleLastRow(sh, footStyle);
  // Section Rincian per Metode (cermin PDF/web).
  if (isPemberian) {
    final map = <String, (int, int)>{};
    for (final g in rows) {
      final m = '${g['metode'] ?? '-'}';
      final n = (g['nominal'] as int?) ?? 0;
      final cur = map[m] ?? (0, 0);
      map[m] = (cur.$1 + 1, cur.$2 + n);
    }
    final entries = map.entries.toList()
      ..sort((a, b) => b.value.$2.compareTo(a.value.$2));
    sh.appendRow([]);
    sh.appendRow([TextCellValue('Rincian per Metode')]);
    sh.appendRow(['Metode', 'Jumlah', 'Total', 'Porsi%']
        .map(TextCellValue.new)
        .toList());
    _styleLastRow(sh, headStyle);
    for (final e in entries) {
      final porsi = totalNominal > 0
          ? '${((e.value.$2 / totalNominal) * 100).round()}%'
          : '0%';
      sh.appendRow([
        TextCellValue(e.key),
        IntCellValue(e.value.$1),
        IntCellValue(e.value.$2),
        TextCellValue(porsi),
      ]);
    }
    sh.appendRow([
      TextCellValue('TOTAL'),
      IntCellValue(rows.length),
      IntCellValue(totalNominal),
      TextCellValue('100%'),
    ]);
    _styleLastRow(sh, footStyle);
  }
  for (var i = 0; i < head.length; i++) {
    sh.setColumnWidth(i, isPemberian ? 18 : 24);
  }
  return ex.save();
}

/// Ambil baris lokal sesuai opsi (offline OK).
Future<List<Map<String, dynamic>>> exportRows(
    String eventId, ExportOptions opt) async {
  if (opt.type == 'tamu') {
    final books = await LocalDb.instance.booksLocal(eventId);
    return sortBooks(books, opt.order);
  }
  final guests = await LocalDb.instance.guestsLocal(eventId);
  return sortGuests(guests, opt.order);
}

/// Simpan ke file temp + share. Fallback: kalau Share gagal (misal Linux
/// tanpa handler / dbus), simpan ke Documents dan kembalikan path agar UI
/// bisa tampilkan "tersimpan di ..." bukan cuma "Export gagal".
Future<String> shareExportFile(
    List<int> bytes, String filename, String mime) async {
  final dir = await getTemporaryDirectory();
  final f = await File('${dir.path}/$filename')
      .writeAsBytes(bytes, flush: true);
  try {
    await SharePlus.instance.share(ShareParams(
      files: [XFile(f.path, mimeType: mime)],
      subject: filename,
    ));
    return f.path;
  } catch (_) {
    try {
      final docs = await getApplicationDocumentsDirectory();
      final g = await File('${docs.path}/$filename')
          .writeAsBytes(bytes, flush: true);
      return g.path;
    } catch (_) {
      // Terakhir: kembalikan path temp agar pemanggil tetap info lokasi.
      return f.path;
    }
  }
}

String exportFilename(String eventName, ExportOptions opt, String ext) {
  var safe = eventName
      .replaceAll(RegExp(r'[^\w\- ]+'), '')
      .trim()
      .replaceAll(RegExp(r'\s+'), '-')
      .toLowerCase();
  if (safe.isEmpty) safe = 'acara';
  if (safe == '-$ext' || safe.startsWith('-')) safe = 'acara$safe';
  final kind = opt.type == 'pemberian' ? 'pemberian' : 'buku-tamu';
  return '$safe-$kind-${_fileDate()}.$ext';
}
