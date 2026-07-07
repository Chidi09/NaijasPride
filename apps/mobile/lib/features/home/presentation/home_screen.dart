import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shimmer/shimmer.dart';

import '../../../core/build_flavor.dart';
import '../../ads/presentation/ad_slot_card.dart';
import '../../content/anime/data/anime_api.dart';
import '../../content/anime/data/anime_models.dart';
import '../../content/movies/data/movies_api.dart';
import '../../content/movies/data/movie_models.dart';
import '../../content/shared/presentation/content_carousel.dart';
import '../../content/shared/presentation/poster_card.dart';
import '../../content/tv_shows/data/tv_shows_api.dart';
import '../../content/tv_shows/data/tv_show_models.dart';
import '../../../core/network/api_client.dart';
import '../data/continue_watching_api.dart';
import '../../content/shared/presentation/status_picker.dart';
import 'hero_banner.dart';

final homeFeaturedMoviesProvider =
    FutureProvider<Map<String, List<MovieSummary>>>((ref) {
      return ref.watch(moviesApiProvider).featured();
    });

final homePopularTvProvider =
    FutureProvider<({List<TvShowSummary> data, Map<String, dynamic> meta})>((
      ref,
    ) {
      return ref.watch(tvShowsApiProvider).search(sortBy: 'popular', limit: 10);
    });

final homeTrendingAnimeProvider =
    FutureProvider<({List<AnimeSummary> media, Map<String, dynamic> pageInfo})>(
      (ref) {
        return ref
            .watch(animeApiProvider)
            .search(sort: 'TRENDING_DESC', perPage: 10);
      },
    );

final continueWatchingProvider = FutureProvider<List<ContinueWatchingItem>>((
  ref,
) async {
  final dio = ref.watch(dioProvider);
  final results = await Future.wait([
    fetchMovieHistory(dio),
    fetchTvHistory(dio),
    fetchAnimeHistory(dio),
  ]);
  final combined = [...results[0], ...results[1], ...results[2]];
  combined.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  return combined.take(15).toList();
});

class ContinueWatchingFilterNotifier extends Notifier<String?> {
  @override
  String? build() => null;

  void setFilter(String? value) => state = value;
}

final continueWatchingFilterProvider =
    NotifierProvider<ContinueWatchingFilterNotifier, String?>(
      ContinueWatchingFilterNotifier.new,
    );

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final continueAsync = ref.watch(continueWatchingProvider);
    final featuredAsync = ref.watch(homeFeaturedMoviesProvider);
    final tvAsync = ref.watch(homePopularTvProvider);
    final animeAsync = ref.watch(homeTrendingAnimeProvider);
    final selectedFilter = ref.watch(continueWatchingFilterProvider);

    return Scaffold(
      extendBodyBehindAppBar: !isTvBuild,
      appBar: isTvBuild
          ? AppBar(title: const Text('NaijaSpride'))
          : AppBar(
              title: const Text('NaijaSpride'),
              backgroundColor: Colors.transparent,
              elevation: 0,
            ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            featuredAsync.when(
              data: (featured) {
                final heroMovie =
                    (featured['trending'] ?? featured['mostWatched'] ?? [])
                        .cast<MovieSummary>()
                        .firstOrNull;
                if (heroMovie == null) return const SizedBox.shrink();
                if (isTvBuild) {
                  return HeroBanner(movie: heroMovie);
                }
                final heroMovies = [
                  if (featured['trending'] != null) ...featured['trending']!,
                  if (featured['mostWatched'] != null)
                    ...featured['mostWatched']!,
                  if (featured['latestUploads'] != null)
                    ...featured['latestUploads']!,
                  if (featured['newReleases'] != null)
                    ...featured['newReleases']!,
                  if (featured['comingSoon'] != null)
                    ...featured['comingSoon']!,
                ].take(5).toList();
                return HeroBanner(movie: heroMovie, featuredMovies: heroMovies);
              },
              loading: () => const SizedBox.shrink(),
              error: (_, _) => _inlineError(
                () => ref.invalidate(homeFeaturedMoviesProvider),
              ),
            ),
            continueAsync.when(
              data: (items) {
                if (items.isEmpty) return const SizedBox.shrink();
                final filteredItems = selectedFilter == null
                    ? items
                    : items.where((i) => i.status == selectedFilter).toList();
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 4,
                      ),
                      child: SizedBox(
                        height: 36,
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          children: [
                            Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: ChoiceChip(
                                label: const Text('All'),
                                selected: selectedFilter == null,
                                onSelected: (_) => ref
                                    .read(
                                      continueWatchingFilterProvider.notifier,
                                    )
                                    .setFilter(null),
                              ),
                            ),
                            ...kWatchStatuses.map((s) {
                              return Padding(
                                padding: const EdgeInsets.only(right: 8),
                                child: ChoiceChip(
                                  label: Text(watchStatusLabel(s)),
                                  selected: selectedFilter == s,
                                  onSelected: (_) => ref
                                      .read(
                                        continueWatchingFilterProvider.notifier,
                                      )
                                      .setFilter(s),
                                ),
                              );
                            }),
                          ],
                        ),
                      ),
                    ),
                    if (filteredItems.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 8,
                        ),
                        child: Text('No items with this status'),
                      )
                    else
                      ContentCarousel(
                        title: 'Continue Watching',
                        children: filteredItems.map((item) {
                          return PosterCard(
                            imageUrl: item.imageUrl ?? '',
                            title: item.title,
                            progressFraction: item.progressFraction,
                            onTap: () {
                              switch (item.contentType) {
                                case 'movie':
                                  context.go('/movies/${item.slug}');
                                case 'tv':
                                  context.go('/tv/${item.slug}');
                                case 'anime':
                                  context.go('/anime/${item.anilistId}');
                              }
                            },
                          );
                        }).toList(),
                      ),
                  ],
                );
              },
              loading: () => const SizedBox.shrink(),
              error: (_, _) =>
                  _inlineError(() => ref.invalidate(continueWatchingProvider)),
            ),
            featuredAsync.when(
              data: (featured) {
                const sections = [
                  ('Most Watched', 'mostWatched'),
                  ('Trending', 'trending'),
                  ('Latest Uploads', 'latestUploads'),
                  ('New Releases', 'newReleases'),
                  ('Coming Soon', 'comingSoon'),
                ];
                final carousels = sections
                    .where(
                      (s) =>
                          featured[s.$2] != null && featured[s.$2]!.isNotEmpty,
                    )
                    .map(
                      (s) => ContentCarousel(
                        title: s.$1,
                        children: featured[s.$2]!
                            .map(
                              (movie) => PosterCard(
                                imageUrl: movie.youtubeId != null
                                    ? (movie.backdropUrl ??
                                          movie.thumbnailUrl ??
                                          movie.posterUrl ??
                                          movie.coverUrl ??
                                          '')
                                    : (movie.posterUrl ??
                                          movie.thumbnailUrl ??
                                          movie.coverUrl ??
                                          ''),
                                isRectangular: movie.youtubeId != null,
                                title: movie.title,
                                onTap: () => context.go(
                                  '/movies/${movie.slug ?? movie.id}',
                                ),
                              ),
                            )
                            .toList(),
                      ),
                    )
                    .toList();
                return Column(
                  children: [
                    ...carousels.take(2),
                    if (!isTvBuild) const AdBannerCard(placement: 'HOME_FEED'),
                    ...carousels.skip(2),
                  ],
                );
              },
              loading: () => _loadingRow,
              error: (_, _) => _inlineError(
                () => ref.invalidate(homeFeaturedMoviesProvider),
              ),
            ),
            tvAsync.when(
              data: (tv) => tv.data.isNotEmpty
                  ? ContentCarousel(
                      title: 'Popular TV Shows',
                      children: tv.data
                          .map(
                            (show) => PosterCard(
                              imageUrl:
                                  show.posterUrl ?? show.thumbnailUrl ?? '',
                              title: show.title,
                              onTap: () => context.go('/tv/${show.slug}'),
                            ),
                          )
                          .toList(),
                    )
                  : const SizedBox.shrink(),
              loading: () => _loadingRow,
              error: (_, _) =>
                  _inlineError(() => ref.invalidate(homePopularTvProvider)),
            ),
            animeAsync.when(
              data: (anime) => anime.media.isNotEmpty
                  ? ContentCarousel(
                      title: 'Trending Anime',
                      children: anime.media
                          .map(
                            (entry) => PosterCard(
                              imageUrl:
                                  entry.coverImage.large ??
                                  entry.coverImage.medium ??
                                  '',
                              title:
                                  entry.title.english ??
                                  entry.title.romaji ??
                                  entry.title.native ??
                                  'Untitled',
                              onTap: () => context.go('/anime/${entry.id}'),
                            ),
                          )
                          .toList(),
                    )
                  : const SizedBox.shrink(),
              loading: () => _loadingRow,
              error: (_, _) =>
                  _inlineError(() => ref.invalidate(homeTrendingAnimeProvider)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _inlineError(VoidCallback onRetry) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          const Icon(Icons.error_outline, size: 18),
          const SizedBox(width: 8),
          const Text("Couldn't load"),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }

  Widget get _loadingRow {
    return SizedBox(
      height: 240,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: 5,
        itemBuilder: (context, index) => const Padding(
          padding: EdgeInsets.only(right: 8),
          child: _LoadingCard(),
        ),
      ),
    );
  }
}

class _LoadingCard extends StatelessWidget {
  const _LoadingCard();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      width: 130,
      child: Shimmer.fromColors(
        baseColor: theme.colorScheme.surface,
        highlightColor: theme.colorScheme.surface.withAlpha(150),
        child: Column(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: AspectRatio(
                aspectRatio: 2 / 3,
                child: Container(color: theme.colorScheme.surface),
              ),
            ),
            const SizedBox(height: 4),
            Container(
              height: 14,
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
