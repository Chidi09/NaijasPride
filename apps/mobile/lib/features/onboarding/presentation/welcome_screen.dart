import 'dart:ui';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/utils/image_sizing.dart';
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

  /// Each page's artwork is applied the moment its own request returns.
  ///
  /// These used to be awaited together, so all three pages sat on the
  /// fallback gradient until the slowest of the three finished — the first
  /// page was ready long before it was shown.
  void _fetchImages() {
    void apply(Future<String?> future, void Function(String) assign) {
      future
          .then((url) {
            if (!mounted || url == null || url.isEmpty) return;
            setState(() => assign(url));
          })
          .catchError((_) {});
    }

    apply(_fetchTvImage(), (u) => _tvImageUrl = u);
    apply(_fetchAnimeImage(), (u) => _animeImageUrl = u);
    apply(_fetchMovieImage(), (u) => _movieImageUrl = u);
  }

  // These pages are full-screen and portrait, so portrait artwork is what
  // belongs in them. The wide art each source also offers is the wrong shape
  // by a long way: an AniList banner is 1900x400, and cover-fitting a 4.75
  // ratio image into a ~0.46 ratio screen throws away about nine tenths of
  // its width. A poster or cover is nearer 0.7 and loses a third.

  Future<String?> _fetchTvImage() async {
    try {
      final result = await ref.read(tvShowsApiProvider).search();
      for (final show in result.data) {
        final url = show.posterUrl ?? show.backdropUrl;
        if (url != null && url.isNotEmpty) return url;
      }
    } catch (_) {}
    return null;
  }

  Future<String?> _fetchAnimeImage() async {
    try {
      final result = await ref.read(animeApiProvider).search();
      for (final anime in result.media) {
        final url =
            anime.coverImage.extraLarge ??
            anime.coverImage.large ??
            anime.bannerImage;
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
          final url = movie.posterUrl ?? movie.backdropUrl;
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

  Widget _buildFallbackGradient(int index) {
    final colorsList = [
      [
        const Color(0xFF0f172a),
        const Color(0xFF1e1b4b),
        const Color(0xFF000000),
      ], // TV Shows
      [
        const Color(0xFF3f0071),
        const Color(0xFF150050),
        const Color(0xFF000000),
      ], // Anime
      [
        const Color(0xFF450a0a),
        const Color(0xFF1f0505),
        const Color(0xFF000000),
      ], // Movies
    ];
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: colorsList[index],
        ),
      ),
    );
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
    final media = MediaQuery.of(context);
    final decodeWidth = decodeWidthFor(
      media.size.width,
      media.devicePixelRatio,
    );
    // Room for the dots and the action buttons, so the headline is never
    // printed underneath them. The final page carries two more buttons.
    final controlsReserve =
        (_currentPage == 2 ? 268.0 : 148.0) + media.padding.bottom;

    // Black rather than the theme surface. Every control below is drawn in
    // white for legibility over artwork, so on a light theme the default
    // surface produced white-on-white — and because the artwork used to stop
    // at an Expanded boundary, it showed up as a pale bar strapped across the
    // bottom of the screen.
    return Scaffold(
      backgroundColor: Colors.black,
      // One full-bleed stack: the artwork runs the whole height and the
      // controls float over it, so there is no seam between the two.
      body: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(
            child: Stack(
              children: [
                Positioned.fill(
                  child: PageView.builder(
                    controller: _pageController,
                    onPageChanged: (page) =>
                        setState(() => _currentPage = page),
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

                          return Stack(
                            fit: StackFit.expand,
                            children: [
                              // 1.08 rather than 1.15: the scale exists only
                              // to keep the parallax translate below from
                              // exposing an edge, and every extra percent is
                              // more of the frame cropped away.
                              Transform.scale(
                                scale: 1.08,
                                child: Transform.translate(
                                  offset: Offset(pageOffset * 25, 0),
                                  child: imageUrl != null
                                      ? CachedNetworkImage(
                                          imageUrl: sizedImageUrl(
                                            imageUrl,
                                            decodeWidth,
                                          ),
                                          fit: BoxFit.cover,
                                          memCacheWidth: decodeWidth,
                                          fadeInDuration: const Duration(
                                            milliseconds: 150,
                                          ),
                                          errorWidget: (_, _, _) =>
                                              _buildFallbackGradient(index),
                                          placeholder: (_, _) =>
                                              _buildFallbackGradient(index),
                                        )
                                      : _buildFallbackGradient(index),
                                ),
                              ),
                              Positioned.fill(
                                child: IgnorePointer(
                                  child: Container(
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        begin: Alignment.topCenter,
                                        end: Alignment.bottomCenter,
                                        colors: [
                                          Colors.transparent,
                                          Colors.transparent,
                                          Colors.black.withAlpha(30),
                                          Colors.black.withAlpha(120),
                                          Colors.black,
                                        ],
                                        stops: const [
                                          0.0,
                                          0.15,
                                          0.35,
                                          0.55,
                                          0.75,
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                              AnimatedPositioned(
                                duration: const Duration(milliseconds: 250),
                                curve: Curves.easeOutCubic,
                                left: 28,
                                right: 28,
                                bottom: controlsReserve,
                                child: Opacity(
                                  opacity: (1 - pageOffset.abs()).clamp(
                                    0.0,
                                    1.0,
                                  ),
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Transform.translate(
                                        offset: Offset(pageOffset * 80, 0),
                                        child: Text(
                                          title,
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 34,
                                            fontWeight: FontWeight.w800,
                                            color: Colors.white,
                                            height: 1.1,
                                            letterSpacing: -0.5,
                                          ),
                                          textAlign: TextAlign.center,
                                        ),
                                      ),
                                      const SizedBox(height: 16),
                                      Transform.translate(
                                        offset: Offset(pageOffset * 120, 0),
                                        child: Text(
                                          subtitle,
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 15,
                                            color: Colors.white.withAlpha(180),
                                            height: 1.5,
                                          ),
                                          textAlign: TextAlign.center,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          );
                        },
                      );
                    },
                  ),
                ),
                Positioned(
                  top: 0,
                  right: 0,
                  child: SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.only(right: 16, top: 8),
                      child: TextButton(
                        onPressed: () => _markSeenAndGo('/login'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.black.withAlpha(60),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: Colors.white.withAlpha(20),
                            ),
                          ),
                          child: Text(
                            'Skip',
                            style: GoogleFonts.plusJakartaSans(
                              color: Colors.white.withAlpha(220),
                              fontWeight: FontWeight.w600,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 16, 24, 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(3, (index) {
                        final isActive = _currentPage == index;
                        return AnimatedContainer(
                          duration: const Duration(milliseconds: 300),
                          curve: Curves.easeOutCubic,
                          margin: const EdgeInsets.symmetric(horizontal: 5),
                          height: 6,
                          width: isActive ? 32 : 6,
                          decoration: BoxDecoration(
                            color: isActive
                                ? Colors.white
                                : Colors.white.withAlpha(60),
                            borderRadius: BorderRadius.circular(3),
                          ),
                        );
                      }),
                    ),
                    const SizedBox(height: 32),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 250),
                      child: _currentPage == 2
                          ? Column(
                              key: const ValueKey('final-actions'),
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                SizedBox(
                                  width: double.infinity,
                                  height: 56,
                                  child: FilledButton(
                                    onPressed: () => _markSeenAndGo('/login'),
                                    style: FilledButton.styleFrom(
                                      backgroundColor: colors.primary,
                                      foregroundColor: Colors.white,
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
                                            fontSize: 16,
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
                                const SizedBox(height: 12),
                                SizedBox(
                                  width: double.infinity,
                                  height: 56,
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(16),
                                    child: BackdropFilter(
                                      filter: ImageFilter.blur(
                                        sigmaX: 10,
                                        sigmaY: 10,
                                      ),
                                      child: Container(
                                        decoration: BoxDecoration(
                                          color: Colors.white.withAlpha(25),
                                          borderRadius: BorderRadius.circular(
                                            16,
                                          ),
                                          border: Border.all(
                                            color: Colors.white.withAlpha(40),
                                          ),
                                        ),
                                        child: Material(
                                          color: Colors.transparent,
                                          child: InkWell(
                                            onTap: _guestLoading
                                                ? null
                                                : _continueAsGuest,
                                            splashColor: Colors.white.withAlpha(
                                              30,
                                            ),
                                            child: Center(
                                              child: _guestLoading
                                                  ? const SizedBox(
                                                      width: 20,
                                                      height: 20,
                                                      child:
                                                          CircularProgressIndicator(
                                                            strokeWidth: 2,
                                                            color: Colors.white,
                                                          ),
                                                    )
                                                  : Text(
                                                      'Continue as Guest',
                                                      style:
                                                          GoogleFonts.plusJakartaSans(
                                                            fontSize: 15,
                                                            fontWeight:
                                                                FontWeight.w600,
                                                            color: Colors.white
                                                                .withAlpha(200),
                                                          ),
                                                    ),
                                            ),
                                          ),
                                        ),
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
                                      color: Colors.white.withAlpha(200),
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ],
                            )
                          : Column(
                              key: const ValueKey('next-action'),
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                SizedBox(
                                  width: double.infinity,
                                  height: 56,
                                  child: FilledButton(
                                    onPressed: () => _pageController.nextPage(
                                      duration: const Duration(
                                        milliseconds: 350,
                                      ),
                                      curve: Curves.easeOutCubic,
                                    ),
                                    style: FilledButton.styleFrom(
                                      backgroundColor: colors.primary,
                                      foregroundColor: Colors.white,
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(16),
                                      ),
                                    ),
                                    child: Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        Text(
                                          'Next',
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 16,
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
                              ],
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
