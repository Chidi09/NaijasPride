import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';
import 'package:media_kit/media_kit.dart';

import 'package:firebase_core/firebase_core.dart';

import 'core/network/api_client.dart';
import 'core/push/push_service.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_mode_provider.dart';
import 'features/auth/application/auth_controller.dart';

void main() {
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();

    FlutterError.onError = (details) {
      FlutterError.presentError(details);
      debugPrint('FlutterError: ${details.exceptionAsString()}');
    };

    ErrorWidget.builder = (details) {
      return Scaffold(
        backgroundColor: Colors.black,
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Something went wrong.',
              style: const TextStyle(color: Colors.white70, fontSize: 16),
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    };

    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: Colors.transparent,
      ),
    );

    MediaKit.ensureInitialized();

    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('Firebase init failed (expected if google-services.json is missing): $e');
    }

    final container = ProviderContainer();

    try {
      final pushService = PushService(
        dio: container.read(dioProvider),
        router: container.read(routerProvider),
      );
      await pushService.initialize();
    } catch (e) {
      debugPrint('Push service init failed: $e');
    }
    final themeModeNotifier = container.read(themeModeProvider.notifier);
    await themeModeNotifier.load();
    final authController = container.read(authControllerProvider.notifier);
    await authController.bootstrap();

    runApp(
      UncontrolledProviderScope(
        container: container,
        child: const NaijaSprideApp(),
      ),
    );
  }, (error, stack) {
    debugPrint('Uncaught zone error: $error\n$stack');
  });
}

class NaijaSprideApp extends ConsumerWidget {
  const NaijaSprideApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp.router(
      title: 'NaijaSpride',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
