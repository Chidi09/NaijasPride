import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_api.dart';
import '../data/token_storage.dart';
import '../data/user_model.dart';
import 'auth_events.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState {
  final AuthStatus status;
  final User? user;
  final bool isGuest;

  const AuthState({
    this.status = AuthStatus.unknown,
    this.user,
    this.isGuest = false,
  });

  AuthState copyWith({
    AuthStatus? status,
    User? user,
    bool? isGuest,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      isGuest: isGuest ?? this.isGuest,
    );
  }
}

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    final authEventsController = ref.read(authEventsProvider);
    final sub = authEventsController.stream.listen((event) {
      if (event == AuthEvent.unauthenticated) {
        ref.read(tokenStorageProvider).clear();
        state = const AuthState(status: AuthStatus.unauthenticated);
      }
    });
    ref.onDispose(sub.cancel);
    return const AuthState();
  }

  Future<void> bootstrap() async {
    final tokenStorage = ref.read(tokenStorageProvider);
    final session = await tokenStorage.readSession();
    if (session != null) {
      try {
        final user = User.fromJson(
          jsonDecode(session.userJson) as Map<String, dynamic>,
        );
        state = AuthState(
          status: AuthStatus.authenticated,
          user: user,
          isGuest: session.isGuest,
        );
      } catch (_) {
        await tokenStorage.clear();
        state = const AuthState(status: AuthStatus.unauthenticated);
      }
    } else {
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  Future<void> login(String email, String password) async {
    final authApi = ref.read(authApiProvider);
    final data = await authApi.login(email: email, password: password);
    await _saveSessionAndUpdateState(data);
  }

  Future<void> signup(String email, String password, String? name) async {
    final authApi = ref.read(authApiProvider);
    await authApi.signup(email: email, password: password, name: name);
    await login(email, password);
  }

  Future<void> loginWithGoogle(String idToken) async {
    final authApi = ref.read(authApiProvider);
    final data = await authApi.loginWithGoogle(idToken);
    await _saveSessionAndUpdateState(data);
  }

  Future<void> continueAsGuest() async {
    final authApi = ref.read(authApiProvider);
    final data = await authApi.continueAsGuest();
    await _saveSessionAndUpdateState(data, isGuest: true);
  }

  Future<void> convertGuest({
    required String email,
    required String password,
    String? name,
  }) async {
    final authApi = ref.read(authApiProvider);
    final tokenStorage = ref.read(tokenStorageProvider);
    final session = await tokenStorage.readSession();
    if (session == null) {
      throw Exception('No session found');
    }
    final data = await authApi.convertGuest(
      email: email,
      password: password,
      name: name,
      token: session.token,
    );
    final user = data['user'] as Map<String, dynamic>;
    final userJson = jsonEncode(user);
    await tokenStorage.saveSession(
      token: session.token,
      refreshToken: session.refreshToken,
      userJson: userJson,
      isGuest: false,
    );
    state = AuthState(
      status: AuthStatus.authenticated,
      user: User.fromJson(user),
      isGuest: false,
    );
  }

  Future<void> logout() async {
    final authApi = ref.read(authApiProvider);
    final tokenStorage = ref.read(tokenStorageProvider);
    try {
      final session = await tokenStorage.readSession();
      if (session != null) {
        await authApi.logout(session.token);
      }
    } catch (_) {}
    await tokenStorage.clear();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  Future<void> _saveSessionAndUpdateState(
    Map<String, dynamic> data, {
    bool isGuest = false,
  }) async {
    final tokenStorage = ref.read(tokenStorageProvider);
    final userData = data['user'] as Map<String, dynamic>;
    final token = data['token'] as String;
    final refreshToken = data['refreshToken'] as String;
    final user = User.fromJson(userData);
    final userJson = jsonEncode(userData);
    await tokenStorage.saveSession(
      token: token,
      refreshToken: refreshToken,
      userJson: userJson,
      isGuest: data['isGuest'] as bool? ?? isGuest,
    );
    state = AuthState(
      status: AuthStatus.authenticated,
      user: user,
      isGuest: data['isGuest'] as bool? ?? isGuest,
    );
  }
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);
