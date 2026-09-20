import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

/// Widget skeleton shimmer — dipakai saat data lokal belum ada.
/// Pola: data lama tetap tampil saat refetch (silent update),
/// skeleton HANYA muncul saat list benar-benar kosong dan belum ada
/// data lokal sama sekali (_localLoaded = false atau guests kosong).
class SkeletonCard extends StatelessWidget {
  final double height;
  final double? width;
  const SkeletonCard({super.key, this.height = 72, this.width});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final base = scheme.surfaceContainerHighest;
    final highlight = scheme.surfaceContainerHigh;

    return Shimmer.fromColors(
      baseColor: base,
      highlightColor: highlight,
      child: Container(
        width: width ?? double.infinity,
        height: height,
        margin: const EdgeInsets.symmetric(vertical: 4),
        decoration: BoxDecoration(
          color: base,
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }
}

/// Daftar skeleton card — default 5 item, tinggi 72px per item.
class SkeletonList extends StatelessWidget {
  final int count;
  final double itemHeight;
  const SkeletonList({super.key, this.count = 5, this.itemHeight = 72});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(
        count,
        (_) => SkeletonCard(height: itemHeight),
      ),
    );
  }
}

/// Skeleton satu baris tabel (untuk tampilan desktop/tablet).
class SkeletonTableRow extends StatelessWidget {
  const SkeletonTableRow({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Shimmer.fromColors(
      baseColor: scheme.surfaceContainerHighest,
      highlightColor: scheme.surfaceContainerHigh,
      child: Container(
        height: 48,
        margin: const EdgeInsets.symmetric(vertical: 2),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(6),
        ),
      ),
    );
  }
}
