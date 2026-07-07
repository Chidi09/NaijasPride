import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

import '../../content/movies/data/movie_models.dart';
import '../../content/movies/data/movies_api.dart';
import '../../../core/player/youtube_resolver.dart';

final RegExp _youtubeIdPattern =
    RegExp(r'(?:v=|youtu\.be/)([a-zA-Z0-9_-]{11})');

String? _extractYoutubeId(String url) {
  final match = _youtubeIdPattern.firstMatch(url);
  return match?.group(1);
}

class HeroBanner extends ConsumerStatefulWidget {
  final MovieSummary movie;

  const HeroBanner({super.key, required this.movie});

  @override
  ConsumerState<HeroBanner> createState() => _HeroBannerState();
}

class _HeroBannerState extends ConsumerState<HeroBanner> {
  Timer? _idleTimer;
  Player? _player;
  VideoController? _controller;
  bool _showVideo = false;
  bool _isFocused = false;

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
      // A prior in-flight _startTrailer call may have already assigned a
      // player if focus was lost and regained before this one resolved —
      // dispose it before overwriting to avoid leaking the native player.
      _player?.dispose();
      setState(() {
        _player = player;
        _controller = VideoController(player);
        _showVideo = true;
      });
    } catch (_) {
      // Trailer preview is a non-critical enhancement; fail silently.
    }
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
    _player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Focus(
      onFocusChange: _onFocusChange,
      child: GestureDetector(
        onTap: () =>
            context.go('/movies/${widget.movie.slug ?? widget.movie.id}'),
        child: SizedBox(
          height: 400,
          width: double.infinity,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.network(
                widget.movie.backdropUrl ?? widget.movie.posterUrl ?? '',
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) =>
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
                        Colors.black.withAlpha(200),
                      ],
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        widget.movie.title,
                        style: theme.textTheme.headlineSmall
                            ?.copyWith(color: Colors.white),
                      ),
                      const SizedBox(height: 12),
                      ElevatedButton.icon(
                        onPressed: () => context.go(
                            '/movies/${widget.movie.slug ?? widget.movie.id}'),
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
                    child: const Icon(Icons.volume_off, color: Colors.white70),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
