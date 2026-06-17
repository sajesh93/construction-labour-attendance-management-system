import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';

/// In-memory cache so repeated avatar loads don't refetch.
final Map<String, Uint8List> _photoCache = {};

/// Circle avatar that can load `/files/<id>` photos through the authenticated
/// API client (plain `NetworkImage` can't attach the bearer/device headers).
/// Absolute http(s) URLs still load directly.
class ApiCircleAvatar extends ConsumerWidget {
  const ApiCircleAvatar({super.key, this.photoUrl, this.radius = 20});
  final String? photoUrl;
  final double radius;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = photoUrl;
    if (url == null || url.isEmpty) {
      return CircleAvatar(radius: radius, child: Icon(Icons.person, size: radius));
    }
    if (url.startsWith('http')) {
      return CircleAvatar(radius: radius, backgroundImage: NetworkImage(url));
    }
    final cached = _photoCache[url];
    if (cached != null) {
      return CircleAvatar(radius: radius, backgroundImage: MemoryImage(cached));
    }
    return FutureBuilder<Uint8List?>(
      future: _fetch(ref, url),
      builder: (context, snap) {
        if (snap.data != null) {
          return CircleAvatar(radius: radius, backgroundImage: MemoryImage(snap.data!));
        }
        return CircleAvatar(radius: radius, child: Icon(Icons.person, size: radius));
      },
    );
  }

  Future<Uint8List?> _fetch(WidgetRef ref, String url) async {
    try {
      final dio = ref.read(apiClientProvider).dio;
      final res = await dio.get<List<int>>(
        url,
        options: Options(responseType: ResponseType.bytes),
      );
      final bytes = Uint8List.fromList(res.data ?? const []);
      if (bytes.isNotEmpty) _photoCache[url] = bytes;
      return bytes.isEmpty ? null : bytes;
    } catch (_) {
      return null;
    }
  }
}

/// The company logo for app-bar branding. Renders nothing until/unless a logo
/// is available, so it's safe to drop into any AppBar title row.
class CompanyLogo extends ConsumerWidget {
  const CompanyLogo({super.key, this.height = 28});
  final double height;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bytes = ref.watch(companyLogoProvider).asData?.value;
    if (bytes == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Image.memory(bytes, height: height, fit: BoxFit.contain),
    );
  }
}
