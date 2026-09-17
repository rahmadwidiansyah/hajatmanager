import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hajat_manager/core/exporter.dart';
import 'package:hajat_manager/core/local_db.dart';
import 'package:hajat_manager/core/format_rp.dart';
import 'package:hajat_manager/core/app_theme.dart';
import 'package:hajat_manager/core/name_rules.dart';

void main() {
  test('formatRp id_ID', () {
    expect(formatRp(100000), contains('Rp'));
    expect(formatRp(100000), contains('100.000'));
  });

  test('parseNominal', () {
    expect(parseNominal('Rp 50.000'), 50000);
    expect(parseNominal(''), 0);
  });

  test('M3 theme uses Material3', () {
    final light = AppTheme.light();
    final dark = AppTheme.dark();
    expect(light.useMaterial3, true);
    expect(dark.useMaterial3, true);
  });

  test('web colorway: primary emerald', () {
    expect(AppTheme.light().colorScheme.primary,
        const Color(0xFF059669));
    expect(AppTheme.dark().colorScheme.primary,
        const Color(0xFF34D399));
  });

  test('isValidNama: huruf saja', () {
    expect(isValidNama('Sutrisno'), true);
    expect(isValidNama('Siti Aminah'), true);
    expect(isValidNama("D'Angelo"), true);
    expect(isValidNama('Sutrisno123'), false);
    expect(isValidNama('Budi@Santoso'), false);
    expect(isValidNama('A'), false);
  });

  test('capitalizeWords tiap awal kata', () {
    expect(capitalizeWords('sutrisno WIJAYA'), 'Sutrisno Wijaya');
    expect(capitalizeWords('  siti   aminah '), 'Siti Aminah');
  });

  test('sortGuests nominal_desc', () {
    final rows = [
      {'nama': 'A', 'nominal': 50, 'createdAt': '2026-01-01'},
      {'nama': 'B', 'nominal': 200, 'createdAt': '2026-01-02'},
    ];
    final s = sortGuests(rows, 'nominal_desc');
    expect(s.first['nama'], 'B');
  });

  test('guestDedupeKey samakan kembaran sync', () {
    final lokal = {
      'nama': 'Budi',
      'alamat': 'Krajan',
      'nominal': 50000,
      'metode': 'amplop',
      'catatan': null
    };
    final server = {
      'nama': ' budi ',
      'alamat': 'KRAJAN',
      'nominal': 50000,
      'metode': 'AMPLOP',
      'catatan': ''
    };
    expect(LocalDb.guestDedupeKey(lokal),
        LocalDb.guestDedupeKey(server));
    final bedaCatatan = {...lokal, 'catatan': 'titip salam'};
    expect(LocalDb.guestDedupeKey(lokal) ==
        LocalDb.guestDedupeKey(bedaCatatan), false);
    final bedaNominal = {...lokal, 'nominal': 100000};
    expect(LocalDb.guestDedupeKey(lokal) ==
        LocalDb.guestDedupeKey(bedaNominal), false);
  });

  test('exportFilename aman', () {
    final f = exportFilename('Hajatan Budi & Ani',
        const ExportOptions(type: 'tamu'), 'xlsx');
    expect(f.contains('&'), false);
    expect(f.endsWith('.xlsx'), true);
  });
}
