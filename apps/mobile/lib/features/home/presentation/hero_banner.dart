import 'dart:async';
import 'dart:ui';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

import '../../content/movies/data/movie_models.dart';
import '../../content/movies/data/movies_api.dart';
import '../../../core/player/youtube_resolver.dart';
import '../../../core/player/watch_progress_api.dart';
import '../../content/shared/presentation/status_picker.dart';
import '../../../core/build_flavor.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/image_sizing.dart';

final RegExp _youtubeIdPattern = RegExp(
  r'(?:v=|youtu\.be/)([a-zA-Z0-9_-]{11})',
);

String? _extractYoutubeId(String url) {
  final match = _youtubeIdPattern.firstMatch(url);
  return match?.group(1);
}

class HeroBanner extends ConsumerStatefulWidget {
  final MovieSummary movie;
  final List<MovieSummary>? featuredMovies;

  const HeroBanner({super.key, required this.movie, this.featuredMovies});

  @override
  ConsumerState<HeroBanner> createState() => _HeroBannerState();
}

class _HeroBannerState extends ConsumerState<HeroBanner> {
  Timer? _idleTimer;
  Timer? _rotationTimer;
  Player? _player;
  VideoController? _controller;
  bool _showVideo = false;
  bool _isFocused = false;
  int _currentIndex = 0;

  MovieSummary get _effectiveMovie => isTvBuild
      ? widget.movie
      : (widget.featuredMovies ?? [widget.movie])[_currentIndex];

  @override
  void initState() {
    super.initState();
    if (!isTvBuild &&
        widget.featuredMovies != null &&
        widget.featuredMovies!.length > 1) {
      _rotationTimer = Timer.periodic(const Duration(seconds: 6), (_) {
        if (mounted) {
          setState(() {
            _currentIndex = (_currentIndex + 1) % widget.featuredMovies!.length;
          });
        }
      });
    }
  }

  void _onFocusChange(bool focused) {
    setState(() => _isFocused = focused);
    _idleTimer?.cancel();
    if (focused) {
      _idleTimer = Timer(const Duration(milliseconds: 1500), _startTrailer);
    } else {
      _stopTrailer();
    }
  }

  Future<void> _startTrailer() async {
    try {
      final movie = await ref
          .read(moviesApiProvider)
          .detail(widget.movie.slug ?? widget.movie.id);
      final trailerUrl = movie.trailerUrl;
      if (trailerUrl == null) return;
      final youtubeId = _extractYoutubeId(trailerUrl);
      if (youtubeId == null) return;
      final streamUrl = await resolveYoutubeStreamUrl(youtubeId);
      if (!mounted || !_isFocused) return;

      final player = Player();
      await player.open(Media(streamUrl), play: true);
      await player.setVolume(0);
      player.stream.completed.listen((completed) {
        if (completed) player.seek(Duration.zero);
      });

      if (!mounted || !_isFocused) {
        player.dispose();
        return;
      }
      _player?.dispose();
      setState(() {
        _player = player;
        _controller = VideoController(player);
        _showVideo = true;
      });
    } catch (_) {}
  }

  void _stopTrailer() {
    setState(() => _showVideo = false);
    final player = _player;
    _player = null;
    _controller = null;
    player?.dispose();
  }

  @override
  void dispose() {
    _idleTimer?.cancel();
    _rotationTimer?.cancel();
    _player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final movie = _effectiveMovie;

    if (isTvBuild) {
      return Focus(
        onFocusChange: _onFocusChange,
        child: GestureDetector(
          onTap: () => context.push('/movies/${movie.slug ?? movie.id}'),
          child: SizedBox(
            height: 400,
            width: double.infinity,
            child: Stack(
              fit: StackFit.expand,
              children: [
                CachedNetworkImage(
                  imageUrl: movie.backdropUrl ?? movie.posterUrl ?? '',
                  fit: BoxFit.cover,
                  memCacheWidth: 1080,
                  errorWidget: (_, _, _) =>
                      Container(color: theme.colorScheme.surface),
                  placeholder: (_, _) =>
                      Container(color: theme.colorScheme.surface),
                ),
                AnimatedOpacity(
                  opacity: _showVideo ? 1.0 : 0.0,
                  duration: Duration(milliseconds: _showVideo ? 800 : 300),
                  curve: _showVideo ? Curves.easeInOutCubic : Curves.easeOut,
                  child: _controller != null
                      ? Video(
                          controller: _controller!,
                          controls: NoVideoControls,
                        )
                      : const SizedBox.shrink(),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.transparent,
                          Colors.black.withAlpha(180),
                          Colors.black,
                        ],
                        stops: const [0.0, 0.4, 0.7, 1.0],
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          movie.title,
                          style: theme.textTheme.displayMedium?.copyWith(
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                            letterSpacing: -1.0,
                            shadows: const [
                              Shadow(color: Colors.black, blurRadius: 10),
                            ],
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 12),
                        ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.white,
                            foregroundColor: Colors.black,
                            shape: const StadiumBorder(),
                          ),
                          onPressed: () =>
                              context.push('/movies/${movie.slug ?? movie.id}'),
                          icon: const Icon(Icons.play_arrow),
                          label: const Text('View'),
                        ),
                      ],
                    ),
                  ),
                ),
                if (_showVideo)
                  Positioned(
                    top: 16,
                    right: 16,
                    child: AnimatedOpacity(
                      opacity: _showVideo ? 1.0 : 0.0,
                      duration: const Duration(milliseconds: 400),
                      child: const Icon(
                        Icons.volume_off,
                        color: Colors.white70,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
    }

    final movies = widget.featuredMovies ?? [widget.movie];
    final media = MediaQuery.of(context);

    // Sized from the artwork rather than from the viewport. At 55% of screen
    // height this box was around 0.85:1 on a tall phone, and cover-fitting a
    // 16:9 backdrop into that threw away nearly half the frame — the crop is
    // what made the hero look off, not the height. 16:9 with a floor keeps
    // the whole backdrop visible, and the cap stops it dominating the page on
    // a tablet.
    final backdrop = movie.backdropUrl;
    final poster = movie.posterUrl;
    final imageUrl = backdrop ?? poster ?? '';
    final isPortraitArt = backdrop == null && poster != null;

    final width = media.size.width;
    final heroHeight = (width * 9 / 16).clamp(200.0, media.size.height * 0.5);
    final decodeWidth = decodeWidthFor(width, media.devicePixelRatio);

    return SizedBox(
      height: heroHeight,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 800),
            child: SizedBox.expand(
              key: ValueKey(_currentIndex),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Only reached when a title has no backdrop. Cropping a 2:3
                  // poster into a 16:9 box loses most of it, so the poster is
                  // shown whole over a blurred copy of itself instead of
                  // being chopped.
                  if (isPortraitArt)
                    ImageFiltered(
                      imageFilter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                      child: CachedNetworkImage(
                        imageUrl: sizedImageUrl(imageUrl, 300),
                        fit: BoxFit.cover,
                        memCacheWidth: 300,
                        errorWidget: (_, _, _) => const SizedBox.shrink(),
                        placeholder: (_, _) => const SizedBox.shrink(),
                      ),
                    ),
                  CachedNetworkImage(
                    imageUrl: sizedImageUrl(imageUrl, decodeWidth),
                    fit: isPortraitArt ? BoxFit.contain : BoxFit.cover,
                    memCacheWidth: decodeWidth,
                    errorWidget: (_, _, _) =>
                        Container(color: theme.colorScheme.surface),
                    placeholder: (_, _) =>
                        Container(color: theme.colorScheme.surface),
                  ),
                ],
              ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.transparent,
                    theme.scaffoldBackgroundColor.withAlpha(180),
                    theme.scaffoldBackgroundColor,
                  ],
                  stops: const [0.0, 0.4, 0.7, 1.0],
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    movie.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.displayMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                      letterSpacing: -1.0,
                      shadows: const [
                        Shadow(color: Colors.black, blurRadius: 10),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (movie.rating != null && movie.rating! > 0)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.star_rounded,
                            size: 14,
                            color: Color(0xFFD6B87A),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            movie.rating!.toStringAsFixed(1),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  Row(
                    children: [
                      FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: Colors.black,
                          shape: const StadiumBorder(),
                        ),
                        onPressed: () =>
                            context.push('/movies/${movie.slug ?? movie.id}'),
                        icon: const Icon(Icons.play_arrow),
                        label: const Text('Play'),
                      ),
                      const SizedBox(width: 12),
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          backgroundColor: Colors.white.withAlpha(40),
                          foregroundColor: Colors.white,
                          side: BorderSide(color: Colors.white.withAlpha(80)),
                          shape: const StadiumBorder(),
                        ),
                        onPressed: () async {
                          final api = ref.read(watchProgressApiProvider);
                          final existing = await api.getMovieProgress(movie.id);
                          if (!context.mounted) return;
                          final selected = await showStatusPicker(
                            context,
                            current: existing?.status,
                          );
                          if (selected == null) return;
                          await api.saveMovieProgress(
                            movie.id,
                            existing?.progress ?? 0,
                            existing?.duration ?? 0,
                            status: selected,
                          );
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  'Added to ${watchStatusLabel(selected)}',
                                ),
                              ),
                            );
                          }
                        },
                        icon: const Icon(Icons.add),
                        label: const Text('My List'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (movies.length > 1)
            Positioned(
              bottom: 16,
              right: 16,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: List.generate(movies.length, (i) {
                  return Container(
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i == _currentIndex
                          ? (theme.brightness == Brightness.dark
                                ? AppColors.dark.accent
                                : AppColors.light.accent)
                          : Colors.white.withAlpha(100),
                    ),
                  );
                }),
              ),
            ),
        ],
      ),
    );
  }
}
