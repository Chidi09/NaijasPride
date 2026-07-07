import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/application/auth_controller.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/profile_screen.dart';
import '../../features/auth/presentation/signup_screen.dart';
import '../../features/content/anime/presentation/anime_detail_screen.dart';
import '../../features/content/anime/presentation/anime_screen.dart';
import '../../features/content/movies/presentation/movie_detail_screen.dart';
import '../../features/content/movies/presentation/movies_screen.dart';
import '../../features/content/tv_shows/presentation/tv_show_detail_screen.dart';
import '../../features/content/tv_shows/presentation/tv_shows_screen.dart';
import '../../features/downloads/presentation/downloads_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/search/presentation/search_screen.dart';
import 'app_shell.dart';

CustomTransitionPage<T> _tabSwitchPage<T>(Widget child, GoRouterState state) {
  return CustomTransitionPage<T>(
    key: state.pageKey,
    child: child,
    transitionDuration: const Duration(milliseconds: 200),
    reverseTransitionDuration: const Duration(milliseconds: 200),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      return FadeTransition(
        opacity: CurvedAnimation(parent: animation, curve: Curves.easeInOut),
        child: child,
      );
    },
  );
}

CustomTransitionPage<T> _drillInPage<T>(Widget child, GoRouterState state) {
  return CustomTransitionPage<T>(
    key: state.pageKey,
    child: child,
    transitionDuration: const Duration(milliseconds: 350),
    reverseTransitionDuration: const Duration(milliseconds: 350),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      return FadeTransition(
        opacity: CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
        child: ScaleTransition(
          scale: Tween<double>(begin: 0.97, end: 1.0).animate(
            CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
          ),
          child: child,
        ),
      );
    },
  );
}

class _AuthRefreshNotifier extends ChangeNotifier {
  _AuthRefreshNotifier(Ref ref) {
    ref.listen(authControllerProvider, (previous, next) {
      if (previous?.status != next.status) {
        notifyListeners();
      }
    });
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _AuthRefreshNotifier(ref);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final authState = ref.read(authControllerProvider);
      final isAuthRoute = state.matchedLocation == '/login' ||
          state.matchedLocation == '/signup';

      if (authState.status == AuthStatus.unknown) {
        return null;
      }
      if (authState.status == AuthStatus.unauthenticated && !isAuthRoute) {
        return '/login';
      }
      if (authState.status == AuthStatus.authenticated && isAuthRoute) {
        return '/';
      }
      return null;
    },
    routes: [
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(
            path: '/',
            pageBuilder: (context, state) => _tabSwitchPage(const HomeScreen(), state),
          ),
          GoRoute(
            path: '/movies',
            pageBuilder: (context, state) => _tabSwitchPage(const MoviesScreen(), state),
          ),
          GoRoute(
            path: '/tv',
            pageBuilder: (context, state) => _tabSwitchPage(const TvShowsScreen(), state),
          ),
          GoRoute(
            path: '/anime',
            pageBuilder: (context, state) => _tabSwitchPage(const AnimeScreen(), state),
          ),
          GoRoute(
            path: '/search',
            pageBuilder: (context, state) => _tabSwitchPage(const SearchScreen(), state),
          ),
        ],
      ),
      GoRoute(
        path: '/movies/:slug',
        pageBuilder: (context, state) => _drillInPage(
          MovieDetailScreen(slug: state.pathParameters['slug']!),
          state,
        ),
      ),
      GoRoute(
        path: '/tv/:slug',
        pageBuilder: (context, state) => _drillInPage(
          TvShowDetailScreen(slug: state.pathParameters['slug']!),
          state,
        ),
      ),
      GoRoute(
        path: '/anime/:id',
        pageBuilder: (context, state) => _drillInPage(
          AnimeDetailScreen(id: int.parse(state.pathParameters['id']!)),
          state,
        ),
      ),
      GoRoute(
        path: '/profile',
        pageBuilder: (context, state) => _drillInPage(const ProfileScreen(), state),
      ),
      GoRoute(
        path: '/downloads',
        pageBuilder: (context, state) => _drillInPage(const DownloadsScreen(), state),
      ),
      GoRoute(
        path: '/login',
        pageBuilder: (context, state) => _drillInPage(const LoginScreen(), state),
      ),
      GoRoute(
        path: '/signup',
        pageBuilder: (context, state) => _drillInPage(const SignupScreen(), state),
      ),
    ],
  );
});
