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

    final cinzelTextTheme = GoogleFonts.cinzelTextTheme();
    final jakartaTextTheme = GoogleFonts.plusJakartaSansTextTheme();

    final textTheme = TextTheme(
      displayLarge: cinzelTextTheme.displayLarge,
      displayMedium: cinzelTextTheme.displayMedium,
      displaySmall: cinzelTextTheme.displaySmall,
      headlineLarge: cinzelTextTheme.headlineLarge,
      headlineMedium: cinzelTextTheme.headlineMedium,
      headlineSmall: cinzelTextTheme.headlineSmall,
      titleLarge: cinzelTextTheme.titleLarge,
      titleMedium: jakartaTextTheme.titleMedium,
      titleSmall: jakartaTextTheme.titleSmall,
      bodyLarge: jakartaTextTheme.bodyLarge,
      bodyMedium: jakartaTextTheme.bodyMedium,
      bodySmall: jakartaTextTheme.bodySmall,
      labelLarge: jakartaTextTheme.labelLarge,
      labelMedium: jakartaTextTheme.labelMedium,
      labelSmall: jakartaTextTheme.labelSmall,
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
