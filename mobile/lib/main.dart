import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'core/providers.dart';
import 'core/storage/local_db.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final db = await LocalDb.open();

  runApp(
    ProviderScope(
      overrides: [localDbProvider.overrideWithValue(db)],
      child: const ClamsApp(),
    ),
  );
}
