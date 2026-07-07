import 'package:flutter/material.dart';

class AppColors {
  const AppColors._();

  static const light = _ThemeColors(
    background: Color(0xFFF7EFE8),
    surface: Color(0xFFEFE1D7),
    border: Color(0xFFDFC8BB),
    primary: Color(0xFF800020),
    primaryHover: Color(0xFFA31535),
    text: Color(0xFF3D2A2F),
    textStrong: Color(0xFF1D1416),
    accent: Color(0xFF9A6D1F),
  );

  static const dark = _ThemeColors(
    background: Color(0xFF0A0A0A),
    surface: Color(0xFF121212),
    border: Color(0xFF1E1E1E),
    primary: Color(0xFF800020),
    primaryHover: Color(0xFFA31535),
    text: Color(0xFFF5F5DC),
    textStrong: Color(0xFFF9F9F2),
    accent: Color(0xFFD6B87A),
  );
}

class _ThemeColors {
  final Color background;
  final Color surface;
  final Color border;
  final Color primary;
  final Color primaryHover;
  final Color text;
  final Color textStrong;
  final Color accent;

  const _ThemeColors({
    required this.background,
    required this.surface,
    required this.border,
    required this.primary,
    required this.primaryHover,
    required this.text,
    required this.textStrong,
    required this.accent,
  });
}
