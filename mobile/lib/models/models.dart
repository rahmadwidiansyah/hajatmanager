// Model ringan mirror Prisma schema (Event, GuestBook, Guest).
class EventModel {
  final String id;
  final String namaAcara;
  final String? namaTuanRumah;
  final DateTime tanggal;
  final String? lokasi;
  final String? catatan;
  final List<String> mejaList;
  final String? lastSyncAt;
  final String myRole;

  EventModel({
    required this.id,
    required this.namaAcara,
    this.namaTuanRumah,
    required this.tanggal,
    this.lokasi,
    this.catatan,
    this.mejaList = const ['MEJA-1', 'MEJA-2'],
    this.lastSyncAt,
    this.myRole = 'VIEWER',
  });

  factory EventModel.fromJson(Map<String, dynamic> j,
      {String? myUserId}) {
    String role = 'VIEWER';
    final members = j['members'] as List?;
    if (members != null && myUserId != null) {
      for (final m in members) {
        if (m is Map && '${(m['user'] as Map?)?['id'] ?? m['userId']}' == myUserId) {
          role = '${m['role'] ?? 'VIEWER'}';
          break;
        }
      }
    }
    return EventModel(
        id: '${j['id']}',
        namaAcara: '${j['namaAcara'] ?? '-'}',
        namaTuanRumah: j['namaTuanRumah'] as String?,
        tanggal: DateTime.tryParse('${j['tanggal']}') ?? DateTime.now(),
        lokasi: j['lokasi'] as String?,
        catatan: j['catatan'] as String?,
        mejaList: (j['mejaList'] as List?)?.map((e) => '$e').toList() ??
            const ['MEJA-1', 'MEJA-2'],
        lastSyncAt: j['lastSyncAt']?.toString(),
        myRole: role,
      );
  }

  Map<String, dynamic> toLocal() => {
        'id': id,
        'namaAcara': namaAcara,
        'namaTuanRumah': namaTuanRumah,
        'tanggal': tanggal.toIso8601String(),
        'lokasi': lokasi,
        'catatan': catatan,
        'mejaList': mejaList.join(','),
        'lastSyncAt': lastSyncAt,
      };
}

class GuestBookModel {
  final String id;
  final String eventId;
  final String nama;
  final String alamat;
  GuestBookModel(
      {required this.id,
      required this.eventId,
      required this.nama,
      required this.alamat});
  factory GuestBookModel.fromJson(Map<String, dynamic> j) => GuestBookModel(
      id: '${j['id']}',
      eventId: '${j['eventId']}',
      nama: '${j['nama']}',
      alamat: '${j['alamat']}');
}

class GuestModel {
  final String id;
  final String eventId;
  final String nama;
  final String alamat;
  final int nominal;
  final String metode;
  final String? catatan;
  final String? mejaLabel;
  final String createdAt;
  GuestModel({
    required this.id,
    required this.eventId,
    required this.nama,
    required this.alamat,
    required this.nominal,
    required this.metode,
    this.catatan,
    this.mejaLabel,
    required this.createdAt,
  });
  factory GuestModel.fromJson(Map<String, dynamic> j) => GuestModel(
        id: '${j['id']}',
        eventId: '${j['eventId']}',
        nama: '${j['nama']}',
        alamat: '${j['alamat']}',
        nominal: (j['nominal'] as num?)?.toInt() ?? 0,
        metode: '${j['metode'] ?? 'AMPLOP'}',
        catatan: j['catatan'] as String?,
        mejaLabel: j['mejaLabel'] as String?,
        createdAt: '${j['createdAt'] ?? ''}',
      );
}
