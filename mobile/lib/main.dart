import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'core/providers.dart';
import 'core/push/push_service.dart';
import 'core/storage/local_db.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Push (SOS rings even when the app is closed). Wrapped so the app still runs
  // if Firebase isn't configured yet (e.g. no google-services.json in dev).
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    await PushService.initForeground();
  } catch (_) {
    // Firebase not configured — continue without push.
  }

  final db = await LocalDb.open();

  runApp(
    ProviderScope(
      overrides: [localDbProvider.overrideWithValue(db)],
      child: const ClamsApp(),
    ),
  );
}
