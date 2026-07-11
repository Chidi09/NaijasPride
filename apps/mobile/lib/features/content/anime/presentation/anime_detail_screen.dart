import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/anime_api.dart';
import '../data/anime_models.dart';
import '../../../../core/player/embed_playback_resolver.dart';
import '../../../../core/player/playback_resolver.dart';
import '../../../../core/player/playback_source.dart';
import '../../../../core/player/unified_video_player_screen.dart';
import '../../../../core/player/watch_progress_api.dart';
import '../../../../core/build_flavor.dart';
import '../../../../core/router/app_back_button.dart';
import '../../../ads/presentation/ad_slot_card.dart';
import '../../shared/presentation/content_detail_scaffold.dart';
import '../../shared/presentation/episode_tile.dart';
import '../../shared/presentation/error_state_view.dart';
import '../../shared/presentation/pressable_scale.dart';
import '../../shared/presentation/status_picker.dart';
import '../../shared/presentation/stream_preparing_overlay.dart';
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

    List<AnimeWatchSubtitle>? fetchedSubtitles;

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
            subtitles: fetchedSubtitles,
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
      fetchedSubtitles = result.subtitles;
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

        final embedResult = await resolveEmbedOnlyPlayback(
          providerUrls: embedSources.map((s) => s.url).toList(),
          backendExtract: () =>
              ref.read(animeApiProvider).extractStream(embedSources.first.url),
        );

        if (!mounted) return;
        Navigator.of(context).pop();

        switch (embedResult) {
          case ResolvedDirectSource(:final source):
            pushPlayer(source, skipTimes: skipTimes);
          case EmbedWebViewFallback():
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => EmbedWebViewScreen(
                  sources: embedSources
                      .map(
                        (s) => EmbedSource(
                          url: s.url,
                          label: s.quality.isNotEmpty ? s.quality : 'Server',
                        ),
                      )
                      .toList(),
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
          body: ContentDetailScaffold(
            heroImageUrl:
                detail.bannerImage ??
                detail.coverImage.extraLarge ??
                detail.coverImage.large ??
                '',
            posterUrl:
                detail.coverImage.extraLarge ??
                detail.coverImage.large ??
                detail.bannerImage ??
                '',
            heroTag: 'anime-poster-${detail.id}',
            titleWidget: Text(
              title,
              style: theme.textTheme.titleLarge,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            metadataRow: Row(
              children: [
                if (detail.seasonYear != null) Text('${detail.seasonYear}'),
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
            genres: detail.genres,
            description: detail.description != null
                ? _stripHtml(detail.description!)
                : null,
            extraSections: !isTvBuild
                ? const AdBannerCard(placement: 'DETAIL')
                : null,
            episodeSection: EpisodesSection(
              episodesAsync: episodesAsync,
              episodeProgress: _episodeProgress,
              onEpisodeTap: (ep, episodes) => _onEpisodeTap(ep, episodes),
              watchProgressApi: ref,
              anilistId: widget.id,
              detail: detail,
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

class EpisodesSection extends ConsumerWidget {
  final AsyncValue<List<AnimeEpisode>> episodesAsync;
  final Map<int, ({int progress, int duration, String? status})>
  episodeProgress;
  final void Function(AnimeEpisode episode, List<AnimeEpisode> episodes)
  onEpisodeTap;
  final WidgetRef watchProgressApi;
  final int anilistId;
  final AnimeDetail detail;

  const EpisodesSection({
    super.key,
    required this.episodesAsync,
    required this.episodeProgress,
    required this.onEpisodeTap,
    required this.watchProgressApi,
    required this.anilistId,
    required this.detail,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return episodesAsync.when(
      loading: () => const Center(
        child: SizedBox(
          height: 24,
          width: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
      error: (error, _) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text('Failed to load episodes', style: theme.textTheme.bodyMedium),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => ref.invalidate(animeEpisodesProvider(anilistId)),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
      data: (episodes) {
        List<AnimeEpisode> displayEpisodes = episodes.toList();
        if (displayEpisodes.isEmpty) {
          int total = detail.episodes ?? 0;
          if (total == 0) {
            if (detail.nextAiringEpisode != null &&
                detail.nextAiringEpisode! > 1) {
              total = detail.nextAiringEpisode! - 1;
            } else if (detail.status != 'NOT_YET_RELEASED') {
              total = 1;
            }
          }
          if (total > 0) {
            displayEpisodes = List.generate(
              total,
              (index) => AnimeEpisode(
                id: 'meta-${index + 1}',
                number: index + 1,
                title: 'Episode ${index + 1}',
              ),
            );
          }
        }
        if (displayEpisodes.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Episodes', style: theme.textTheme.titleMedium),
                PressableScale(
                  pressedColor: Theme.of(
                    context,
                  ).colorScheme.primary.withAlpha(40),
                  child: IconButton(
                    icon: const Icon(Icons.playlist_add),
                    tooltip: 'Add to list',
                    onPressed: () async {
                      final ep = displayEpisodes.first;
                      final api = ref.read(watchProgressApiProvider);
                      final existing = await api.getAnimeEpisodeProgress(
                        anilistId,
                        ep.number,
                      );
                      if (!context.mounted) return;
                      final selected = await showStatusPicker(
                        context,
                        current: existing?.status,
                      );
                      if (selected == null) return;
                      await api.saveAnimeProgress(
                        anilistId: anilistId,
                        episodeNumber: ep.number,
                        title: ep.title ?? 'Episode ${ep.number}',
                        imageUrl: ep.image,
                        progressSeconds: existing?.progress ?? 0,
                        durationSeconds: existing?.duration ?? 0,
                        status: selected,
                      );
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
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
            ...displayEpisodes.map((ep) {
              final epProgress = episodeProgress[ep.number];
              double? progressFraction;
              bool watched = false;
              if (epProgress != null) {
                final pct = epProgress.duration > 0
                    ? epProgress.progress / epProgress.duration
                    : 0.0;
                if (pct >= 0.95 || epProgress.status == 'COMPLETED') {
                  watched = true;
                } else if (pct > 0.05) {
                  progressFraction = pct;
                }
              }
              return EpisodeTile(
                thumbnailUrl: ep.image,
                number: ep.number,
                title: ep.title ?? '',
                isFiller: ep.isFiller,
                onTap: () => onEpisodeTap(ep, displayEpisodes),
                progressFraction: progressFraction,
                watched: watched,
              );
            }),
            const SizedBox(height: 24),
          ],
        );
      },
    );
  }
}
