import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'badge_printer.dart';

const _sizeKey = 'card_size';
const _orientKey = 'card_orientation';

CardSize _parseSize(String? s) => switch (s) {
      'small' => CardSize.small,
      'large' => CardSize.large,
      _ => CardSize.medium,
    };

CardOrientation _parseOrient(String? s) =>
    s == 'portrait' ? CardOrientation.portrait : CardOrientation.landscape;

/// Fetch bytes for a stored "/files/<id>" ref (or absolute URL) via the
/// authenticated API client. Returns null on any failure.
Future<Uint8List?> _bytes(Dio dio, String? url) async {
  if (url == null || url.isEmpty) return null;
  try {
    final res = await dio.get<List<int>>(url, options: Options(responseType: ResponseType.bytes));
    final b = Uint8List.fromList(res.data ?? const []);
    return b.isEmpty ? null : b;
  } catch (_) {
    return null;
  }
}

/// End-to-end "print ID cards" flow used by every Safety Officer print button:
/// pick size/orientation (remembered), load company details + photos, then
/// open the print dialog. Returns false if the user cancels the size sheet.
Future<bool> printWorkerCards(
  BuildContext context,
  WidgetRef ref,
  List<BadgeData> badges,
) async {
  if (badges.isEmpty) return false;
  final db = ref.read(localDbProvider);
  final dio = ref.read(apiClientProvider).dio;

  var size = _parseSize(await db.getMeta(_sizeKey));
  var orientation = _parseOrient(await db.getMeta(_orientKey));

  if (!context.mounted) return false;
  final picked = await showModalBottomSheet<bool>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSheet) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Card size', style: Theme.of(ctx).textTheme.titleMedium),
              const SizedBox(height: 8),
              SegmentedButton<CardSize>(
                segments: const [
                  ButtonSegment(value: CardSize.small, label: Text('Small')),
                  ButtonSegment(value: CardSize.medium, label: Text('Medium')),
                  ButtonSegment(value: CardSize.large, label: Text('Large')),
                ],
                selected: {size},
                onSelectionChanged: (s) => setSheet(() => size = s.first),
              ),
              const SizedBox(height: 16),
              Text('Orientation', style: Theme.of(ctx).textTheme.titleMedium),
              const SizedBox(height: 8),
              SegmentedButton<CardOrientation>(
                segments: const [
                  ButtonSegment(value: CardOrientation.landscape, label: Text('Landscape')),
                  ButtonSegment(value: CardOrientation.portrait, label: Text('Portrait')),
                ],
                selected: {orientation},
                onSelectionChanged: (o) => setSheet(() => orientation = o.first),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  icon: const Icon(Icons.print),
                  label: Text('Print ${badges.length} card(s)'),
                  onPressed: () => Navigator.pop(ctx, true),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
  if (picked != true) return false;

  // Remember the choice as the new default.
  await db.setMeta(_sizeKey, size.name);
  await db.setMeta(_orientKey, orientation.name);

  // Company details for the card header/footer.
  OrgInfo? org;
  try {
    final res = await dio.get('/organizations/current');
    final m = res.data as Map<String, dynamic>;
    org = OrgInfo(
      name: m['name'] as String?,
      addressLine1: m['addressLine1'] as String?,
      addressLine2: m['addressLine2'] as String?,
      city: m['city'] as String?,
      state: m['state'] as String?,
      pincode: m['pincode'] as String?,
      phone: m['phone'] as String?,
      logoBytes: await _bytes(dio, m['logoUrl'] as String?),
    );
  } catch (_) {
    org = null;
  }

  // Resolve worker photos to bytes (best-effort; cards still print without them).
  final withPhotos = <BadgeData>[];
  for (final b in badges) {
    withPhotos.add(b.withPhoto(await _bytes(dio, b.photoUrl)));
  }

  await printCards(withPhotos, org: org, size: size, orientation: orientation);
  return true;
}
