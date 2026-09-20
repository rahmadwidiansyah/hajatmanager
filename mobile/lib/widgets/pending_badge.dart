import 'package:flutter/material.dart';

import '../core/sync_engine.dart';

/// Badge antrean offline — hijau aman, oranye ada antrean.
class PendingBadge extends ListenableBuilder {
  PendingBadge({super.key, required String eventId})
    : super(
        listenable: SyncEngine.instance,
        builder: (context, _) {
          final c = SyncEngine.instance.pendingByEvent[eventId] ?? 0;
          final scheme = Theme.of(context).colorScheme;
          return Chip(
            avatar: Icon(
              c == 0 ? Icons.cloud_done_outlined : Icons.cloud_upload_outlined,
              size: 18,
              color: c == 0 ? scheme.primary : scheme.onTertiaryContainer,
            ),
            label: Text(c == 0 ? 'Tersinkron' : '$c antre'),
            backgroundColor: c == 0
                ? scheme.secondaryContainer
                : scheme.tertiaryContainer,
            labelStyle: TextStyle(
              color: c == 0
                  ? scheme.onSecondaryContainer
                  : scheme.onTertiaryContainer,
            ),
            visualDensity: VisualDensity.compact,
          );
        },
      );
}

class SyncStatusBadge extends ListenableBuilder {
  SyncStatusBadge({super.key})
    : super(
        listenable: SyncEngine.instance,
        builder: (context, _) {
          final sync = SyncEngine.instance;
          final scheme = Theme.of(context).colorScheme;
          final (label, icon, color) = sync.syncing
              ? ('Menyinkronkan', Icons.sync, scheme.primary)
              : !sync.online
              ? ('Offline', Icons.cloud_off_outlined, scheme.error)
              : sync.lastError != null
              ? ('Sync gagal', Icons.sync_problem_outlined, scheme.error)
              : ('Tersinkron', Icons.cloud_done_outlined, scheme.primary);
          return Tooltip(
            message: sync.lastError ?? label,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Icon(icon, size: 20, color: color),
            ),
          );
        },
      );
}

/// Tombol sync gabungan: 1 ikon awan saja (status + count + tap).
/// Menggantikan pemakaian ganda SyncStatusBadge + SyncBadge/IconButton.
class SyncButton extends ListenableBuilder {
  final String? eventId;
  final Future<void> Function()? onSync;
  SyncButton({super.key, this.eventId, this.onSync})
    : super(
        listenable: SyncEngine.instance,
        builder: (context, _) {
          final sync = SyncEngine.instance;
          final scheme = Theme.of(context).colorScheme;
          final pending = eventId == null
              ? sync.pendingByEvent.values.fold<int>(
                  0, (a, b) => a + b)
              : (sync.pendingByEvent[eventId] ?? 0);
          final (label, icon, color) = sync.syncing
              ? ('Menyinkronkan', Icons.sync, scheme.primary)
              : !sync.online
              ? (
                  'Offline${pending > 0 ? ' — $pending antre' : ''}',
                  Icons.cloud_off_outlined,
                  scheme.error
                )
              : sync.lastError != null
              ? ('Sync gagal — tap untuk coba lagi', Icons.sync_problem_outlined,
                  scheme.error)
              : pending > 0
              ? ('$pending antre — tap untuk sync',
                  Icons.cloud_upload_outlined, scheme.primary)
              : ('Tersinkron', Icons.cloud_done_outlined, scheme.primary);
          return Tooltip(
            message: sync.lastError ?? label,
            child: IconButton(
              tooltip: label,
              onPressed: () async {
                final cb = onSync;
                final eid = eventId;
                if (cb != null) {
                  await cb();
                } else if (eid != null) {
                  await sync.flush(eid);
                } else {
                  await sync.flushAll();
                }
              },
              icon: Badge(
                isLabelVisible: pending > 0,
                label: Text('$pending'),
                child: Icon(icon, size: 22, color: color),
              ),
            ),
          );
        },
      );
}
