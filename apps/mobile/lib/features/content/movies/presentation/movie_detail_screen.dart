import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../shared/presentation/content_carousel.dart';
import '../../shared/presentation/poster_card.dart';
import '../data/movie_models.dart';
import '../data/movies_api.dart';
import '../../../../core/build_flavor.dart';
import '../../../../core/downloads/download_manager.dart';
import '../../../../core/player/embed_playback_resolver.dart';
import '../../../../core/player/embed_webview_screen.dart';
import '../../../../core/player/playback_resolver.dart';
import '../../../../core/player/playback_source.dart';
import '../../../../core/player/unified_video_player_screen.dart';
import '../../../../core/player/watch_progress_api.dart';
import '../../../../core/router/app_back_button.dart';
import '../../../ads/presentation/ad_slot_card.dart';
import '../../shared/presentation/content_detail_scaffold.dart';
import '../../shared/presentation/error_state_view.dart';
import '../../shared/presentation/pressable_scale.dart';
import '../../shared/presentation/status_picker.dart';
import '../../shared/presentation/stream_preparing_overlay.dart';

final movieDetailProvider = FutureProvider.family<Movie, String>((ref, slug) {
  return ref.watch(moviesApiProvider).detail(slug);
});

final similarMoviesProvider = FutureProvider.family<List<MovieSummary>, String>(
  (ref, slug) {
    return ref.watch(moviesApiProvider).similar(slug);
  },
);

class MovieDetailScreen extends ConsumerStatefulWidget {
  final String slug;

  const MovieDetailScreen({super.key, required this.slug});

  @override
  ConsumerState<MovieDetailScreen> createState() => _MovieDetailScreenState();
}

class _MovieDetailScreenState extends ConsumerState<MovieDetailScreen> {
  ({int progress, int duration, String? status})? _savedProgress;
  bool _hasCheckedProgress = false;

  Future<void> _fetchProgress(String movieId) async {
    final api = ref.read(watchProgressApiProvider);
    final result = await api.getMovieProgress(movieId);
    if (mounted) setState(() => _savedProgress = result);
  }

  Future<void> _playMovie(Movie movie, {required bool restoreProgress}) async {
    if (!mounted) return;
    final source = resolveMoviePlayback(movie);

    if (source is! UnresolvedPlaybackSource) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => UnifiedVideoPlayerScreen(
            source: source,
            title: movie.title,
            progressTarget: MovieProgressTarget(movie.id),
            restoreProgress: restoreProgress,
          ),
        ),
      );
      return;
    }

    final slug = movie.slug;
    if (slug == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No playable source available for this title.'),
        ),
      );
      return;
    }

    if (!mounted) return;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => StreamPreparingOverlay(
        title: movie.title,
        imageUrl: movie.backdropUrl ?? movie.posterUrl,
      ),
    );
    try {
      final moviesApi = ref.read(moviesApiProvider);
      final providers = await moviesApi.embeds(slug);
      final result = await resolveEmbedOnlyPlayback(
        providerUrls: providers.map((p) => p.url).toList(),
        backendExtract: () => moviesApi.extractStream(slug),
      );

      if (!mounted) return;
      Navigator.of(context).pop();

      if (!mounted) return;
      switch (result) {
        case ResolvedDirectSource(:final source):
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => UnifiedVideoPlayerScreen(
                source: source,
                title: movie.title,
                progressTarget: MovieProgressTarget(movie.id),
                restoreProgress: restoreProgress,
              ),
            ),
          );
        case EmbedWebViewFallback(:final url):
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => EmbedWebViewScreen(
                sources: [EmbedSource(url: url, label: 'Server 1')],
                title: movie.title,
              ),
            ),
          );
        case EmbedResolutionFailed(:final reason):
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('No playable source found: $reason')),
          );
      }
    } catch (e) {
      if (!mounted) return;
      Navigator.of(context).pop();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Failed to load movie: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final movieAsync = ref.watch(movieDetailProvider(widget.slug));

    return movieAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (error, _) => Scaffold(
        body: ErrorStateView(
          onRetry: () => ref.invalidate(movieDetailProvider(widget.slug)),
        ),
      ),
      data: (movie) {
        if (!_hasCheckedProgress) {
          _hasCheckedProgress = true;
          Future.microtask(() => _fetchProgress(movie.id));
        }
        final hasResume =
            _savedProgress != null &&
            _savedProgress!.progress > 30 &&
            _savedProgress!.duration > 0 &&
            _savedProgress!.progress < _savedProgress!.duration * 0.95;

        return Scaffold(
          body: ContentDetailScaffold(
            heroImageUrl: movie.backdropUrl ?? movie.posterUrl ?? '',
            posterUrl: movie.posterUrl ?? movie.backdropUrl ?? '',
            heroTag: 'movie-poster-${movie.id}',
            titleWidget: Text(
              movie.title,
              style: theme.textTheme.titleLarge,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            metadataRow: Row(
              children: [
                Text('${movie.year}'),
                if (movie.durationMinutes != null) ...[
                  const SizedBox(width: 16),
                  const Icon(Icons.access_time, size: 16),
                  const SizedBox(width: 4),
                  Text('${movie.durationMinutes} min'),
                ],
                if (movie.rating != null) ...[
                  const SizedBox(width: 16),
                  const Icon(Icons.star, size: 16, color: Colors.amber),
                  const SizedBox(width: 4),
                  Text(movie.rating!.toStringAsFixed(1)),
                ],
              ],
            ),
            genres: movie.genre.map((g) => g.wireValue).toList(),
            description: movie.overview ?? movie.description,
            description2: movie.cast.isNotEmpty ? 'Cast' : null,
            extraSections: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (movie.cast.isNotEmpty) ...[
                  Text('Cast', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 100,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: movie.cast.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 12),
                      itemBuilder: (context, index) {
                        final castMember = movie.cast[index];
                        return Column(
                          children: [
                            CircleAvatar(
                              radius: 28,
                              backgroundImage: castMember.photoUrl != null
                                  ? NetworkImage(castMember.photoUrl!)
                                  : null,
                              child: castMember.photoUrl == null
                                  ? const Icon(Icons.person)
                                  : null,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              castMember.name,
                              style: theme.textTheme.bodySmall,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (castMember.character != null)
                              Text(
                                castMember.character!,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.onSurface.withAlpha(153),
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                          ],
                        );
                      },
                    ),
                  ),
                ],
                const SizedBox(height: 24),
              ],
            ),
            actionButtonsRow: _MovieActionButtons(
              movie: movie,
              hasResume: hasResume,
              savedProgress: _savedProgress,
              onPlay: (restore) => _playMovie(movie, restoreProgress: restore),
            ),
            episodeSection: Column(
              children: [
                if (!isTvBuild) const AdBannerCard(placement: 'DETAIL'),
                _SimilarMoviesSection(slug: widget.slug),
              ],
            ),
            sliverFooter: [
              SliverAppBar(
                pinned: true,
                leading: const AppBackButton(),
                automaticallyImplyLeading: false,
                backgroundColor: Colors.transparent,
                elevation: 0,
              ),
            ],
          ),
        );
      },
    );
  }
}

class _MovieActionButtons extends ConsumerWidget {
  final Movie movie;
  final bool hasResume;
  final ({int progress, int duration, String? status})? savedProgress;
  final void Function(bool restoreProgress) onPlay;

  const _MovieActionButtons({
    required this.movie,
    required this.hasResume,
    this.savedProgress,
    required this.onPlay,
  });

  String _formatDuration(int totalSeconds) {
    final d = Duration(seconds: totalSeconds);
    final h = d.inHours;
    final m = d.inMinutes.remainder(60);
    final s = d.inSeconds.remainder(60);
    if (h > 0) {
      return '$h:${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
    }
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        Center(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.playlist_add),
                tooltip: 'Add to list',
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
                        content: Text('Marked as ${watchStatusLabel(selected)}'),
                      ),
                    );
                  }
                },
              ),
              const SizedBox(width: 8),
              if (hasResume)
                PressableScale(
                  pressedColor: Theme.of(context).colorScheme.primary.withAlpha(40),
                  child: ElevatedButton.icon(
                    onPressed: () => onPlay(true),
                    icon: const Icon(Icons.play_arrow),
                    label: Text('Resume · ${_formatDuration(savedProgress!.progress)}'),
                  ),
                )
              else
                PressableScale(
                  pressedColor: Theme.of(context).colorScheme.primary.withAlpha(40),
                  child: ElevatedButton.icon(
                    onPressed: () => onPlay(true),
                    icon: const Icon(Icons.play_arrow),
                    label: const Text('Play'),
                  ),
                ),
              if (hasResume) ...[
                const SizedBox(width: 8),
                TextButton(
                  onPressed: () => onPlay(false),
                  child: const Text('Start over'),
                ),
              ],
              if (!isTvBuild &&
                  movie.fileUrls.values.any(
                    (v) => v.toLowerCase().contains('.mp4'),
                  ))
                const SizedBox(width: 12),
              if (!isTvBuild &&
                  movie.fileUrls.values.any(
                    (v) => v.toLowerCase().contains('.mp4'),
                  ))
                PressableScale(
                  pressedColor: Theme.of(context).colorScheme.primary.withAlpha(40),
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      final mp4Entry = movie.fileUrls.entries.firstWhere(
                        (e) => e.value.toLowerCase().contains('.mp4'),
                      );
                      await DownloadManager.instance.startDownload(
                        movieId: movie.id,
                        title: movie.title,
                        posterUrl: movie.posterUrl ?? movie.thumbnailUrl,
                        quality: mp4Entry.key,
                        fileUrl: mp4Entry.value,
                      );
                      ref.read(moviesApiProvider).saveOffline(
                        movie.id,
                        mp4Entry.key,
                        null,
                      );
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Download started')),
                        );
                      }
                    },
                    icon: const Icon(Icons.download_outlined),
                    label: const Text('Download'),
                  ),
                ),
            ],
          ),
        ),
        if (hasResume)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: LinearProgressIndicator(
              value: savedProgress!.progress / savedProgress!.duration,
              minHeight: 3,
            ),
          ),
      ],
    );
  }
}

class _SimilarMoviesSection extends ConsumerWidget {
  final String slug;

  const _SimilarMoviesSection({required this.slug});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final similarAsync = ref.watch(similarMoviesProvider(slug));

    return similarAsync.when(
      loading: () => const Center(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: CircularProgressIndicator(),
        ),
      ),
      error: (_, _) => const SizedBox.shrink(),
      data: (movies) {
        if (movies.isEmpty) return const SizedBox.shrink();
        return ContentCarousel(
          title: 'Similar Movies',
          children: movies.map((m) {
            return PosterCard(
              imageUrl: m.youtubeId != null
                  ? (m.backdropUrl ??
                        m.thumbnailUrl ??
                        m.posterUrl ??
                        m.coverUrl ??
                        '')
                  : (m.posterUrl ?? m.thumbnailUrl ?? m.coverUrl ?? ''),
              isRectangular: m.youtubeId != null,
              title: m.title,
              onTap: () => context.push('/movies/${m.slug ?? m.id}'),
            );
          }).toList(),
        );
      },
    );
  }
}
