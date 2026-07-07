import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/anime_api.dart';
import '../data/anime_models.dart';
import '../../../../core/player/playback_resolver.dart';
import '../../../../core/player/playback_source.dart';
import '../../../../core/player/unified_video_player_screen.dart';
import '../../../../core/player/watch_progress_api.dart';
import '../../../../core/build_flavor.dart';
import '../../../ads/presentation/ad_slot_card.dart';
import '../../shared/presentation/error_state_view.dart';
import '../../shared/presentation/pressable_scale.dart';
import '../../shared/presentation/status_picker.dart';
import '../../shared/presentation/stream_preparing_overlay.dart';
import '../../../../core/player/embed_playback_resolver.dart';
import '../../../../core/player/embed_webview_screen.dart';

final animeDetailProvider = FutureProvider.family<AnimeDetail, int>((ref, id) {
  return ref.watch(animeApiProvider).detail(id);
});

final animeEpisodesProvider = FutureProvider.family<List<AnimeEpisode>, int>((
  ref,
  id,
) {
  return ref.watch(animeApiProvider).episodes(id);
});

String _stripHtml(String html) {
  return html
      .replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'<[^>]*>'), '');
}

class AnimeDetailScreen extends ConsumerStatefulWidget {
  final int id;

  const AnimeDetailScreen({super.key, required this.id});

  @override
  ConsumerState<AnimeDetailScreen> createState() => _AnimeDetailScreenState();
}

class _AnimeDetailScreenState extends ConsumerState<AnimeDetailScreen> {
  Map<int, ({int progress, int duration, String? status})> _episodeProgress =
      {};
  bool _hasFetchedProgress = false;

  Future<void> _fetchProgress(int anilistId) async {
    final api = ref.read(watchProgressApiProvider);
    final result = await api.getAnimeProgress(anilistId);
    if (mounted) setState(() => _episodeProgress = result);
  }

  Future<void> _onEpisodeTap(
    AnimeEpisode episode,
    List<AnimeEpisode> episodes,
  ) async {
    final index = episodes.indexWhere((e) => e.number == episode.number);
    final nextEpisode = index >= 0 && index + 1 < episodes.length
        ? episodes[index + 1]
        : null;

    void pushPlayer(PlaybackSource src, {AnimeSkipTimes? skipTimes}) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => UnifiedVideoPlayerScreen(
            source: src,
            title: episode.title ?? 'Episode ${episode.number}',
            progressTarget: AnimeProgressTarget(
              anilistId: widget.id,
              episodeNumber: episode.number,
              title: episode.title ?? 'Episode ${episode.number}',
              imageUrl: episode.image,
            ),
            nextEpisodeLabel: nextEpisode != null
                ? 'Episode ${nextEpisode.number}'
                : null,
            onNextEpisode: nextEpisode != null
                ? () {
                    Navigator.of(context).pop();
                    _onEpisodeTap(nextEpisode, episodes);
                  }
                : null,
            skipTimes: skipTimes,
          ),
        ),
      );
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => StreamPreparingOverlay(
        title: episode.title ?? 'Episode ${episode.number}',
        imageUrl: episode.image,
      ),
    );
    try {
      final result = await ref
          .read(animeApiProvider)
          .watch(widget.id, episode.number);
      final skipTimes = await ref
          .read(animeApiProvider)
          .skipTimes(widget.id, episode.number);
      final source = resolveAnimeEpisodePlayback(result.sources);

      if (source is UnresolvedPlaybackSource) {
        final embedSources = result.sources.where((s) => s.isEmbed).toList();
        if (embedSources.isEmpty) {
          if (!mounted) return;
          Navigator.of(context).pop();
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(source.reason)));
          return;
        }

        final resolved = await resolveEmbedOnlyPlayback(
          providerUrls: embedSources.map((s) => s.url).toList(),
          backendExtract: () =>
              ref.read(animeApiProvider).extractStream(embedSources.first.url),
        );

        if (!mounted) return;
        Navigator.of(context).pop();

        switch (resolved) {
          case ResolvedDirectSource(:final source):
            pushPlayer(source, skipTimes: skipTimes);
          case EmbedWebViewFallback(:final url):
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => EmbedWebViewScreen(
                  embedUrl: url,
                  title: episode.title ?? 'Episode ${episode.number}',
                ),
              ),
            );
          case EmbedResolutionFailed(:final reason):
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('No playable source found: $reason')),
            );
        }
        return;
      }

      if (!mounted) return;
      Navigator.of(context).pop();
      pushPlayer(source, skipTimes: skipTimes);
    } catch (e) {
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Failed to load episode: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final detailAsync = ref.watch(animeDetailProvider(widget.id));
    final episodesAsync = ref.watch(animeEpisodesProvider(widget.id));

    return detailAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (error, _) => Scaffold(
        body: ErrorStateView(
          onRetry: () => ref.invalidate(animeDetailProvider(widget.id)),
        ),
      ),
      data: (detail) {
        if (!_hasFetchedProgress) {
          _hasFetchedProgress = true;
          Future.microtask(() => _fetchProgress(widget.id));
        }
        final title =
            detail.title.english ??
            detail.title.romaji ??
            detail.title.native ??
            'Untitled';

        return Scaffold(
          body: CustomScrollView(
            slivers: [
              SliverAppBar(
                expandedHeight: MediaQuery.of(context).size.height * 0.42,
                pinned: true,
                flexibleSpace: FlexibleSpaceBar(
                  background: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.network(
                        detail.bannerImage ??
                            detail.coverImage.extraLarge ??
                            detail.coverImage.large ??
                            '',
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) =>
                            Container(color: theme.colorScheme.surface),
                      ),
                      Positioned.fill(
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                Colors.transparent,
                                theme.scaffoldBackgroundColor,
                              ],
                              stops: const [0.6, 1.0],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Column(
                  children: [
                    Transform.translate(
                      offset: const Offset(0, -48),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Container(
                              width: 110,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(8),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withAlpha(60),
                                    blurRadius: 8,
                                    offset: const Offset(0, 4),
                                  ),
                                ],
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: AspectRatio(
                                  aspectRatio: 2 / 3,
                                  child: Hero(
                                    tag: 'anime-poster-${detail.id}',
                                    child: Image.network(
                                      detail.coverImage.extraLarge ??
                                          detail.coverImage.large ??
                                          detail.bannerImage ??
                                          '',
                                      fit: BoxFit.cover,
                                      errorBuilder:
                                          (context, error, stackTrace) =>
                                              Container(
                                                color:
                                                    theme.colorScheme.surface,
                                              ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    title,
                                    style: theme.textTheme.titleLarge,
                                    maxLines: 3,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      if (detail.seasonYear != null)
                                        Text('${detail.seasonYear}'),
                                      if (detail.format != null) ...[
                                        const SizedBox(width: 16),
                                        Text(detail.format!),
                                      ],
                                      if (detail.episodes != null) ...[
                                        const SizedBox(width: 16),
                                        Text('${detail.episodes} eps'),
                                      ],
                                      if (detail.averageScore != null) ...[
                                        const SizedBox(width: 16),
                                        Text('${detail.averageScore}%'),
                                      ],
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    Transform.translate(
                      offset: const Offset(0, -48),
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (detail.genres.isNotEmpty)
                              Wrap(
                                spacing: 8,
                                runSpacing: 4,
                                children: detail.genres.map((g) {
                                  return Chip(
                                    label: Text(g),
                                    materialTapTargetSize:
                                        MaterialTapTargetSize.shrinkWrap,
                                    visualDensity: VisualDensity.compact,
                                  );
                                }).toList(),
                              ),
                            const SizedBox(height: 16),
                            if (detail.description != null)
                              Text(
                                _stripHtml(detail.description!),
                                style: theme.textTheme.bodyLarge,
                              ),
                            const SizedBox(height: 24),
                            if (!isTvBuild)
                              const AdBannerCard(placement: 'DETAIL'),
                            episodesAsync.when(
                              loading: () => const Center(
                                child: SizedBox(
                                  height: 24,
                                  width: 24,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                ),
                              ),
                              error: (_, _) => const SizedBox.shrink(),
                              data: (episodes) {
                                if (episodes.isEmpty) {
                                  return const SizedBox.shrink();
                                }
                                return Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        Text(
                                          'Episodes',
                                          style: theme.textTheme.titleMedium,
                                        ),
                                        PressableScale(
                                          pressedColor: Theme.of(
                                            context,
                                          ).colorScheme.primary.withAlpha(40),
                                          child: IconButton(
                                            icon: const Icon(
                                              Icons.playlist_add,
                                            ),
                                            tooltip: 'Add to list',
                                            onPressed: () async {
                                              final ep = episodes.first;
                                              final api = ref.read(
                                                watchProgressApiProvider,
                                              );
                                              final existing = await api
                                                  .getAnimeEpisodeProgress(
                                                    widget.id,
                                                    ep.number,
                                                  );
                                              if (!context.mounted) return;
                                              final selected =
                                                  await showStatusPicker(
                                                    context,
                                                    current: existing?.status,
                                                  );
                                              if (selected == null) return;
                                              await api.saveAnimeProgress(
                                                anilistId: widget.id,
                                                episodeNumber: ep.number,
                                                title:
                                                    ep.title ??
                                                    'Episode ${ep.number}',
                                                imageUrl: ep.image,
                                                progressSeconds:
                                                    existing?.progress ?? 0,
                                                durationSeconds:
                                                    existing?.duration ?? 0,
                                                status: selected,
                                              );
                                              if (context.mounted) {
                                                ScaffoldMessenger.of(
                                                  context,
                                                ).showSnackBar(
                                                  SnackBar(
                                                    content: Text(
                                                      'Marked as ${watchStatusLabel(selected)}',
                                                    ),
                                                  ),
                                                );
                                              }
                                            },
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 8),
                                    ...episodes.map((ep) {
                                      final epProgress =
                                          _episodeProgress[ep.number];
                                      double? progressFraction;
                                      bool watched = false;
                                      if (epProgress != null) {
                                        final pct = epProgress.duration > 0
                                            ? epProgress.progress /
                                                  epProgress.duration
                                            : 0.0;
                                        if (pct >= 0.95 ||
                                            epProgress.status == 'COMPLETED') {
                                          watched = true;
                                        } else if (pct > 0.05) {
                                          progressFraction = pct;
                                        }
                                      }
                                      return _EpisodeTile(
                                        episode: ep,
                                        onTap: () =>
                                            _onEpisodeTap(ep, episodes),
                                        progressFraction: progressFraction,
                                        watched: watched,
                                      );
                                    }),
                                    const SizedBox(height: 24),
                                  ],
                                );
                              },
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
        );
      },
    );
  }
}

class _EpisodeTile extends StatelessWidget {
  final AnimeEpisode episode;
  final VoidCallback? onTap;
  final double? progressFraction;
  final bool watched;

  const _EpisodeTile({
    required this.episode,
    this.onTap,
    this.progressFraction,
    this.watched = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: SizedBox(
        width: 80,
        height: 56,
        child: Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: Image.network(
                episode.image ?? '',
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Container(
                  color: theme.colorScheme.surface,
                  child: Center(
                    child: Icon(
                      Icons.movie_outlined,
                      color: theme.colorScheme.onSurface.withAlpha(100),
                    ),
                  ),
                ),
              ),
            ),
            if (progressFraction != null &&
                progressFraction! >= 0.05 &&
                progressFraction! <= 0.95)
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: LinearProgressIndicator(
                  value: progressFraction,
                  minHeight: 2,
                ),
              ),
          ],
        ),
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              '${episode.number}. ${episode.title ?? ''}',
              style: theme.textTheme.bodyMedium,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (episode.isFiller)
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.orange.withAlpha(40),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  'Filler',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: Colors.orange.shade800,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          if (watched)
            Padding(
              padding: const EdgeInsets.only(left: 6),
              child: Icon(
                Icons.check,
                size: 16,
                color: theme.colorScheme.primary,
              ),
            ),
        ],
      ),
      onTap: onTap,
    );
  }
}
