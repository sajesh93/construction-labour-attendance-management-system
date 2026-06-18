import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// High-importance channel that plays a loud siren at ALARM volume and shows
/// full-screen, even when the phone is locked or the app is closed.
const AndroidNotificationChannel _sosChannel = AndroidNotificationChannel(
  // New id (channel sound can't be changed after creation, so we use a fresh one).
  'sos_siren',
  'SOS Alerts',
  description: 'Emergency SOS alerts',
  importance: Importance.max,
  playSound: true,
  sound: RawResourceAndroidNotificationSound('sos_siren'),
  audioAttributesUsage: AudioAttributesUsage.alarm,
  enableVibration: true,
);

final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();
bool _localReady = false;

Future<void> _ensureLocalReady() async {
  if (_localReady) return;
  const init = InitializationSettings(
    android: AndroidInitializationSettings('@mipmap/ic_launcher'),
  );
  await _localNotifications.initialize(init);
  await _localNotifications
      .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(_sosChannel);
  _localReady = true;
}

/// Build a loud, full-screen SOS notification from an FCM data payload.
Future<void> _showSosNotification(Map<String, dynamic> data) async {
  if ((data['type'] as String?) != 'SOS') return;
  await _ensureLocalReady();
  final title = (data['title'] as String?) ?? '🚨 SOS';
  final body = (data['body'] as String?) ?? 'Emergency reported';
  final id = ((data['sosEventId'] as String?)?.hashCode ?? 911) & 0x7fffffff;
  await _localNotifications.show(
    id,
    title,
    body,
    NotificationDetails(
      android: AndroidNotificationDetails(
        _sosChannel.id,
        _sosChannel.name,
        channelDescription: _sosChannel.description,
        importance: Importance.max,
        priority: Priority.high,
        category: AndroidNotificationCategory.alarm,
        fullScreenIntent: true,
        playSound: true,
        sound: const RawResourceAndroidNotificationSound('sos_siren'),
        audioAttributesUsage: AudioAttributesUsage.alarm,
        enableVibration: true,
        ticker: 'SOS',
      ),
    ),
  );
}

/// Background/terminated FCM handler — MUST be a top-level function.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Already initialized in this isolate.
  }
  await _showSosNotification(message.data);
}

class PushService {
  PushService._();

  static bool _refreshHooked = false;

  /// Foreground wiring: channel, permission, and the onMessage handler. Safe to
  /// call once at startup; no-ops if Firebase isn't configured.
  static Future<void> initForeground() async {
    try {
      await _ensureLocalReady();
      await FirebaseMessaging.instance.requestPermission();
      await _localNotifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
      FirebaseMessaging.onMessage.listen((m) => _showSosNotification(m.data));
    } catch (_) {
      // Firebase not configured (no google-services.json) — app still runs.
    }
  }

  /// Register this device's FCM token with the backend so an SOS reaches it.
  static Future<void> registerToken(Dio dio, {String? deviceUid}) async {
    Future<void> send(String token) => dio.post('/notifications/push-token', data: {
          'token': token,
          if (deviceUid != null) 'deviceUid': deviceUid,
          'platform': 'android',
        });
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await send(token);
      if (!_refreshHooked) {
        _refreshHooked = true;
        FirebaseMessaging.instance.onTokenRefresh.listen((t) {
          send(t).ignore();
        });
      }
    } catch (_) {
      // Offline or push not configured — retried on next login/start.
    }
  }
}
