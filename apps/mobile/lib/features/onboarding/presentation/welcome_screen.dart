import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/router/app_back_button.dart';
import '../../../core/theme/app_colors.dart';
import '../../auth/application/auth_controller.dart';
import '../../content/anime/data/anime_api.dart';
import '../../content/movies/data/movies_api.dart';
import '../../content/tv_shows/data/tv_shows_api.dart';

final onboardingSeenProvider = NotifierProvider<OnboardingSeenNotifier, bool>(
  OnboardingSeenNotifier.new,
);

class OnboardingSeenNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    state = prefs.getBool('has_seen_onboarding') ?? false;
  }

  Future<void> markSeen() async {
    state = true;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('has_seen_onboarding', true);
  }
}

class WelcomeScreen extends ConsumerStatefulWidget {
  const WelcomeScreen({super.key});

  @override
  ConsumerState<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends ConsumerState<WelcomeScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;
  bool _guestLoading = false;

  String? _tvImageUrl;
  String? _animeImageUrl;
  String? _movieImageUrl;

  @override
  void initState() {
    super.initState();
    _fetchImages();
  }

  Future<void> _fetchImages() async {
    final results = await Future.wait([
      _fetchTvImage(),
      _fetchAnimeImage(),
      _fetchMovieImage(),
    ]);
    if (mounted) {
      setState(() {
        _tvImageUrl = results[0];
        _animeImageUrl = results[1];
        _movieImageUrl = results[2];
      });
    }
  }

  Future<String?> _fetchTvImage() async {
    try {
      final result = await ref.read(tvShowsApiProvider).search();
      for (final show in result.data) {
        final url = show.backdropUrl ?? show.posterUrl;
        if (url != null && url.isNotEmpty) return url;
      }
    } catch (_) {}
    return null;
  }

  Future<String?> _fetchAnimeImage() async {
    try {
      final result = await ref.read(animeApiProvider).search();
      for (final anime in result.media) {
        final url = anime.bannerImage ?? anime.coverImage.large;
        if (url != null && url.isNotEmpty) return url;
      }
    } catch (_) {}
    return null;
  }

  Future<String?> _fetchMovieImage() async {
    try {
      final featured = await ref.read(moviesApiProvider).featured();
      for (final entry in featured.entries) {
        for (final movie in entry.value) {
          final url = movie.backdropUrl ?? movie.posterUrl;
          if (url != null && url.isNotEmpty) return url;
        }
      }
    } catch (_) {}
    return null;
  }

  Future<void> _markSeenAndGo(String path) async {
    await ref.read(onboardingSeenProvider.notifier).markSeen();
    if (mounted) context.go(path);
  }

  Future<void> _continueAsGuest() async {
    setState(() => _guestLoading = true);
    try {
      await ref.read(authControllerProvider.notifier).continueAsGuest();
      await ref.read(onboardingSeenProvider.notifier).markSeen();
      if (mounted) context.go('/');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    } finally {
      if (mounted) setState(() => _guestLoading = false);
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.brightness == Brightness.light
        ? AppColors.light
        : AppColors.dark;

    return Scaffold(
      appBar: AppBar(
        leading: const AppBackButton(),
        automaticallyImplyLeading: false,
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.only(right: 16),
                child: TextButton(
                  onPressed: () => _markSeenAndGo('/login'),
                  child: Text(
                    'Skip',
                    style: GoogleFonts.plusJakartaSans(
                      color: colors.accent,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                onPageChanged: (page) => setState(() => _currentPage = page),
                itemCount: 3,
                itemBuilder: (context, index) {
                  final imageUrl = index == 0
                      ? _tvImageUrl
                      : index == 1
                      ? _animeImageUrl
                      : _movieImageUrl;
                  final title = index == 0
                      ? 'Binge Every Season'
                      : index == 1
                      ? 'Your Anime, Uninterrupted'
                      : 'Nollywood to Hollywood';
                  final subtitle = index == 0
                      ? 'From gripping dramas to must-watch series — all in one place.'
                      : index == 1
                      ? 'Skip intros, pick up where you left off, never miss an episode.'
                      : 'Blockbusters, indie gems, and everything in between.';

                  return AnimatedBuilder(
                    animation: _pageController,
                    builder: (context, child) {
                      double pageOffset = 0;
                      if (_pageController.hasClients &&
                          _pageController.position.haveDimensions) {
                        pageOffset = _pageController.page! - index;
                      }

                      return Padding(
                        padding: const EdgeInsets.fromLTRB(28, 8, 28, 16),
                        child: SingleChildScrollView(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Transform.translate(
                                offset: Offset(pageOffset * 40, 0),
                                child: Container(
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(28),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withAlpha(40),
                                        blurRadius: 20,
                                        offset: const Offset(0, 8),
                                      ),
                                    ],
                                  ),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(28),
                                    child: AspectRatio(
                                      aspectRatio: 0.92,
                                      child: Stack(
                                        fit: StackFit.expand,
                                        children: [
                                          Transform.scale(
                                            scale: 1.15,
                                            child: Transform.translate(
                                              offset: Offset(
                                                pageOffset * 25,
                                                0,
                                              ),
                                              child: imageUrl != null
                                                  ? CachedNetworkImage(
                                                      imageUrl: imageUrl,
                                                      fit: BoxFit.cover,
                                                      errorWidget: (_, _, _) =>
                                                          Container(
                                                            color:
                                                                colors.surface,
                                                          ),
                                                      placeholder: (_, _) =>
                                                          Container(
                                                            color:
                                                                colors.surface,
                                                          ),
                                                    )
                                                  : Container(
                                                      color: colors.surface,
                                                    ),
                                            ),
                                          ),
                                          Container(
                                            decoration: BoxDecoration(
                                              gradient: LinearGradient(
                                                begin: Alignment.topCenter,
                                                end: Alignment.bottomCenter,
                                                colors: [
                                                  Colors.transparent,
                                                  Colors.transparent,
                                                  Colors.black.withAlpha(64),
                                                ],
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 28),
                              Opacity(
                                opacity: (1 - pageOffset.abs()).clamp(0.0, 1.0),
                                child: Column(
                                  children: [
                                    Transform.translate(
                                      offset: Offset(pageOffset * 80, 0),
                                      child: Text(
                                        title,
                                        style: GoogleFonts.cinzel(
                                          fontSize: 26,
                                          fontWeight: FontWeight.bold,
                                          color: colors.textStrong,
                                        ),
                                        textAlign: TextAlign.center,
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    Transform.translate(
                                      offset: Offset(pageOffset * 120, 0),
                                      child: Text(
                                        subtitle,
                                        style: GoogleFonts.plusJakartaSans(
                                          fontSize: 14,
                                          color: colors.text,
                                          height: 1.5,
                                        ),
                                        textAlign: TextAlign.center,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(3, (index) {
                final isActive = _currentPage == index;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  curve: Curves.easeOutCubic,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  height: isActive ? 8 : 6,
                  width: isActive ? 28 : 8,
                  decoration: BoxDecoration(
                    color: isActive
                        ? colors.accent
                        : colors.border.withAlpha(100),
                    borderRadius: BorderRadius.circular(4),
                  ),
                );
              }),
            ),
            const SizedBox(height: 32),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              child: _currentPage == 2
                  ? Padding(
                      key: const ValueKey('final-actions'),
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton(
                              onPressed: () => _markSeenAndGo('/login'),
                              style: FilledButton.styleFrom(
                                backgroundColor: colors.primary,
                                foregroundColor: Colors.white,
                                minimumSize: const Size.fromHeight(52),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16),
                                ),
                              ),
                              child: Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'Get Started',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  Container(
                                    width: 32,
                                    height: 32,
                                    decoration: BoxDecoration(
                                      color: Colors.white.withAlpha(56),
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(
                                      Icons.arrow_forward_rounded,
                                      color: Colors.white,
                                      size: 18,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          SizedBox(
                            width: double.infinity,
                            child: OutlinedButton(
                              onPressed: _guestLoading
                                  ? null
                                  : _continueAsGuest,
                              style: OutlinedButton.styleFrom(
                                minimumSize: const Size.fromHeight(48),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                side: BorderSide(color: colors.border),
                              ),
                              child: _guestLoading
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : Text(
                                      'Continue as Guest',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w600,
                                        color: colors.text,
                                      ),
                                    ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: () => _markSeenAndGo('/login'),
                            child: Text(
                              'Log in',
                              style: GoogleFonts.plusJakartaSans(
                                color: colors.accent,
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    )
                  : Padding(
                      key: const ValueKey('next-action'),
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: () => _pageController.nextPage(
                            duration: const Duration(milliseconds: 350),
                            curve: Curves.easeOutCubic,
                          ),
                          style: FilledButton.styleFrom(
                            backgroundColor: colors.primary,
                            foregroundColor: Colors.white,
                            minimumSize: const Size.fromHeight(52),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Next',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              Container(
                                width: 32,
                                height: 32,
                                decoration: BoxDecoration(
                                  color: Colors.white.withAlpha(56),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.arrow_forward_rounded,
                                  color: Colors.white,
                                  size: 18,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}
