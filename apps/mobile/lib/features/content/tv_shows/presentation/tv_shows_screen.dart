import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/build_flavor.dart';
import '../../../ads/data/ads_api.dart';
import '../../../ads/presentation/ad_slot_card.dart';
import '../../shared/presentation/error_state_view.dart';
import '../../shared/application/content_rating.dart';
import '../../shared/application/watch_progress_lookup.dart';
import '../../shared/presentation/poster_card.dart';
import '../../shared/presentation/shimmer_poster_grid.dart';
import '../data/tv_shows_api.dart';
import '../data/tv_show_models.dart';

class TvShowsScreen extends ConsumerStatefulWidget {
  const TvShowsScreen({super.key});

  @override
  ConsumerState<TvShowsScreen> createState() => _TvShowsScreenState();
}

class _TvShowsScreenState extends ConsumerState<TvShowsScreen> {
  bool get _showAds =>
      !isTvBuild &&
      (ref.watch(adSlotsProvider('BROWSE_GRID')).value?.isNotEmpty ?? false);

  final _searchController = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _debounce;

  List<TvShowSummary> _shows = [];
  Map<String, dynamic> _meta = {};
  int _currentPage = 1;
  bool _loading = false;
  bool _loadingMore = false;
  String? _error;
  String _loadMoreError = '';

  /// Bumped whenever the query changes. A response carrying a stale id is
  /// discarded: without it, a page-2 request already in flight when the
  /// search box changed would append its results onto the new list.
  int _requestId = 0;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(_onSearchChanged);
    _scrollController.addListener(_onScrollChanged);
    _fetchShows();
  }

  void _onSearchChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 260), () {
      setState(() {
        _query = _searchController.text;
        _currentPage = 1;
        _shows = [];
      });
      _fetchShows();
    });
  }

  void _onScrollChanged() {
    if (!_scrollController.hasClients) return;
    final pos = _scrollController.position;
    if (pos.pixels > pos.maxScrollExtent - 400 &&
        !_loadingMore &&
        // Not while the first page is still arriving — the paging metadata
        // would still be from the previous query.
        !_loading &&
        // A failed page stops the loop until the user retries, rather than
        // re-firing on every scroll frame against a server that is down.
        _loadMoreError.isEmpty &&
        _meta['hasNext'] == true) {
      _loadMore();
    }
  }

  Future<void> _fetchShows() async {
    final requestId = ++_requestId;
    setState(() {
      _loading = true;
      _error = null;
      _loadMoreError = '';
      _loadingMore = false;
    });
    try {
      final api = ref.read(tvShowsApiProvider);
      final result = await api.search(
        q: _query.isNotEmpty ? _query : null,
        page: _currentPage,
      );
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _shows = result.data;
        _meta = result.meta;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    final requestId = _requestId;
    final nextPage = _currentPage + 1;
    setState(() {
      _loadingMore = true;
      _loadMoreError = '';
    });
    try {
      final api = ref.read(tvShowsApiProvider);
      final result = await api.search(
        q: _query.isNotEmpty ? _query : null,
        page: nextPage,
      );
      if (!mounted || requestId != _requestId) return;
      setState(() {
        // Ranking shifts between requests, so the same title can legitimately
        // arrive on two pages. Appending blind showed it twice in the grid.
        final seen = _shows.map((e) => e.id).toSet();
        _shows.addAll(result.data.where((e) => seen.add(e.id)));
        _meta = result.meta;
        _currentPage = nextPage;
        _loadingMore = false;
      });
    } catch (e) {
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _loadingMore = false;
        _loadMoreError = e.toString();
      });
    }
  }

  void _retryLoadMore() {
    setState(() => _loadMoreError = '');
    _loadMore();
  }

  void _retry() {
    _fetchShows();
  }

  @override
  void dispose() {
    _searchController.removeListener(_onSearchChanged);
    _searchController.dispose();
    _scrollController.removeListener(_onScrollChanged);
    _scrollController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final availableWidth = MediaQuery.of(context).size.width - 32;
    final itemWidth = (availableWidth - 8 * 2) / 3;
    final progressLookup = ref.watch(watchProgressLookupProvider).asData?.value;

    return Scaffold(
      appBar: AppBar(
        title: SizedBox(
          height: 40,
          child: TextField(
            controller: _searchController,
            style: theme.textTheme.bodyLarge,
            decoration: InputDecoration(
              hintText: 'Search TV shows...',
              hintStyle: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withAlpha(128),
              ),
              prefixIcon: Icon(
                Icons.search,
                color: theme.colorScheme.onSurface,
              ),
              suffixIcon: _searchController.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _searchController.clear();
                      },
                    )
                  : null,
              filled: true,
              fillColor: theme.colorScheme.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(vertical: 0),
            ),
          ),
        ),
      ),
      body: _buildBody(itemWidth, theme, progressLookup),
    );
  }

  Widget _buildBody(
    double itemWidth,
    ThemeData theme,
    WatchProgressLookup? progressLookup,
  ) {
    if (_loading && _shows.isEmpty) {
      return const ShimmerPosterGrid(crossAxisCount: 3, childAspectRatio: 0.53);
    }

    if (_error != null && _shows.isEmpty) {
      return ErrorStateView(onRetry: _retry);
    }

    if (!_loading && _shows.isEmpty) {
      return Center(
        child: Text(
          _query.isNotEmpty ? 'No TV shows found' : 'No TV shows available',
          style: theme.textTheme.bodyLarge,
        ),
      );
    }

    return Column(
      children: [
        Expanded(
          child: RefreshIndicator(
            color: theme.colorScheme.primary,
            backgroundColor: theme.colorScheme.surface,
            onRefresh: () async {
              setState(() {
                _currentPage = 1;
                _shows = [];
              });
              await _fetchShows();
            },
            child: GridView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
              controller: _scrollController,
            padding: const EdgeInsets.all(16),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              childAspectRatio: 0.53,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
            ),
            itemCount: !_showAds
                ? _shows.length
                : _shows.length + (_shows.length ~/ 12),
            itemBuilder: (context, index) {
              if (_showAds && (index + 1) % 13 == 0) {
                return AdPosterCard(index: index ~/ 13);
              }
              final contentIndex = !_showAds ? index : index - index ~/ 13;
              final show = _shows[contentIndex];
              final progress = progressLookup?.tv(show.id, show.slug);
              return PosterCard(
                width: itemWidth,
                imageUrl: show.posterUrl ?? show.thumbnailUrl ?? '',
                heroTag: 'tv-poster-${show.id}',
                title: show.title,
                onTap: () => context.push('/tv/${show.slug}'),
                progressFraction: progress?.fraction,
                progressLabel: progress?.remainingLabel,
                watched: progress?.watched ?? false,
                ratingLabel: tvRatingLabel(show),
              );
            },
          ),
        ),
        if (_loadingMore)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: SizedBox(
              height: 24,
              width: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          )
        // Previously a failed page just stopped loading with no explanation,
        // so the grid looked like it had simply ended.
        else if (_loadMoreError.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Column(
              children: [
                Text(
                  'Couldn’t load more.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                TextButton(
                  onPressed: _retryLoadMore,
                  child: const Text('Try again'),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
