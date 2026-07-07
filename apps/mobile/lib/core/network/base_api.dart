import 'package:dio/dio.dart';

class BaseApi {
  final Dio dio;

  BaseApi(this.dio);

  Future<Map<String, dynamic>> get(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    try {
      final response = await dio.get(
        path,
        queryParameters: queryParameters,
      );
      final body = response.data as Map<String, dynamic>;
      if (body['success'] == true) {
        return body;
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

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? data,
  }) async {
    try {
      final response = await dio.post(path, data: data);
      final body = response.data as Map<String, dynamic>;
      if (body['success'] == true) {
        return body;
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

  Future<Map<String, dynamic>> delete(
    String path, {
    Map<String, dynamic>? data,
  }) async {
    try {
      final response = await dio.delete(path, data: data);
      final body = response.data as Map<String, dynamic>;
      if (body['success'] == true) {
        return body;
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
