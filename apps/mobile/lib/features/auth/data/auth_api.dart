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
    return _request('/api/v1/auth/signup', data: {
      'email': email,
      'password': password,
      'name': name,
    });
  }

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    return _request('/api/v1/auth/login', data: {
      'email': email,
      'password': password,
    });
  }

  Future<Map<String, dynamic>> loginWithGoogle(String idToken) async {
    return _request('/api/v1/auth/google', data: {'idToken': idToken});
  }

  Future<Map<String, dynamic>> continueAsGuest() async {
    return _request('/api/v1/auth/guest');
  }

  Future<Map<String, dynamic>> refresh(String refreshToken) async {
    return _request('/api/v1/auth/refresh', data: {'refreshToken': refreshToken});
  }

  Future<Map<String, dynamic>> convertGuest({
    required String email,
    required String password,
    String? name,
    required String token,
  }) async {
    return _request(
      '/api/v1/auth/convert-guest',
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
        '/api/v1/auth/logout',
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
      // TEMPORARY diagnostic detail (full request URL + status code) appended
      // to the error message so a real-device failure that can't be
      // reproduced from a dev machine is fully diagnosable from the on-screen
      // text alone. Remove once the root cause behind a live "not found" on
      // fresh installs is confirmed and fixed.
      final url = e.requestOptions.uri.toString();
      final status = e.response?.statusCode;
      if (e.response?.data is Map) {
        final error = (e.response!.data as Map<String, dynamic>)['error'];
        throw Exception('${error ?? 'Request failed'} [$status $url]');
      }
      throw Exception('Network error: ${e.message} [$url]');
    }
  }
}

final authApiProvider = Provider<AuthApi>((ref) => AuthApi());
