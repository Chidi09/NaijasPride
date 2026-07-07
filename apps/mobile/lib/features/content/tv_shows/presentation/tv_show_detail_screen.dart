import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/tv_shows_api.dart';
import '../data/tv_show_models.dart';
import '../../../../core/player/embed_playback_resolver.dart';
import '../../../../core/player/embed_webview_screen.dart';
import '../../../../core/player/playback_source.dart';
import '../../../../core/player/unified_video_player_screen.dart';
import '../../../../core/player/watch_progress_api.dart';
import '../../shared/presentation/error_state_view.dart';
import '../../shared/presentation/pressable_scale.dart';
import '../../shared/presentation/status_picker.dart';

final tvShowDetailProvider =
    FutureProvider.family<TvShow, String>((ref, slug) {
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

  Future<void> _onEpisodeTap(TvShow show, TvEpisode episode) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load episode: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final showAsync = ref.watch(tvShowDetailProvider(widget.slug));

    return showAsync.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (error, _) => Scaffold(
        body: ErrorStateView(
          onRetry: () => ref.invalidate(tvShowDetailProvider(widget.slug)),
        ),
      ),
      data: (show) {
        if (show.seasons.isNotEmpty &&
            _selectedSeason > show.seasons.length) {
          _selectedSeason = show.seasons.first.seasonNumber;
        }
        final currentSeason = show.seasons
            .where((s) => s.seasonNumber == _selectedSeason)
            .firstOrNull;
        final episodes = currentSeason?.episodes ?? [];

        return Scaffold(
          body: CustomScrollView(
            slivers: [
              SliverAppBar(
                expandedHeight: 220,
                pinned: true,
                actions: [
                  PressableScale(
                    pressedColor: Theme.of(context).colorScheme.primary.withAlpha(40),
                    child: IconButton(
                      icon: const Icon(Icons.playlist_add),
                      tooltip: 'Add to list',
                      onPressed: () async {
                        final api = ref.read(watchProgressApiProvider);
                        final existing = await api.getTvProgress(show.id);
                        if (!context.mounted) return;
                        final selected = await showStatusPicker(context, current: existing?.status);
                        if (selected == null) return;
                        if (existing == null) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Watch an episode first to add this to your list')),
                            );
                          }
                          return;
                        }
                        await api.saveTvProgress(
                          showId: show.id,
                          episodeId: existing.episodeId ?? '',
                          seasonNumber: 0,
                          episodeNumber: 0,
                          progressSeconds: existing.progress,
                          durationSeconds: existing.duration,
                          status: selected,
                        );
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Marked as ${watchStatusLabel(selected)}')),
                          );
                        }
                      },
                    ),
                  ),
                ],
                flexibleSpace: FlexibleSpaceBar(
                  background: Hero(
                    tag: 'tv-poster-${show.id}',
                    child: Image.network(
                      show.backdropUrl ?? show.posterUrl ?? '',
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
                        show.title,
                        style: theme.textTheme.titleLarge,
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Text('${show.year}'),
                          if (show.language != null) ...[
                            const SizedBox(width: 16),
                            Text(show.language!),
                          ],
                        ],
                      ),
                      const SizedBox(height: 12),
                      if (show.genre.isNotEmpty)
                        Wrap(
                          spacing: 8,
                          runSpacing: 4,
                          children: show.genre.map((g) {
                            return Chip(
                              label: Text(g.wireValue),
                              materialTapTargetSize:
                                  MaterialTapTargetSize.shrinkWrap,
                              visualDensity: VisualDensity.compact,
                            );
                          }).toList(),
                        ),
                      const SizedBox(height: 16),
                      if (show.overview != null)
                        Text(
                          show.overview!,
                          style: theme.textTheme.bodyLarge,
                        ),
                      if (show.seasons.length > 1) ...[
                        const SizedBox(height: 24),
                        Text('Seasons', style: theme.textTheme.titleMedium),
                        const SizedBox(height: 8),
                        SizedBox(
                          height: 40,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: show.seasons.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(width: 8),
                            itemBuilder: (context, index) {
                              final season = show.seasons[index];
                              return ChoiceChip(
                                label: Text('Season ${season.seasonNumber}'),
                                selected: _selectedSeason ==
                                    season.seasonNumber,
                                onSelected: (selected) {
                                  if (selected) {
                                    setState(() =>
                                        _selectedSeason = season.seasonNumber);
                                  }
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
                        ...episodes.map((ep) => _EpisodeTile(episode: ep, onTap: () => _onEpisodeTap(show, ep))),
                      ],
                      const SizedBox(height: 24),
                    ],
                  ),
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
  final TvEpisode episode;
  final VoidCallback? onTap;

  const _EpisodeTile({required this.episode, this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: SizedBox(
        width: 80,
        height: 56,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: Image.network(
            episode.thumbnailUrl ?? '',
            fit: BoxFit.cover,
            errorBuilder: (context, error, stackTrace) => Container(
              color: theme.colorScheme.surface,
              child: Center(
                child: Icon(
                  Icons.tv,
                  color: theme.colorScheme.onSurface.withAlpha(100),
                ),
              ),
            ),
          ),
        ),
      ),
      title: Text(
        '${episode.episodeNumber}. ${episode.title}',
        style: theme.textTheme.bodyMedium,
      ),
      subtitle: episode.durationMinutes != null
          ? Text(
              '${episode.durationMinutes} min',
              style: theme.textTheme.bodySmall,
            )
          : null,
      onTap: onTap,
    );
  }
}
