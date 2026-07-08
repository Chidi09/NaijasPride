import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';

class AppTheme {
  AppTheme._();

  static ThemeData get light => _buildTheme(Brightness.light);

  static ThemeData get dark => _buildTheme(Brightness.dark);

  static ThemeData _buildTheme(Brightness brightness) {
    final isLight = brightness == Brightness.light;
    final colors = isLight ? AppColors.light : AppColors.dark;

    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: colors.primary,
      secondary: colors.primaryHover,
      surface: colors.surface,
      onSurface: colors.text,
      error: const Color(0xFFB00020),
      onError: Colors.white,
      surfaceTint: colors.background,
      onPrimary: Colors.white,
      onSecondary: Colors.white,
    );

    // GoogleFonts.xxxTextTheme() with no argument returns styles colored for
    // Typography.black (near-black text) regardless of the brightness passed
    // to this theme - on the dark palette (background #0A0A0A) that renders
    // as near-black-on-black, i.e. invisible. Seeding from the
    // brightness-correct base TextTheme first, then forcing every style's
    // color explicitly, guarantees readable text in both themes.
    final baseTextTheme = (isLight ? ThemeData.light() : ThemeData.dark())
        .textTheme;
    final cinzelTextTheme = GoogleFonts.cinzelTextTheme(baseTextTheme);
    final jakartaTextTheme = GoogleFonts.plusJakartaSansTextTheme(baseTextTheme);

    final textTheme = TextTheme(
      displayLarge: cinzelTextTheme.displayLarge?.copyWith(color: colors.textStrong),
      displayMedium: cinzelTextTheme.displayMedium?.copyWith(color: colors.textStrong),
      displaySmall: cinzelTextTheme.displaySmall?.copyWith(color: colors.textStrong),
      headlineLarge: cinzelTextTheme.headlineLarge?.copyWith(color: colors.textStrong),
      headlineMedium: cinzelTextTheme.headlineMedium?.copyWith(color: colors.textStrong),
      headlineSmall: cinzelTextTheme.headlineSmall?.copyWith(color: colors.textStrong),
      titleLarge: cinzelTextTheme.titleLarge?.copyWith(color: colors.textStrong),
      titleMedium: jakartaTextTheme.titleMedium?.copyWith(color: colors.text),
      titleSmall: jakartaTextTheme.titleSmall?.copyWith(color: colors.text),
      bodyLarge: jakartaTextTheme.bodyLarge?.copyWith(color: colors.text),
      bodyMedium: jakartaTextTheme.bodyMedium?.copyWith(color: colors.text),
      bodySmall: jakartaTextTheme.bodySmall?.copyWith(color: colors.text.withAlpha(200)),
      labelLarge: jakartaTextTheme.labelLarge?.copyWith(color: colors.text),
      labelMedium: jakartaTextTheme.labelMedium?.copyWith(color: colors.text),
      labelSmall: jakartaTextTheme.labelSmall?.copyWith(color: colors.text.withAlpha(200)),
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: colors.background,
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: colors.surface,
        foregroundColor: colors.text,
        elevation: 0,
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: colors.surface,
        selectedItemColor: colors.accent,
        unselectedItemColor: colors.text.withAlpha(153),
        type: BottomNavigationBarType.fixed,
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: colors.surface,
        selectedIconTheme: IconThemeData(color: colors.accent),
        unselectedIconTheme: IconThemeData(color: colors.text.withAlpha(153)),
        selectedLabelTextStyle: TextStyle(color: colors.accent),
        unselectedLabelTextStyle: TextStyle(color: colors.text.withAlpha(153)),
        indicatorColor: colors.primary.withAlpha(26),
      ),
    );
  }
}
