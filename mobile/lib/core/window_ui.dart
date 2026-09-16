import 'package:flutter/material.dart';

/// Fondasi UI adaptif desktop — cermin `page-shell` web (max 1120px).
///
/// Prinsip: fluida, bukan 2 mode kaku. Jumlah kolom grid dihitung dari
/// lebar aktual (`lebar ~/ 360`, min 1) sehingga resize window update
/// live seperti app desktop pada umumnya. Layar HP (<600px) selalu 1 kolom.
class WindowUi {
  /// Lebar maksimum konten — sama dengan `.page-shell` web (1120px).
  static const double maxContentWidth = 1120;

  /// Padding horizontal konten — 16px HP, 24px mulai 600px (web: sama).
  static double horizontalPadding(double width) => width >= 600 ? 24 : 16;

  /// Jumlah kolom grid fluida — tiap kartu ±[cardMin] px.
  static int columnsForWidth(double width, {double cardMin = 360}) {
    final c = (width / cardMin).floor();
    return c < 1 ? 1 : c;
  }

  /// Keputusan besar (tabel vs card, rail vs tab): layar lebar ≥900px.
  static bool isWide(double width) => width >= 900;

  static bool isWideContext(BuildContext context) =>
      isWide(MediaQuery.sizeOf(context).width);

  /// Padding ListView halaman: pusatkan max 1120px di layar lebar,
  /// padding 16 biasa di HP. Cermin `.page-shell` web.
  static EdgeInsets pagePadding(double width) {
    final side = (width - maxContentWidth) / 2;
    final pad = side > horizontalPadding(width)
        ? side
        : horizontalPadding(width);
    return EdgeInsets.fromLTRB(pad, 16, pad, 16);
  }
}

/// Shell konten desktop: center + batasi 1120px + padding 16/24.
/// Di HP (<600px) praktis transparan (full-width, padding 16).
class WideShell extends StatelessWidget {
  final Widget child;
  final double? maxWidth;
  const WideShell({super.key, required this.child, this.maxWidth});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, cons) {
      final w = cons.maxWidth;
      return Center(
        child: ConstrainedBox(
          constraints:
              BoxConstraints(maxWidth: maxWidth ?? WindowUi.maxContentWidth),
          child: Padding(
            padding: EdgeInsets.symmetric(
                horizontal: WindowUi.horizontalPadding(w)),
            child: child,
          ),
        ),
      );
    });
  }
}
