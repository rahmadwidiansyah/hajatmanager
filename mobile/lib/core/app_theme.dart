import 'package:flutter/material.dart';

/// Colorway disalin dari web (`app/globals.css`) agar APK & web identik.
/// Primary emerald, tertiary sky, surface slate — light + dark.
class AppTheme {
  // ---- Light (globals.css :root) ----
  static const _light = ColorScheme(
    brightness: Brightness.light,
    primary: Color(0xFF059669),
    onPrimary: Color(0xFFFFFFFF),
    primaryContainer: Color(0xFFD1FAE5),
    onPrimaryContainer: Color(0xFF064E3B),
    secondary: Color(0xFF64748B),
    onSecondary: Color(0xFFFFFFFF),
    secondaryContainer: Color(0xFFE2E8F0),
    onSecondaryContainer: Color(0xFF334155),
    tertiary: Color(0xFF0EA5E9),
    onTertiary: Color(0xFFFFFFFF),
    tertiaryContainer: Color(0xFFE0F2FE),
    onTertiaryContainer: Color(0xFF0C4A6E),
    error: Color(0xFFDC2626),
    onError: Color(0xFFFFFFFF),
    errorContainer: Color(0xFFFEE2E2),
    onErrorContainer: Color(0xFF7F1D1D),
    surface: Color(0xFFF8FAFC),
    onSurface: Color(0xFF0F172A),
    onSurfaceVariant: Color(0xFF475569),
    surfaceDim: Color(0xFFDDE4EE),
    surfaceBright: Color(0xFFFFFFFF),
    surfaceContainerLowest: Color(0xFFFFFFFF),
    surfaceContainerLow: Color(0xFFF1F5F9),
    surfaceContainer: Color(0xFFE8EDF4),
    surfaceContainerHigh: Color(0xFFDDE4EE),
    surfaceContainerHighest: Color(0xFFD1DAE8),
    outline: Color(0xFF94A3B8),
    outlineVariant: Color(0xFFCBD5E1),
    inverseSurface: Color(0xFF0F172A),
    onInverseSurface: Color(0xFFF1F5F9),
    inversePrimary: Color(0xFF34D399),
    scrim: Color(0xFF000000),
    shadow: Color(0xFF0F172A),
  );

  // ---- Dark (globals.css [data-mui-color-scheme="dark"]) ----
  static const _dark = ColorScheme(
    brightness: Brightness.dark,
    primary: Color(0xFF34D399),
    onPrimary: Color(0xFF022C22),
    primaryContainer: Color(0xFF064E3B),
    onPrimaryContainer: Color(0xFFA7F3D0),
    secondary: Color(0xFF94A3B8),
    onSecondary: Color(0xFF0F172A),
    secondaryContainer: Color(0xFF1E293B),
    onSecondaryContainer: Color(0xFFCBD5E1),
    tertiary: Color(0xFF38BDF8),
    onTertiary: Color(0xFF082F49),
    tertiaryContainer: Color(0xFF0C4A6E),
    onTertiaryContainer: Color(0xFFBAE6FD),
    error: Color(0xFFF87171),
    onError: Color(0xFF450A0A),
    errorContainer: Color(0xFF450A0A),
    onErrorContainer: Color(0xFFFECACA),
    surface: Color(0xFF0A0F1A),
    onSurface: Color(0xFFE8EEF5),
    onSurfaceVariant: Color(0xFF94A3B8),
    surfaceDim: Color(0xFF0A0F1A),
    surfaceBright: Color(0xFF263347),
    surfaceContainerLowest: Color(0xFF111827),
    surfaceContainerLow: Color(0xFF161F2E),
    surfaceContainer: Color(0xFF1E2A3A),
    surfaceContainerHigh: Color(0xFF263347),
    surfaceContainerHighest: Color(0xFF2E3D54),
    outline: Color(0xFF475569),
    outlineVariant: Color(0xFF1E2A3A),
    inverseSurface: Color(0xFFE8EEF5),
    onInverseSurface: Color(0xFF0F172A),
    inversePrimary: Color(0xFF059669),
    scrim: Color(0xFF000000),
    shadow: Color(0xFF000000),
  );

  static ThemeData light() => _build(_light);
  static ThemeData dark() => _build(_dark);

  static ThemeData _build(ColorScheme scheme) {
    // Radius skala web: --radius-sm 8, md 12, lg 16, xl 28.
    const rSm = BorderRadius.all(Radius.circular(8));
    const rMd = BorderRadius.all(Radius.circular(12));
    const rXl = BorderRadius.all(Radius.circular(28));
    final outlineBorder = OutlineInputBorder(
      borderRadius: rMd,
      borderSide: BorderSide(color: scheme.outlineVariant),
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: scheme.surface,
      appBarTheme: AppBarTheme(
        centerTitle: true,
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 2,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surfaceContainer,
        indicatorColor: scheme.secondaryContainer,
      ),
      cardTheme: CardThemeData(
        color: scheme.surfaceContainerLow,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: rMd,
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(shape: const StadiumBorder()),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(shape: const StadiumBorder()),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(shape: const StadiumBorder()),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: SegmentedButton.styleFrom(
          shape: const StadiumBorder(),
          selectedBackgroundColor: scheme.primary,
          selectedForegroundColor: scheme.onPrimary,
        ),
      ),
      chipTheme: scheme.brightness == Brightness.light
          ? ChipThemeData(
              shape: const StadiumBorder(),
              side: BorderSide(color: scheme.outlineVariant),
            )
          : ChipThemeData(
              shape: const StadiumBorder(),
              side: BorderSide(color: scheme.outlineVariant),
            ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerLowest,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        border: outlineBorder,
        enabledBorder: outlineBorder,
        focusedBorder: OutlineInputBorder(
          borderRadius: rMd,
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: rMd,
          borderSide: BorderSide(color: scheme.error),
        ),
      ),
      searchBarTheme: SearchBarThemeData(
        backgroundColor:
            WidgetStatePropertyAll(scheme.surfaceContainerLow),
        shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: rXl)),
        elevation: const WidgetStatePropertyAll(0),
        hintStyle: WidgetStatePropertyAll(
            TextStyle(color: scheme.onSurfaceVariant)),
      ),
      searchViewTheme: SearchViewThemeData(
        backgroundColor: scheme.surface,
        shape:
            RoundedRectangleBorder(borderRadius: rXl),
      ),
      badgeTheme: BadgeThemeData(
        backgroundColor: scheme.error,
        textColor: scheme.onError,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surfaceContainerLow,
        shape: RoundedRectangleBorder(borderRadius: rXl),
        // Desktop: dialog tidak mepet tepi saat window lebar.
        insetPadding: const EdgeInsets.symmetric(
            horizontal: 24, vertical: 24),
      ),
      // Desktop: rail samping untuk tab kerja (event detail).
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: scheme.surface,
        indicatorColor: scheme.secondaryContainer,
        selectedIconTheme: IconThemeData(color: scheme.onSecondaryContainer),
        selectedLabelTextStyle:
            TextStyle(color: scheme.onSurface, fontWeight: FontWeight.w700),
        unselectedIconTheme:
            IconThemeData(color: scheme.onSurfaceVariant),
        unselectedLabelTextStyle:
            TextStyle(color: scheme.onSurfaceVariant),
      ),
      // Desktop: header tabel rekap/log tegas ala web.
      dataTableTheme: DataTableThemeData(
        headingTextStyle: TextStyle(
            color: scheme.onSurfaceVariant, fontWeight: FontWeight.w700),
        dataTextStyle: TextStyle(color: scheme.onSurface),
        dividerThickness: 1,
      ),
      // Desktop: scrollbar selalu terlihat saat pakai mouse.
      scrollbarTheme: ScrollbarThemeData(
        thumbVisibility: const WidgetStatePropertyAll(true),
        thickness: const WidgetStatePropertyAll(8),
        radius: const Radius.circular(8),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surfaceContainerLow,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        showDragHandle: true,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: scheme.inverseSurface,
        contentTextStyle: TextStyle(color: scheme.onInverseSurface),
        actionTextColor: scheme.inversePrimary,
        shape: RoundedRectangleBorder(borderRadius: rSm),
        behavior: SnackBarBehavior.floating,
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: scheme.primary,
        unselectedLabelColor: scheme.onSurfaceVariant,
        indicatorColor: scheme.primary,
      ),
      dividerTheme: DividerThemeData(
        color: scheme.outlineVariant,
        thickness: 1,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
    );
  }
}

/// Warna non-standar M3 milik web: warning + info(=tertiary) + mapping
/// metode/role ala `components/ui/color.ts`.
class AppColors {
  // warning light/dark
  static Color warning(Brightness b) =>
      b == Brightness.dark ? const Color(0xFFFBBF24) : const Color(0xFFD97706);
  static Color warningContainer(Brightness b) =>
      b == Brightness.dark ? const Color(0xFF451A03) : const Color(0xFFFEF3C7);
  static Color onWarningContainer(Brightness b) =>
      b == Brightness.dark ? const Color(0xFFFDE68A) : const Color(0xFF92400E);

  /// (background, foreground) chip metode — mirror `methodChipClass`.
  static (Color, Color) methodChip(String m, ColorScheme s) {
    if (m == 'AMPLOP' || m == 'CASH') {
      return (s.primaryContainer, s.onPrimaryContainer);
    }
    if (m == 'QRIS') return (s.tertiaryContainer, s.onTertiaryContainer);
    if (m == 'TRANSFER') {
      return (s.surfaceContainerHigh, s.onSurfaceVariant);
    }
    return (s.surfaceContainer, s.onSurfaceVariant);
  }

  /// Warna dot metode — mirror `methodDotClass`.
  static Color methodDot(String m, ColorScheme s, Brightness b) {
    if (m == 'AMPLOP' || m == 'CASH') return s.primary;
    if (m == 'QRIS') return s.tertiary;
    if (m == 'TRANSFER') return warning(b);
    return s.outline;
  }

  /// (background, foreground) chip role — mirror `roleChipClass`.
  static (Color, Color) roleChip(String role, ColorScheme s, Brightness b) {
    if (role == 'OWNER') return (s.primaryContainer, s.onPrimaryContainer);
    if (role == 'ADMIN') {
      return (warningContainer(b), onWarningContainer(b));
    }
    return (s.surfaceContainer, s.onSurfaceVariant);
  }
}
