import 'dart:io';
import 'dart:typed_data';
import 'package:excel/excel.dart';
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

String _stamp() =>
    DateFormat('d/M/yyyy HH:mm', 'id_ID').format(DateTime.now());
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
  final title =
      '$eventName — ${isPemberian ? 'Laporan Pemberian' : 'Buku Tamu'}';
  final meta =
      '${_stamp()} • $userName • ${rows.length} tamu${isPemberian ? ' • ${formatRp(totalNominal)}' : ''}';
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
  doc.addPage(pw.MultiPage(
    pageFormat: format,
    margin: const pw.EdgeInsets.all(16),
    header: (ctx) => ctx.pageNumber > 1
        ? pw.SizedBox()
        : pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
                pw.Text(title,
                    style: pw.TextStyle(
                        fontSize: 14,
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
    build: (_) => [table()],
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
  sh.appendRow([TextCellValue(eventName)]);
  sh.appendRow([
    TextCellValue(
        '${isPemberian ? 'Laporan Pemberian' : 'Buku Tamu'} • ${_stamp()} • ${rows.length} tamu')
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

/// Simpan ke file temp + share (format benar, bukan bytes PDF bernama xlsx).
Future<String> shareExportFile(
    List<int> bytes, String filename, String mime) async {
  final dir = await getTemporaryDirectory();
  final f = await File('${dir.path}/$filename')
      .writeAsBytes(bytes, flush: true);
  await SharePlus.instance.share(ShareParams(
    files: [XFile(f.path, mimeType: mime)],
    subject: filename,
  ));
  return f.path;
}

String exportFilename(String eventName, ExportOptions opt, String ext) {
  final safe = eventName
      .replaceAll(RegExp(r'[^\w\- ]+'), '')
      .trim()
      .replaceAll(RegExp(r'\s+'), '-')
      .toLowerCase();
  final kind = opt.type == 'pemberian' ? 'pemberian' : 'buku-tamu';
  return '$safe-$kind-${_fileDate()}.$ext';
}
