import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/router/app_back_button.dart';

import '../../../core/anilist/anilist_config.dart';
import '../../../core/anilist/anilist_deep_link_service.dart';
import '../../../core/theme/theme_mode_provider.dart';
import '../../content/anime/data/anime_api.dart';
import '../application/auth_controller.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _linked = false;
  int? _anilistUserId;
  bool _loadingStatus = true;
  bool _linking = false;
  StreamSubscription<String>? _codeSubscription;

  @override
  void initState() {
    super.initState();
    aniListDeepLinkService.initialize();
    _codeSubscription = aniListDeepLinkService.onAuthCode.listen(_handleAuthCode);
    _loadLinkStatus();
  }

  @override
  void dispose() {
    _codeSubscription?.cancel();
    super.dispose();
  }

  Future<void> _loadLinkStatus() async {
    final status = await ref.read(animeApiProvider).getAniListLinkStatus();
    if (!mounted) return;
    setState(() {
      _linked = status.linked;
      _anilistUserId = status.anilistUserId;
      _loadingStatus = false;
    });
  }

  Future<void> _handleAuthCode(String code) async {
    setState(() => _linking = true);
    final anilistUserId = await ref.read(animeApiProvider).linkAniList(code);
    if (!mounted) return;
    setState(() {
      _linking = false;
      if (anilistUserId != null) {
        _linked = true;
        _anilistUserId = anilistUserId;
      }
    });
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(anilistUserId != null
              ? 'AniList account linked'
              : 'Failed to link AniList account'),
        ),
      );
    }
  }

  Future<void> _unlink() async {
    final success = await ref.read(animeApiProvider).unlinkAniList();
    if (!mounted) return;
    if (success) {
      setState(() {
        _linked = false;
        _anilistUserId = null;
      });
    }
  }

  Future<void> _startLinking() async {
    final url = Uri.parse(buildAniListAuthorizeUrl());
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        leading: const AppBackButton(),
        automaticallyImplyLeading: false,
        title: const Text('Profile'),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                authState.user?.name ?? 'User',
                style: GoogleFonts.cinzel(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: theme.colorScheme.onSurface,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                authState.user?.email ?? '',
                style: TextStyle(
                  fontSize: 16,
                  color: theme.colorScheme.onSurface.withAlpha(179),
                ),
              ),
              if (authState.isGuest) ...[
                const SizedBox(height: 8),
                Text(
                  'Guest',
                  style: TextStyle(
                    fontSize: 14,
                    color: theme.colorScheme.secondary,
                  ),
                ),
              ],
              const SizedBox(height: 32),
              Text('Appearance', style: theme.textTheme.titleMedium),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: SegmentedButton<ThemeMode>(
                  segments: const [
                    ButtonSegment(value: ThemeMode.light, icon: Icon(Icons.light_mode), label: Text('Light')),
                    ButtonSegment(value: ThemeMode.dark, icon: Icon(Icons.dark_mode), label: Text('Dark')),
                    ButtonSegment(value: ThemeMode.system, icon: Icon(Icons.brightness_auto), label: Text('System')),
                  ],
                  selected: {ref.watch(themeModeProvider)},
                  onSelectionChanged: (selected) {
                    ref.read(themeModeProvider.notifier).setThemeMode(selected.first);
                  },
                ),
              ),
              const SizedBox(height: 32),
              Text('AniList Sync', style: theme.textTheme.titleMedium),
              const SizedBox(height: 8),
              if (_loadingStatus)
                const SizedBox(
                  height: 24,
                  width: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else if (_linked)
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Linked as AniList user #$_anilistUserId',
                      style: TextStyle(color: theme.colorScheme.onSurface.withAlpha(179)),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton(
                      onPressed: _unlink,
                      child: const Text('Unlink AniList'),
                    ),
                  ],
                )
              else
                OutlinedButton.icon(
                  onPressed: _linking ? null : _startLinking,
                  icon: _linking
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.link),
                  label: Text(_linking ? 'Linking...' : 'Link AniList Account'),
                ),
              const SizedBox(height: 32),
              FilledButton(
                onPressed: () async {
                  await ref.read(authControllerProvider.notifier).logout();
                  if (context.mounted) context.go('/login');
                },
                child: const Text('Logout'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
