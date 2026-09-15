import 'package:flutter/material.dart';
import '../core/sync_engine.dart';

/// Badge antrean offline — hijau aman, oranye ada antrean.
class PendingBadge extends ListenableBuilder {
  PendingBadge({super.key, required String eventId})
      : super(
          listenable: SyncEngine.instance,
          builder: (context, _) {
            final c =
                SyncEngine.instance.pendingByEvent[eventId] ?? 0;
            final scheme = Theme.of(context).colorScheme;
            return Chip(
              avatar: Icon(
                c == 0 ? Icons.cloud_done_outlined : Icons.cloud_upload_outlined,
                size: 18,
                color: c == 0 ? scheme.primary : scheme.onTertiaryContainer,
              ),
              label: Text(c == 0 ? 'Tersinkron' : '$c antre'),
              backgroundColor:
                  c == 0 ? scheme.secondaryContainer : scheme.tertiaryContainer,
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
