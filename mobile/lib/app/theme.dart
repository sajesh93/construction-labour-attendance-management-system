import 'package:flutter/material.dart';

/// CLAMS design tokens — mirrors the admin web panel design language.
/// Screens should use these instead of hard-coding colors.
class ClamsColors {
  ClamsColors._();

  /// Steel indigo — primary brand color.
  static const primary = Color(0xFF3E5BA9);
  static const primaryDark = Color(0xFF2F4685);

  /// Safety amber — accent / warning.
  static const accent = Color(0xFFB7791F);

  static const background = Color(0xFFF4F5F7);
  static const surface = Colors.white;
  static const border = Color(0xFFE3E6EB);

  static const text = Color(0xFF1C2430);
  static const textSecondary = Color(0xFF5B6675);

  static const success = Color(0xFF1E7F4F);
  static const warning = Color(0xFFB7791F);
  static const error = Color(0xFFC03434);
  static const info = Color(0xFF2B6CB0);

  /// Dark surface used for floating snackbars.
  static const snackBar = Color(0xFF232B38);

  /// Soft tints for status chips / banners (12% alpha of the status color).
  static final successTint = success.withValues(alpha: 0.12);
  static final warningTint = warning.withValues(alpha: 0.12);
  static final errorTint = error.withValues(alpha: 0.12);
  static final infoTint = info.withValues(alpha: 0.12);
  static final primaryTint = primary.withValues(alpha: 0.12);
}

/// Spacing scale — use instead of magic numbers in SizedBox/EdgeInsets.
class ClamsSpacing {
  ClamsSpacing._();

  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;

  static const gapXs = SizedBox(height: xs);
  static const gapSm = SizedBox(height: sm);
  static const gapMd = SizedBox(height: md);
  static const gapLg = SizedBox(height: lg);
  static const gapXl = SizedBox(height: xl);
  static const gapXxl = SizedBox(height: xxl);
}

/// Corner radii used across the app (cards 12, controls 8).
class ClamsRadius {
  ClamsRadius._();

  static const double card = 12;
  static const double control = 8;
}

ThemeData buildTheme() {
  const scheme = ColorScheme(
    brightness: Brightness.light,
    primary: ClamsColors.primary,
    onPrimary: Colors.white,
    primaryContainer: Color(0xFFDDE4F5),
    onPrimaryContainer: ClamsColors.primaryDark,
    secondary: ClamsColors.accent,
    onSecondary: Colors.white,
    secondaryContainer: Color(0xFFF6E8CF),
    onSecondaryContainer: Color(0xFF6B4A14),
    tertiary: ClamsColors.info,
    onTertiary: Colors.white,
    error: ClamsColors.error,
    onError: Colors.white,
    errorContainer: Color(0xFFF7DCDC),
    onErrorContainer: Color(0xFF7C2222),
    surface: ClamsColors.surface,
    onSurface: ClamsColors.text,
    onSurfaceVariant: ClamsColors.textSecondary,
    outline: ClamsColors.border,
    outlineVariant: ClamsColors.border,
    surfaceContainerHighest: Color(0xFFEDEFF3),
    inverseSurface: ClamsColors.snackBar,
    onInverseSurface: Colors.white,
    shadow: Colors.black,
    scrim: Colors.black,
  );

  const controlShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.all(Radius.circular(ClamsRadius.control)),
  );
  const buttonText = TextStyle(fontSize: 15, fontWeight: FontWeight.w600);

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: ClamsColors.background,
    dividerColor: ClamsColors.border,
    appBarTheme: const AppBarTheme(
      centerTitle: false,
      backgroundColor: ClamsColors.surface,
      foregroundColor: ClamsColors.text,
      elevation: 0,
      scrolledUnderElevation: 0,
      shape: Border(bottom: BorderSide(color: ClamsColors.border)),
      titleTextStyle: TextStyle(
        color: ClamsColors.text,
        fontSize: 18,
        fontWeight: FontWeight.w600,
      ),
      iconTheme: IconThemeData(color: ClamsColors.text),
    ),
    cardTheme: const CardThemeData(
      color: ClamsColors.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: ClamsColors.border),
        borderRadius: BorderRadius.all(Radius.circular(ClamsRadius.card)),
      ),
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        shape: controlShape,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
        textStyle: buttonText,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        shape: controlShape,
        side: const BorderSide(color: ClamsColors.border),
        foregroundColor: ClamsColors.primary,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
        textStyle: buttonText,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        shape: controlShape,
        foregroundColor: ClamsColors.primary,
        textStyle: buttonText,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      isDense: true,
      filled: true,
      fillColor: ClamsColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(ClamsRadius.control),
        borderSide: const BorderSide(color: ClamsColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(ClamsRadius.control),
        borderSide: const BorderSide(color: ClamsColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(ClamsRadius.control),
        borderSide: const BorderSide(color: ClamsColors.primary, width: 1.5),
      ),
      labelStyle: const TextStyle(color: ClamsColors.textSecondary),
      hintStyle: const TextStyle(color: ClamsColors.textSecondary),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: ClamsColors.background,
      side: const BorderSide(color: ClamsColors.border),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(ClamsRadius.control),
      ),
      labelStyle: const TextStyle(
        color: ClamsColors.text,
        fontSize: 13,
        fontWeight: FontWeight.w500,
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: ClamsColors.snackBar,
      contentTextStyle: const TextStyle(color: Colors.white, fontSize: 14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(ClamsRadius.control + 2),
      ),
    ),
    dividerTheme: const DividerThemeData(color: ClamsColors.border, thickness: 1),
    listTileTheme: const ListTileThemeData(
      iconColor: ClamsColors.textSecondary,
      textColor: ClamsColors.text,
    ),
    dialogTheme: const DialogThemeData(
      backgroundColor: ClamsColors.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(ClamsRadius.card)),
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: ClamsColors.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(ClamsRadius.card)),
      ),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: ClamsColors.primary,
      foregroundColor: Colors.white,
      elevation: 2,
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: ClamsColors.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: ClamsColors.border),
        borderRadius: BorderRadius.circular(ClamsRadius.card - 2),
      ),
    ),
    progressIndicatorTheme:
        const ProgressIndicatorThemeData(color: ClamsColors.primary),
  );
}
