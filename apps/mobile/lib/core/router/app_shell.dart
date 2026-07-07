import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

import '../build_flavor.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final isWide = width >= 600;
    final content = isWide ? _WideLayout(child: child) : _NarrowLayout(child: child);

    return Column(
      children: [
        const _OfflineBanner(),
        Expanded(child: content),
      ],
    );
  }
}

class _OfflineBanner extends StatefulWidget {
  const _OfflineBanner();

  @override
  State<_OfflineBanner> createState() => _OfflineBannerState();
}

class _OfflineBannerState extends State<_OfflineBanner> {
  bool _isOffline = false;
  StreamSubscription<List<ConnectivityResult>>? _subscription;

  @override
  void initState() {
    super.initState();
    _subscription = Connectivity().onConnectivityChanged.listen((result) {
      if (mounted) {
        setState(() => _isOffline = result.contains(ConnectivityResult.none) || result.isEmpty);
      }
    });
    Connectivity().checkConnectivity().then((result) {
      if (mounted) {
        setState(() => _isOffline = result.contains(ConnectivityResult.none) || result.isEmpty);
      }
    });
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_isOffline) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      color: Colors.redAccent,
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
      child: const SafeArea(
        bottom: false,
        child: Text(
          'No internet connection',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white, fontSize: 13),
        ),
      ),
    );
  }
}

Widget _wrapForOverscan(BuildContext context, Widget child) {
  if (!isTvBuild) return child;
  final size = MediaQuery.sizeOf(context);
  return Padding(
    padding: EdgeInsets.symmetric(
      horizontal: size.width * 0.05,
      vertical: size.height * 0.05,
    ),
    child: child,
  );
}

class _NarrowLayout extends StatelessWidget {
  const _NarrowLayout({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.toString();
    final currentIndex = _destinationIndex(location);

    return Scaffold(
      body: _wrapForOverscan(context, child),
      bottomNavigationBar: NavigationBar(
        selectedIndex: currentIndex,
        onDestinationSelected: (index) {
          _onNavigate(context, index);
        },
        destinations: _destinations(),
      ),
    );
  }
}

class _WideLayout extends StatefulWidget {
  const _WideLayout({required this.child});

  final Widget child;

  @override
  State<_WideLayout> createState() => _WideLayoutState();
}

class _WideLayoutState extends State<_WideLayout> {
  bool _railFocused = false;

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.toString();
    final currentIndex = _destinationIndex(location);
    final width = MediaQuery.sizeOf(context).width;
    final extended = width >= 840;
    final actuallyExtended = extended || _railFocused;

    return Scaffold(
      body: Row(
        children: [
          Focus(
            onFocusChange: (focused) => setState(() => _railFocused = focused),
            child: NavigationRail(
              selectedIndex: currentIndex,
              onDestinationSelected: (index) {
                _onNavigate(context, index);
              },
              extended: actuallyExtended,
              labelType: actuallyExtended ? NavigationRailLabelType.none : null,
              destinations: _railDestinations(),
            ),
          ),
          const VerticalDivider(width: 1),
          Expanded(child: _wrapForOverscan(context, widget.child)),
        ],
      ),
    );
  }
}

const _baseRoutes = ['/', '/movies', '/tv', '/anime', '/search'];
final _routes = [..._baseRoutes, if (!isTvBuild) '/downloads'];

int _destinationIndex(String location) {
  final idx = _routes.indexOf(location);
  return idx >= 0 ? idx : 0;
}

void _onNavigate(BuildContext context, int index) {
  context.go(_routes[index]);
}

List<NavigationDestination> _destinations() {
  return [
    const NavigationDestination(
      icon: Icon(Icons.home_outlined),
      selectedIcon: Icon(Icons.home),
      label: 'Home',
    ),
    const NavigationDestination(
      icon: Icon(Icons.movie_outlined),
      selectedIcon: Icon(Icons.movie),
      label: 'Movies',
    ),
    const NavigationDestination(
      icon: Icon(Icons.tv_outlined),
      selectedIcon: Icon(Icons.tv),
      label: 'TV',
    ),
    const NavigationDestination(
      icon: Icon(Icons.auto_awesome_outlined),
      selectedIcon: Icon(Icons.auto_awesome),
      label: 'Anime',
    ),
    const NavigationDestination(
      icon: Icon(Icons.search_outlined),
      selectedIcon: Icon(Icons.search),
      label: 'Search',
    ),
    if (!isTvBuild)
      const NavigationDestination(
        icon: Icon(Icons.download_outlined),
        selectedIcon: Icon(Icons.download),
        label: 'Downloads',
      ),
  ];
}

List<NavigationRailDestination> _railDestinations() {
  return [
    const NavigationRailDestination(
      icon: Icon(Icons.home_outlined),
      selectedIcon: Icon(Icons.home),
      label: Text('Home'),
    ),
    const NavigationRailDestination(
      icon: Icon(Icons.movie_outlined),
      selectedIcon: Icon(Icons.movie),
      label: Text('Movies'),
    ),
    const NavigationRailDestination(
      icon: Icon(Icons.tv_outlined),
      selectedIcon: Icon(Icons.tv),
      label: Text('TV'),
    ),
    const NavigationRailDestination(
      icon: Icon(Icons.auto_awesome_outlined),
      selectedIcon: Icon(Icons.auto_awesome),
      label: Text('Anime'),
    ),
    const NavigationRailDestination(
      icon: Icon(Icons.search_outlined),
      selectedIcon: Icon(Icons.search),
      label: Text('Search'),
    ),
    if (!isTvBuild)
      const NavigationRailDestination(
        icon: Icon(Icons.download_outlined),
        selectedIcon: Icon(Icons.download),
        label: Text('Downloads'),
      ),
  ];
}
