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
import '../data/anime_api.dart';
import '../data/anime_models.dart';

class AnimeScreen extends ConsumerStatefulWidget {
  const AnimeScreen({super.key});

  @override
  ConsumerState<AnimeScreen> createState() => _AnimeScreenState();
}

class _AnimeScreenState extends ConsumerState<AnimeScreen> {
  bool get _showAds =>
      !isTvBuild &&
      (ref.watch(adSlotsProvider('BROWSE_GRID')).value?.isNotEmpty ?? false);

  final _searchController = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _debounce;

  List<AnimeSummary> _media = [];
  Map<String, dynamic> _pageInfo = {};
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
    _fetchMedia();
  }

  void _onSearchChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 260), () {
      setState(() {
        _query = _searchController.text;
        _currentPage = 1;
        _media = [];
      });
      _fetchMedia();
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
        _pageInfo['hasNextPage'] == true) {
      _loadMore();
    }
  }

  Future<void> _fetchMedia() async {
    final requestId = ++_requestId;
    setState(() {
      _loading = true;
      _error = null;
      _loadMoreError = '';
      _loadingMore = false;
    });
    try {
      final api = ref.read(animeApiProvider);
      final result = await api.search(
        q: _query.isNotEmpty ? _query : null,
        page: _currentPage,
      );
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _media = result.media;
        _pageInfo = result.pageInfo;
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
      final api = ref.read(animeApiProvider);
      final result = await api.search(
        q: _query.isNotEmpty ? _query : null,
        page: nextPage,
      );
      if (!mounted || requestId != _requestId) return;
      setState(() {
        // Ranking shifts between requests, so the same title can legitimately
        // arrive on two pages. Appending blind showed it twice in the grid.
        final seen = _media.map((e) => e.id).toSet();
        _media.addAll(result.media.where((e) => seen.add(e.id)));
        _pageInfo = result.pageInfo;
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
    _fetchMedia();
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
              hintText: 'Search anime...',
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
    if (_loading && _media.isEmpty) {
      return const ShimmerPosterGrid(crossAxisCount: 3, childAspectRatio: 0.53);
    }

    if (_error != null && _media.isEmpty) {
      return ErrorStateView(onRetry: _retry);
    }

    if (!_loading && _media.isEmpty) {
      return Center(
        child: Text(
          _query.isNotEmpty ? 'No anime found' : 'No anime available',
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
                _media = [];
              });
              await _fetchAnime();
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
                ? _media.length
                : _media.length + (_media.length ~/ 12),
            itemBuilder: (context, index) {
              if (_showAds && (index + 1) % 13 == 0) {
                return AdPosterCard(index: index ~/ 13);
              }
              final contentIndex = !_showAds ? index : index - index ~/ 13;
              final entry = _media[contentIndex];
              final progress = progressLookup?.anime(entry.id.toString());
              return PosterCard(
                width: itemWidth,
                imageUrl:
                    entry.coverImage.large ?? entry.coverImage.medium ?? '',
                heroTag: 'anime-poster-${entry.id}',
                title:
                    entry.title.english ??
                    entry.title.romaji ??
                    entry.title.native ??
                    'Untitled',
                onTap: () => context.push('/anime/${entry.id}'),
                progressFraction: progress?.fraction,
                progressLabel: progress?.remainingLabel,
                watched: progress?.watched ?? false,
                ratingLabel: formatAniListScore(entry.averageScore),
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
