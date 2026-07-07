import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class Session {
  final String token;
  final String refreshToken;
  final String userJson;
  final bool isGuest;

  const Session({
    required this.token,
    required this.refreshToken,
    required this.userJson,
    required this.isGuest,
  });
}

class TokenStorage {
  final FlutterSecureStorage _storage;

  TokenStorage(this._storage);

  static const _tokenKey = 'auth_token';
  static const _refreshTokenKey = 'auth_refresh_token';
  static const _userKey = 'auth_user';
  static const _isGuestKey = 'auth_is_guest';

  Future<void> saveSession({
    required String token,
    required String refreshToken,
    required String userJson,
    required bool isGuest,
  }) async {
    await Future.wait([
      _storage.write(key: _tokenKey, value: token),
      _storage.write(key: _refreshTokenKey, value: refreshToken),
      _storage.write(key: _userKey, value: userJson),
      _storage.write(key: _isGuestKey, value: isGuest.toString()),
    ]);
  }

  Future<Session?> readSession() async {
    final token = await _storage.read(key: _tokenKey);
    if (token == null) return null;
    final refreshToken = await _storage.read(key: _refreshTokenKey);
    final userJson = await _storage.read(key: _userKey);
    final isGuestStr = await _storage.read(key: _isGuestKey);
    if (refreshToken == null || userJson == null) return null;
    return Session(
      token: token,
      refreshToken: refreshToken,
      userJson: userJson,
      isGuest: isGuestStr == 'true',
    );
  }

  Future<void> clear() async {
    await Future.wait([
      _storage.delete(key: _tokenKey),
      _storage.delete(key: _refreshTokenKey),
      _storage.delete(key: _userKey),
      _storage.delete(key: _isGuestKey),
    ]);
  }
}

final tokenStorageProvider = Provider<TokenStorage>((ref) {
  return TokenStorage(const FlutterSecureStorage());
});
