import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/router/app_back_button.dart';

import '../../../core/anilist/anilist_config.dart';
import '../../../core/anilist/anilist_deep_link_service.dart';
import '../../../core/theme/app_colors.dart';
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
    _codeSubscription = aniListDeepLinkService.onAuthCode.listen(
      _handleAuthCode,
    );
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
          content: Text(
            anilistUserId != null
                ? 'AniList account linked'
                : 'Failed to link AniList account',
          ),
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
    final colors = theme.brightness == Brightness.light
        ? AppColors.light
        : AppColors.dark;
    final name = authState.user?.name ?? 'User';
    final email = authState.user?.email ?? '';
    final isLight = theme.brightness == Brightness.light;

    return Scaffold(
      appBar: AppBar(
        leading: const AppBackButton(),
        automaticallyImplyLeading: false,
        title: const Text('Profile'),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        children: [
          const SizedBox(height: 8),
          Column(
            children: [
              CircleAvatar(
                radius: 40,
                backgroundColor: theme.colorScheme.primaryContainer,
                child: Text(
                  name.isNotEmpty ? name[0].toUpperCase() : '?',
                  style: GoogleFonts.cinzel(
                    fontSize: 30,
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.onPrimaryContainer,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                name,
                style: GoogleFonts.cinzel(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: theme.colorScheme.onSurface,
                ),
              ),
              if (email.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  email,
                  style: TextStyle(
                    fontSize: 15,
                    color: theme.colorScheme.onSurface.withAlpha(153),
                  ),
                ),
              ],
              if (authState.isGuest)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.secondary.withAlpha(30),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      'Guest',
                      style: TextStyle(
                        fontSize: 13,
                        color: theme.colorScheme.secondary,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 32),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: colors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Appearance',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.2,
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: SegmentedButton<ThemeMode>(
                    showSelectedIcon: false,
                    segments: const [
                      ButtonSegment(
                        value: ThemeMode.light,
                        icon: Icon(Icons.light_mode),
                        label: Text('Light'),
                      ),
                      ButtonSegment(
                        value: ThemeMode.dark,
                        icon: Icon(Icons.dark_mode),
                        label: Text('Dark'),
                      ),
                      ButtonSegment(
                        value: ThemeMode.system,
                        icon: Icon(Icons.brightness_auto),
                        label: Text('System'),
                      ),
                    ],
                    selected: {ref.watch(themeModeProvider)},
                    onSelectionChanged: (selected) {
                      ref
                          .read(themeModeProvider.notifier)
                          .setThemeMode(selected.first);
                    },
                    style: SegmentedButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      foregroundColor: colors.text,
                      selectedForegroundColor: Colors.white,
                      selectedBackgroundColor: theme.colorScheme.primary,
                      backgroundColor: Colors.transparent,
                      side: BorderSide(color: colors.border),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: colors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'AniList Sync',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.2,
                  ),
                ),
                const SizedBox(height: 12),
                if (_loadingStatus)
                  const SizedBox(
                    height: 24,
                    width: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else if (_linked)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.green.withAlpha(30),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.green.withAlpha(80)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.check_circle,
                              size: 16,
                              color: isLight
                                  ? Colors.green.shade800
                                  : Colors.green.shade300,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'Linked as AniList user #$_anilistUserId',
                              style: TextStyle(
                                fontSize: 13,
                                color: isLight
                                    ? Colors.green.shade800
                                    : Colors.green.shade300,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: _unlink,
                          style: OutlinedButton.styleFrom(
                            foregroundColor: theme.colorScheme.onSurface
                                .withAlpha(179),
                            side: BorderSide(
                              color: theme.colorScheme.onSurface.withAlpha(40),
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text('Unlink AniList'),
                        ),
                      ),
                    ],
                  )
                else
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _linking ? null : _startLinking,
                      icon: _linking
                          ? const SizedBox(
                              height: 16,
                              width: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.link),
                      label: Text(
                        _linking ? 'Linking...' : 'Link AniList Account',
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: theme.colorScheme.primary,
                        side: BorderSide(
                          color: theme.colorScheme.primary.withAlpha(100),
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: OutlinedButton(
              onPressed: () async {
                await ref.read(authControllerProvider.notifier).logout();
                if (context.mounted) context.go('/login');
              },
              style: OutlinedButton.styleFrom(
                foregroundColor: isLight
                    ? Colors.red.shade700
                    : Colors.red.shade300,
                side: BorderSide(
                  color: (isLight ? Colors.red.shade700 : Colors.red.shade300)
                      .withAlpha(120),
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text(
                'Logout',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
