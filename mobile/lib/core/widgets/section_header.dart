import 'package:flutter/material.dart';

import '../../app/theme.dart';

/// Uppercase, letter-spaced section label — mirrors the admin web panel's
/// section headers (11px, secondary color, 0.8 letter spacing).
class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.padding});

  final String title;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final label = Text(
      title.toUpperCase(),
      style: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.8,
        color: ClamsColors.textSecondary,
      ),
    );
    if (padding == null) return label;
    return Padding(padding: padding!, child: label);
  }
}

/// Bordered white card with a colored accent stripe on the left — used for
/// inline status/notice banners (e.g. device pending, Aadhaar result).
class StatusBanner extends StatelessWidget {
  const StatusBanner({
    super.key,
    required this.color,
    required this.icon,
    required this.child,
    this.trailing,
  });

  final Color color;
  final IconData icon;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: ClamsColors.surface,
        border: Border.all(color: ClamsColors.border),
        borderRadius: BorderRadius.circular(ClamsRadius.card),
      ),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 4,
              decoration: BoxDecoration(
                color: color,
                borderRadius: const BorderRadius.horizontal(
                  left: Radius.circular(ClamsRadius.card),
                ),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(ClamsSpacing.lg),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(icon, color: color, size: 22),
                    const SizedBox(width: ClamsSpacing.md),
                    Expanded(child: child),
                    if (trailing != null) trailing!,
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
