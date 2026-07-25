import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/tv_shows_api.dart';
import '../data/tv_show_models.dart';
import '../../../../core/player/embed_playback_resolver.dart';
import '../../../../core/player/embed_webview_screen.dart';
import '../../../../core/player/videasy_player_screen.dart';
import '../../../../core/player/playback_source.dart';
import '../../../../core/player/unified_video_player_screen.dart';
import '../../../../core/player/watch_progress_api.dart';
import '../../../../core/build_flavor.dart';
import '../../../../core/router/app_back_button.dart';
import '../../../ads/presentation/ad_slot_card.dart';
import '../../shared/application/content_rating.dart';
import '../../shared/presentation/content_detail_scaffold.dart';
import '../../shared/presentation/content_meta_row.dart';
import '../../shared/presentation/detail_loading_skeleton.dart';
import '../../shared/presentation/episode_list_controls.dart';
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
  Map<String, ({int progress, int duration, String? status})>
  _episodeProgress = {};
  bool _hasCheckedProgress = false;

  Future<void> _fetchProgress(String showId) async {
    final api = ref.read(watchProgressApiProvider);
    final result = await api.getTvProgress(showId);
    if (mounted) setState(() => _episodeProgress = result);
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
        case EmbedVideasyFallback(:final url, :final alternates):
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => VideasyPlayerScreen(
                videasyUrl: url,
                title: episode.title,
                alternates: alternates,
                progressTarget: TvProgressTarget(
                  showId: show.id,
                  episodeId: episode.id,
                  seasonNumber: _selectedSeason,
                  episodeNumber: episode.episodeNumber,
                ),
              ),
            ),
          );
        case EmbedWebViewFallback(:final servers):
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => EmbedWebViewScreen(
                sources: servers
                    .map((s) => EmbedSource(url: s.url, label: s.label))
                    .toList(),
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
      loading: () => const Scaffold(body: DetailLoadingSkeleton()),
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
        final totalEpisodes = show.seasons.fold<int>(
          0,
          (sum, s) => sum + s.episodes.length,
        );
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
            metadataRow: ContentMetaRow(
              ratingLabel: formatRating(show.tmdbRating),
              items: [
                '${show.year}',
                if (show.language != null) show.language!,
                if (show.seasons.isNotEmpty)
                  '${show.seasons.length} season${show.seasons.length == 1 ? '' : 's'}',
                if (totalEpisodes > 0) '$totalEpisodes episodes',
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
              episodeProgress: _episodeProgress,
              onEpisodeTap: (ep) => _onEpisodeTap(show, ep),
            ),
            sliverFooter: [
              SliverAppBar(
                pinned: true,
                leading: const ScrimAppBackButton(),
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

class TvSeasonEpisodesSection extends StatefulWidget {
  final TvShow show;
  final int selectedSeason;
  final ValueChanged<int> onSeasonChanged;
  final Map<String, ({int progress, int duration, String? status})>
  episodeProgress;
  final void Function(TvEpisode episode) onEpisodeTap;

  const TvSeasonEpisodesSection({
    super.key,
    required this.show,
    required this.selectedSeason,
    required this.onSeasonChanged,
    this.episodeProgress = const {},
    required this.onEpisodeTap,
  });

  @override
  State<TvSeasonEpisodesSection> createState() =>
      _TvSeasonEpisodesSectionState();
}

class _TvSeasonEpisodesSectionState extends State<TvSeasonEpisodesSection> {
  String _filter = '';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final show = widget.show;
    final selectedSeason = widget.selectedSeason;
    final onSeasonChanged = widget.onSeasonChanged;
    final episodeProgress = widget.episodeProgress;
    final onEpisodeTap = widget.onEpisodeTap;
    final currentSeason = show.seasons
        .where((s) => s.seasonNumber == selectedSeason)
        .firstOrNull;
    final episodes = currentSeason?.episodes ?? [];
    final showFilter = episodes.length > 50;
    final visibleEpisodes = _filter.trim().isEmpty
        ? episodes
        : episodes.where((ep) {
            final q = _filter.trim().toLowerCase();
            return ep.episodeNumber.toString() == q ||
                ep.title.toLowerCase().contains(q);
          }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (show.seasons.length > 1) ...[
          Text('Seasons', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          if (show.seasons.length > 6)
            DropdownButton<int>(
              value: selectedSeason,
              isDense: true,
              items: show.seasons
                  .map(
                    (season) => DropdownMenuItem(
                      value: season.seasonNumber,
                      child: Text('Season ${season.seasonNumber}'),
                    ),
                  )
                  .toList(),
              onChanged: (season) {
                if (season != null) onSeasonChanged(season);
              },
            )
          else
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
          if (showFilter) ...[
            EpisodeFilterField(
              onChanged: (value) => setState(() => _filter = value),
            ),
            const SizedBox(height: 8),
          ],
          if (visibleEpisodes.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Text('No episodes match your filter.'),
            ),
          ...visibleEpisodes.map((ep) {
            final progress = episodeProgress[ep.id];
            double? progressFraction;
            bool watched = false;
            if (progress != null) {
              final pct = progress.duration > 0
                  ? progress.progress / progress.duration
                  : 0.0;
              if (pct >= 0.95 || progress.status == 'COMPLETED') {
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
