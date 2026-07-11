import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/build_flavor.dart';
import '../../../ads/data/ads_api.dart';
import '../../../ads/presentation/ad_slot_card.dart';
import '../../shared/presentation/error_state_view.dart';
import '../../shared/application/watch_progress_lookup.dart';
import '../../shared/presentation/poster_card.dart';
import '../../shared/presentation/shimmer_poster_grid.dart';
import '../data/movie_models.dart';
import '../data/movies_api.dart';

class MoviesScreen extends ConsumerStatefulWidget {
  const MoviesScreen({super.key});

  @override
  ConsumerState<MoviesScreen> createState() => _MoviesScreenState();
}

class _MoviesScreenState extends ConsumerState<MoviesScreen> {
  bool get _showAds =>
      !isTvBuild &&
      (ref.watch(adSlotsProvider('BROWSE_GRID')).value?.isNotEmpty ?? false);

  final _searchController = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _debounce;

  List<MovieSummary> _movies = [];
  Map<String, dynamic> _meta = {};
  int _currentPage = 1;
  bool _loading = false;
  bool _loadingMore = false;
  String? _error;
  String _query = '';
  bool _youtubeOnly = false;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(_onSearchChanged);
    _scrollController.addListener(_onScrollChanged);
    _fetchMovies();
  }

  void _onSearchChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 260), () {
      setState(() {
        _query = _searchController.text;
        _currentPage = 1;
        _movies = [];
      });
      _fetchMovies();
    });
  }

  void _onScrollChanged() {
    if (!_scrollController.hasClients) return;
    final pos = _scrollController.position;
    if (pos.pixels > pos.maxScrollExtent - 400 &&
        !_loadingMore &&
        _meta['hasNext'] == true) {
      _loadMore();
    }
  }

  Future<void> _fetchMovies() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = ref.read(moviesApiProvider);
      final result = await api.search(
        q: _query.isNotEmpty ? _query : null,
        youtubeOnly: _youtubeOnly,
        page: _currentPage,
      );
      if (!mounted) return;
      setState(() {
        _movies = result.data;
        _meta = result.meta;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    setState(() => _loadingMore = true);
    try {
      final api = ref.read(moviesApiProvider);
      final result = await api.search(
        q: _query.isNotEmpty ? _query : null,
        youtubeOnly: _youtubeOnly,
        page: _currentPage + 1,
      );
      if (!mounted) return;
      setState(() {
        _movies.addAll(result.data);
        _meta = result.meta;
        _currentPage++;
        _loadingMore = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingMore = false);
    }
  }

  void _retry() {
    _fetchMovies();
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
              hintText: 'Search movies...',
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
    if (_loading && _movies.isEmpty) {
      return Column(
        children: [
          _buildTypeToggle(),
          const Expanded(
            child: ShimmerPosterGrid(crossAxisCount: 3, childAspectRatio: 0.53),
          ),
        ],
      );
    }

    if (_error != null && _movies.isEmpty) {
      return ErrorStateView(onRetry: _retry);
    }

    if (!_loading && _movies.isEmpty) {
      return Center(
        child: Text(
          _query.isNotEmpty ? 'No movies found' : 'No movies available',
          style: theme.textTheme.bodyLarge,
        ),
      );
    }

    return Column(
      children: [
        _buildTypeToggle(),
        Expanded(
          child: GridView.builder(
            controller: _scrollController,
            padding: const EdgeInsets.all(16),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              childAspectRatio: _youtubeOnly ? 1.05 : 0.53,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
            ),
            itemCount: !_showAds
                ? _movies.length
                : _movies.length + (_movies.length ~/ 12),
            itemBuilder: (context, index) {
              if (_showAds && (index + 1) % 13 == 0) {
                return AdPosterCard(index: index ~/ 13);
              }
              final contentIndex = !_showAds ? index : index - index ~/ 13;
              final movie = _movies[contentIndex];
              return PosterCard(
                width: itemWidth,
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
                heroTag: 'movie-poster-${movie.id}',
                title: movie.title,
                onTap: () => context.push('/movies/${movie.slug ?? movie.id}'),
                progressFraction: progressLookup?.movie(movie.id, movie.slug),
                ratingLabel: movie.rating != null && movie.rating! > 0
                    ? movie.rating!.toStringAsFixed(1)
                    : null,
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
          ),
      ],
    );
  }

  Widget _buildTypeToggle() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: SizedBox(
        width: double.infinity,
        child: SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, label: Text('Movies')),
            ButtonSegment(value: true, label: Text('Nollywood / Free')),
          ],
          selected: {_youtubeOnly},
          onSelectionChanged: (set) {
            setState(() {
              _youtubeOnly = set.first;
              _currentPage = 1;
              _movies = [];
            });
            _fetchMovies();
          },
        ),
      ),
    );
  }
}
