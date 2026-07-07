import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';

class PushService {
  final Dio dio;
  final GoRouter router;

  PushService({required this.dio, required this.router});

  Future<void> initialize() async {
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(alert: true, badge: true, sound: true);

    final token = await messaging.getToken();
    if (token != null) {
      await _registerToken(token);
    }
    messaging.onTokenRefresh.listen(_registerToken);

    FirebaseMessaging.onMessage.listen((message) {
      debugPrint('Foreground FCM message: ${message.notification?.title}');
    });

    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageTap);

    final initialMessage = await messaging.getInitialMessage();
    if (initialMessage != null) {
      _handleMessageTap(initialMessage);
    }
  }

  Future<void> _registerToken(String token) async {
    try {
      final response = await dio.post('/api/profile/push-tokens', data: {
        'token': token,
        'platform': 'android',
      });
      final body = response.data as Map<String, dynamic>;
      if (body['status'] != 'success') {
        debugPrint('Push token registration failed: unexpected response');
      }
    } catch (e) {
      debugPrint('Push token registration failed: $e');
    }
  }

  void _handleMessageTap(RemoteMessage message) {
    final route = message.data['route'] as String?;
    if (route != null && route.isNotEmpty) {
      router.go(route);
    }
  }
}
