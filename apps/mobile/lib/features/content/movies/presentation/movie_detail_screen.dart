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
import '../../shared/presentation/error_state_view.dart';
import '../../shared/presentation/pressable_scale.dart';
import '../../shared/presentation/status_picker.dart';

final movieDetailProvider =
    FutureProvider.family<Movie, String>((ref, slug) {
  return ref.watch(moviesApiProvider).detail(slug);
});

final similarMoviesProvider =
    FutureProvider.family<List<MovieSummary>, String>((ref, slug) {
  return ref.watch(moviesApiProvider).similar(slug);
});

class MovieDetailScreen extends ConsumerWidget {
  final String slug;

  const MovieDetailScreen({super.key, required this.slug});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final movieAsync = ref.watch(movieDetailProvider(slug));

    return movieAsync.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (error, _) => Scaffold(
        body: ErrorStateView(
          onRetry: () => ref.invalidate(movieDetailProvider(slug)),
        ),
      ),
      data: (movie) => Scaffold(
        body: CustomScrollView(
          slivers: [
            SliverAppBar(
              expandedHeight: 220,
              pinned: true,
              flexibleSpace: FlexibleSpaceBar(
                background: Hero(
                  tag: 'movie-poster-${movie.id}',
                  child: Image.network(
                    movie.backdropUrl ?? movie.posterUrl ?? '',
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) => Container(
                      color: theme.colorScheme.surface,
                    ),
                  ),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      movie.title,
                      style: theme.textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Row(
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
                    const SizedBox(height: 12),
                    if (movie.genre.isNotEmpty)
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        children: movie.genre.map((g) {
                          return Chip(
                            label: Text(g.wireValue),
                            materialTapTargetSize:
                                MaterialTapTargetSize.shrinkWrap,
                            visualDensity: VisualDensity.compact,
                          );
                        }).toList(),
                      ),
                    const SizedBox(height: 16),
                    if ((movie.overview ?? movie.description) != null)
                      Text(
                        movie.overview ?? movie.description ?? '',
                        style: theme.textTheme.bodyLarge,
                      ),
                    if (movie.cast.isNotEmpty) ...[
                      const SizedBox(height: 24),
                      Text('Cast', style: theme.textTheme.titleMedium),
                      const SizedBox(height: 8),
                      SizedBox(
                        height: 100,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: movie.cast.length,
                          separatorBuilder: (_, _) =>
                              const SizedBox(width: 12),
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
                                      color: theme.colorScheme.onSurface
                                          .withAlpha(153),
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
                              final selected = await showStatusPicker(context, current: existing?.status);
                              if (selected == null) return;
                              await api.saveMovieProgress(
                                movie.id,
                                existing?.progress ?? 0,
                                existing?.duration ?? 0,
                                status: selected,
                              );
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('Marked as ${watchStatusLabel(selected)}')),
                                );
                              }
                            },
                          ),
                          const SizedBox(width: 8),
                          PressableScale(
                            pressedColor: Theme.of(context).colorScheme.primary.withAlpha(40),
                            child: ElevatedButton.icon(
                              onPressed: () async {
                                final source = resolveMoviePlayback(movie);

                                if (source is! UnresolvedPlaybackSource) {
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => UnifiedVideoPlayerScreen(
                                        source: source,
                                        title: movie.title,
                                        progressTarget: MovieProgressTarget(movie.id),
                                      ),
                                    ),
                                  );
                                  return;
                                }

                                final slug = movie.slug;
                                if (slug == null) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                          'No playable source available for this title.'),
                                    ),
                                  );
                                  return;
                                }

                                showDialog(
                                  context: context,
                                  barrierDismissible: false,
                                  builder: (_) =>
                                      const Center(child: CircularProgressIndicator()),
                                );
                                try {
                                  final moviesApi = ref.read(moviesApiProvider);
                                  final providers = await moviesApi.embeds(slug);
                                  final result = await resolveEmbedOnlyPlayback(
                                    providerUrls:
                                        providers.map((p) => p.url).toList(),
                                    backendExtract: () =>
                                        moviesApi.extractStream(slug),
                                  );

                                  if (!context.mounted) return;
                                  Navigator.of(context).pop();

                                  switch (result) {
                                    case ResolvedDirectSource(:final source):
                                      Navigator.of(context).push(
                                        MaterialPageRoute(
                                          builder: (_) => UnifiedVideoPlayerScreen(
                                            source: source,
                                            title: movie.title,
                                            progressTarget:
                                                MovieProgressTarget(movie.id),
                                          ),
                                        ),
                                      );
                                    case EmbedWebViewFallback(:final url):
                                      Navigator.of(context).push(
                                        MaterialPageRoute(
                                          builder: (_) => EmbedWebViewScreen(
                                              embedUrl: url, title: movie.title),
                                        ),
                                      );
                                    case EmbedResolutionFailed(:final reason):
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(
                                          content: Text(
                                              'No playable source found: $reason'),
                                        ),
                                      );
                                  }
                                } catch (e) {
                                  if (!context.mounted) return;
                                  Navigator.of(context).pop();
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text('Failed to load movie: $e'),
                                    ),
                                  );
                                }
                              },
                              icon: const Icon(Icons.play_arrow),
                              label: const Text('Play'),
                            ),
                          ),
                          if (!isTvBuild && movie.fileUrls.values.any((v) => v.toLowerCase().contains('.mp4')))
                            const SizedBox(width: 12),
                          if (!isTvBuild && movie.fileUrls.values.any((v) => v.toLowerCase().contains('.mp4')))
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
                                  ref.read(moviesApiProvider).saveOffline(movie.id, mp4Entry.key, null);
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
                    const SizedBox(height: 16),
                    _SimilarMoviesSection(slug: slug),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
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
              onTap: () => context.go('/movies/${m.slug ?? m.id}'),
            );
          }).toList(),
        );
      },
    );
  }
}
