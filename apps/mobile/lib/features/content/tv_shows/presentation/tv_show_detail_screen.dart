import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/tv_shows_api.dart';
import '../data/tv_show_models.dart';
import '../../../../core/player/embed_playback_resolver.dart';
import '../../../../core/player/embed_webview_screen.dart';
import '../../../../core/player/playback_source.dart';
import '../../../../core/player/unified_video_player_screen.dart';
import '../../../../core/player/watch_progress_api.dart';
import '../../../../core/build_flavor.dart';
import '../../../../core/router/app_back_button.dart';
import '../../../ads/presentation/ad_slot_card.dart';
import '../../shared/presentation/content_detail_scaffold.dart';
import '../../shared/presentation/episode_tile.dart';
import '../../shared/presentation/error_state_view.dart';
import '../../shared/presentation/stream_preparing_overlay.dart';

final tvShowDetailProvider = FutureProvider.family<TvShow, String>((ref, slug) {
  return ref.watch(tvShowsApiProvider).detail(slug);
});

class TvShowDetailScreen extends ConsumerStatefulWidget {
  final String slug;

  const TvShowDetailScreen({super.key, required this.slug});

  @override
  ConsumerState<TvShowDetailScreen> createState() => _TvShowDetailScreenState();
}

class _TvShowDetailScreenState extends ConsumerState<TvShowDetailScreen> {
  int _selectedSeason = 1;
  ({int progress, int duration, String? episodeId, String? status})?
  _savedProgress;
  bool _hasCheckedProgress = false;

  Future<void> _fetchProgress(String showId) async {
    final api = ref.read(watchProgressApiProvider);
    final result = await api.getTvProgress(showId);
    if (mounted) setState(() => _savedProgress = result);
  }

  Future<void> _onEpisodeTap(TvShow show, TvEpisode episode) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => StreamPreparingOverlay(
        title: episode.title,
        imageUrl: show.backdropUrl ?? show.posterUrl,
      ),
    );
    try {
      final api = ref.read(tvShowsApiProvider);
      final providers = await api.embeds(
        show.slug,
        season: _selectedSeason,
        episode: episode.episodeNumber,
      );
      final result = await resolveTvEpisodePlayback(
        api: api,
        slug: show.slug,
        season: _selectedSeason,
        episode: episode.episodeNumber,
        providers: providers,
      );

      if (!mounted) return;
      Navigator.of(context).pop();

      switch (result) {
        case ResolvedDirectSource(:final source):
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => UnifiedVideoPlayerScreen(
                source: source,
                title: episode.title,
                progressTarget: TvProgressTarget(
                  showId: show.id,
                  episodeId: episode.id,
                  seasonNumber: _selectedSeason,
                  episodeNumber: episode.episodeNumber,
                ),
              ),
            ),
          );
        case EmbedWebViewFallback(:final url):
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) =>
                  EmbedWebViewScreen(embedUrl: url, title: episode.title),
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
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Failed to load episode: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final showAsync = ref.watch(tvShowDetailProvider(widget.slug));

    return showAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (error, _) => Scaffold(
        body: ErrorStateView(
          onRetry: () => ref.invalidate(tvShowDetailProvider(widget.slug)),
        ),
      ),
      data: (show) {
        if (!_hasCheckedProgress) {
          _hasCheckedProgress = true;
          Future.microtask(() => _fetchProgress(show.id));
        }
        if (show.seasons.isNotEmpty && _selectedSeason > show.seasons.length) {
          _selectedSeason = show.seasons.first.seasonNumber;
        }
        return Scaffold(
          body: ContentDetailScaffold(
            heroImageUrl: show.backdropUrl ?? show.posterUrl ?? '',
            posterUrl: show.posterUrl ?? show.backdropUrl ?? '',
            heroTag: 'tv-poster-${show.id}',
            titleWidget: Text(
              show.title,
              style: theme.textTheme.titleLarge,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            metadataRow: Row(
              children: [
                Text('${show.year}'),
                if (show.language != null) ...[
                  const SizedBox(width: 16),
                  Text(show.language!),
                ],
              ],
            ),
            genres: show.genre.map((g) => g.wireValue).toList(),
            description: show.overview,
            extraSections: !isTvBuild
                ? const AdBannerCard(placement: 'DETAIL')
                : null,
            episodeSection: TvSeasonEpisodesSection(
              show: show,
              selectedSeason: _selectedSeason,
              onSeasonChanged: (season) =>
                  setState(() => _selectedSeason = season),
              savedProgress: _savedProgress,
              onEpisodeTap: (ep) => _onEpisodeTap(show, ep),
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

class TvSeasonEpisodesSection extends StatelessWidget {
  final TvShow show;
  final int selectedSeason;
  final ValueChanged<int> onSeasonChanged;
  final ({int progress, int duration, String? episodeId, String? status})?
  savedProgress;
  final void Function(TvEpisode episode) onEpisodeTap;

  const TvSeasonEpisodesSection({
    super.key,
    required this.show,
    required this.selectedSeason,
    required this.onSeasonChanged,
    this.savedProgress,
    required this.onEpisodeTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final currentSeason = show.seasons
        .where((s) => s.seasonNumber == selectedSeason)
        .firstOrNull;
    final episodes = currentSeason?.episodes ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (show.seasons.length > 1) ...[
          Text('Seasons', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: show.seasons.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final season = show.seasons[index];
                return ChoiceChip(
                  label: Text('Season ${season.seasonNumber}'),
                  selected: selectedSeason == season.seasonNumber,
                  onSelected: (selected) {
                    if (selected) onSeasonChanged(season.seasonNumber);
                  },
                );
              },
            ),
          ),
        ],
        if (episodes.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('Episodes', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          ...episodes.map((ep) {
            final match =
                savedProgress != null && savedProgress!.episodeId == ep.id;
            double? progressFraction;
            bool watched = false;
            if (match) {
              final pct = savedProgress!.duration > 0
                  ? savedProgress!.progress / savedProgress!.duration
                  : 0.0;
              if (pct >= 0.95) {
                watched = true;
              } else if (pct > 0.05) {
                progressFraction = pct;
              }
            }
            return EpisodeTile(
              thumbnailUrl: ep.thumbnailUrl,
              number: ep.episodeNumber,
              title: ep.title,
              subtitle: ep.durationMinutes != null
                  ? '${ep.durationMinutes} min'
                  : null,
              onTap: () => onEpisodeTap(ep),
              progressFraction: progressFraction,
              watched: watched,
            );
          }),
        ],
        const SizedBox(height: 24),
      ],
    );
  }
}
