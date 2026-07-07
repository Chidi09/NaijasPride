import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_config.dart';

class AuthApi {
  final Dio _dio;

  AuthApi()
      : _dio = Dio(
          BaseOptions(
            baseUrl: apiBaseUrl,
            connectTimeout: const Duration(seconds: 15),
            receiveTimeout: const Duration(seconds: 15),
          ),
        );

  Future<Map<String, dynamic>> signup({
    required String email,
    required String password,
    String? name,
  }) async {
    return _request('/auth/signup', data: {
      'email': email,
      'password': password,
      'name': name,
    });
  }

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    return _request('/auth/login', data: {
      'email': email,
      'password': password,
    });
  }

  Future<Map<String, dynamic>> loginWithGoogle(String idToken) async {
    return _request('/auth/google', data: {'idToken': idToken});
  }

  Future<Map<String, dynamic>> continueAsGuest() async {
    return _request('/auth/guest');
  }

  Future<Map<String, dynamic>> refresh(String refreshToken) async {
    return _request('/auth/refresh', data: {'refreshToken': refreshToken});
  }

  Future<Map<String, dynamic>> convertGuest({
    required String email,
    required String password,
    String? name,
    required String token,
  }) async {
    return _request(
      '/auth/convert-guest',
      data: {
        'email': email,
        'password': password,
        'name': name,
      },
      headers: {'Authorization': 'Bearer $token'},
    );
  }

  Future<void> logout(String token) async {
    try {
      await _dio.post(
        '/auth/logout',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
    } catch (_) {}
  }

  Future<Map<String, dynamic>> _request(
    String path, {
    Map<String, dynamic>? data,
    Map<String, String>? headers,
  }) async {
    try {
      final response = await _dio.post(
        path,
        data: data,
        options: headers != null ? Options(headers: headers) : null,
      );
      final body = response.data as Map<String, dynamic>;
      if (body['success'] == true) {
        return body['data'] as Map<String, dynamic>;
      }
      throw Exception(body['error'] ?? 'Request failed');
    } on DioException catch (e) {
      if (e.response?.data is Map) {
        final error = (e.response!.data as Map<String, dynamic>)['error'];
        throw Exception(error ?? 'Request failed');
      }
      throw Exception('Network error: ${e.message}');
    }
  }
}

final authApiProvider = Provider<AuthApi>((ref) => AuthApi());
