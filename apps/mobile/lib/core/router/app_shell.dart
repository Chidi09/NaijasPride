import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../build_flavor.dart';
import '../theme/app_colors.dart';

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
      bottomNavigationBar: _GlassBottomNav(
        selectedIndex: currentIndex,
        onTap: (index) => _onNavigate(context, index),
        destinations: _navDestinations(),
      ),
    );
  }
}

class _GlassBottomNav extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onTap;
  final List<_NavItem> destinations;

  const _GlassBottomNav({
    required this.selectedIndex,
    required this.onTap,
    required this.destinations,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).brightness == Brightness.light
        ? AppColors.light
        : AppColors.dark;

    Widget navContent = Container(
      height: 64,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: colors.surface.withAlpha(180),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(
          color: colors.border.withAlpha(153),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: colors.primary.withAlpha(13),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: destinations.asMap().entries.map((entry) {
          final index = entry.key;
          final dest = entry.value;
          final selected = index == selectedIndex;
          return Expanded(
            child: GestureDetector(
              onTap: () => onTap(index),
              behavior: HitTestBehavior.opaque,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeInOut,
                margin: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                decoration: BoxDecoration(
                  color: selected
                      ? colors.primary.withAlpha(26)
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      selected ? dest.selectedIcon : dest.icon,
                      size: 22,
                      color: selected ? colors.accent : colors.text.withAlpha(153),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      dest.label,
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                        color: selected ? colors.accent : colors.text.withAlpha(153),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );

    navContent = ClipRRect(
      borderRadius: BorderRadius.circular(32),
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: navContent,
      ),
    );

    return Padding(
      padding: const EdgeInsets.only(left: 20, right: 20, bottom: 24),
      child: navContent,
    );
  }
}

class _NavItem {
  final IconData icon;
  final IconData selectedIcon;
  final String label;

  const _NavItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
  });
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
final _routes = _baseRoutes;

int _destinationIndex(String location) {
  final idx = _routes.indexOf(location);
  return idx >= 0 ? idx : 0;
}

void _onNavigate(BuildContext context, int index) {
  context.go(_routes[index]);
}

List<_NavItem> _navDestinations() {
  return const [
    _NavItem(icon: LucideIcons.home, selectedIcon: LucideIcons.home, label: 'Home'),
    _NavItem(icon: LucideIcons.film, selectedIcon: LucideIcons.film, label: 'Movies'),
    _NavItem(icon: LucideIcons.tv, selectedIcon: LucideIcons.tv, label: 'TV'),
    _NavItem(icon: LucideIcons.sparkles, selectedIcon: LucideIcons.sparkles, label: 'Anime'),
    _NavItem(icon: LucideIcons.search, selectedIcon: LucideIcons.search, label: 'Search'),
  ];
}

List<NavigationRailDestination> _railDestinations() {
  return const [
    NavigationRailDestination(
      icon: Icon(LucideIcons.home),
      selectedIcon: Icon(LucideIcons.home),
      label: Text('Home'),
    ),
    NavigationRailDestination(
      icon: Icon(LucideIcons.film),
      selectedIcon: Icon(LucideIcons.film),
      label: Text('Movies'),
    ),
    NavigationRailDestination(
      icon: Icon(LucideIcons.tv),
      selectedIcon: Icon(LucideIcons.tv),
      label: Text('TV'),
    ),
    NavigationRailDestination(
      icon: Icon(LucideIcons.sparkles),
      selectedIcon: Icon(LucideIcons.sparkles),
      label: Text('Anime'),
    ),
    NavigationRailDestination(
      icon: Icon(LucideIcons.search),
      selectedIcon: Icon(LucideIcons.search),
      label: Text('Search'),
    ),
  ];
}
