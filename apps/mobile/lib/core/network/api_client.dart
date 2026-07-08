import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/application/auth_events.dart';
import '../../features/auth/data/token_storage.dart';
import 'api_config.dart';

class AuthInterceptor extends Interceptor {
  final TokenStorage _tokenStorage;
  final StreamController<AuthEvent> _authEventsController;
  final Dio _dio;

  AuthInterceptor({
    required this._tokenStorage,
    required this._authEventsController,
    required this._dio,
  });

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final session = await _tokenStorage.readSession();
    if (session != null) {
      options.headers['Authorization'] = 'Bearer ${session.token}';
    }
    handler.next(options);
  }

  @override
  void onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode == 401 &&
        !err.requestOptions.path.startsWith('/api/v1/auth')) {
      try {
        final session = await _tokenStorage.readSession();
        if (session == null) {
          _authEventsController.add(AuthEvent.unauthenticated);
          handler.next(err);
          return;
        }

        final refreshDio = Dio(
          BaseOptions(
            baseUrl: apiBaseUrl,
            connectTimeout: const Duration(seconds: 15),
            receiveTimeout: const Duration(seconds: 15),
          ),
        );

        final refreshResponse = await refreshDio.post(
          '/api/v1/auth/refresh',
          data: {'refreshToken': session.refreshToken},
        );

        final body = refreshResponse.data as Map<String, dynamic>;
        if (body['success'] == true) {
          final data = body['data'] as Map<String, dynamic>;
          final newToken = data['token'] as String;
          final newRefreshToken = data['refreshToken'] as String;

          await _tokenStorage.saveSession(
            token: newToken,
            refreshToken: newRefreshToken,
            userJson: session.userJson,
            isGuest: session.isGuest,
          );

          err.requestOptions.headers['Authorization'] = 'Bearer $newToken';
          final retryResponse = await _dio.fetch(err.requestOptions);
          handler.resolve(retryResponse);
        } else {
          _authEventsController.add(AuthEvent.unauthenticated);
          handler.next(err);
        }
      } catch (_) {
        _authEventsController.add(AuthEvent.unauthenticated);
        handler.next(err);
      }
    } else {
      handler.next(err);
    }
  }
}

final dioProvider = Provider<Dio>((ref) {
  final tokenStorage = ref.read(tokenStorageProvider);
  final authEventsController = ref.read(authEventsProvider);

  final dio = Dio(
    BaseOptions(
      baseUrl: apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
    ),
  );

  dio.interceptors.add(AuthInterceptor(
    tokenStorage: tokenStorage,
    authEventsController: authEventsController,
    dio: dio,
  ));

  return dio;
});
