import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

import '../../content/anime/data/anime_api.dart';
import '../../content/anime/data/anime_models.dart';
import '../../content/movies/data/movie_models.dart';
import '../../content/movies/data/movies_api.dart';
import '../../content/shared/presentation/content_carousel.dart';
import '../../content/shared/presentation/poster_card.dart';
import '../../content/tv_shows/data/tv_show_models.dart';
import '../../content/tv_shows/data/tv_shows_api.dart';

class _Suggestion {
  final String imageUrl;
  final String title;
  final String type;
  final VoidCallback onTap;

  const _Suggestion({
    required this.imageUrl,
    required this.title,
    required this.type,
    required this.onTap,
  });
}

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _searchController = TextEditingController();
  final _searchFocusNode = FocusNode();
  Timer? _debounce;

  final _speech = stt.SpeechToText();
  bool _speechAvailable = false;
  bool _isListening = false;

  List<MovieSummary> _movies = [];
  List<TvShowSummary> _tvShows = [];
  List<AnimeSummary> _anime = [];
  bool _loading = false;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(_onSearchChanged);
    _searchFocusNode.addListener(() {
      if (mounted) setState(() {});
    });
    _speech.initialize().then((available) {
      if (mounted) setState(() => _speechAvailable = available);
    });
  }

  void _onSearchChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      final q = _searchController.text;
      if (q.isEmpty) {
        setState(() {
          _query = '';
          _movies = [];
          _tvShows = [];
          _anime = [];
          _loading = false;
        });
        return;
      }
      setState(() {
        _query = q;
        _loading = true;
      });
      _performSearch(q);
    });
  }

  Future<void> _performSearch(String q) async {
    final moviesFuture = ref
        .read(moviesApiProvider)
        .search(q: q)
        .then((r) => r.data)
        .catchError((_) => <MovieSummary>[]);
    final tvFuture = ref
        .read(tvShowsApiProvider)
        .search(q: q)
        .then((r) => r.data)
        .catchError((_) => <TvShowSummary>[]);
    final animeFuture = ref
        .read(animeApiProvider)
        .search(q: q)
        .then((r) => r.media)
        .catchError((_) => <AnimeSummary>[]);

    final results = await Future.wait([
      moviesFuture,
      tvFuture,
      animeFuture,
    ]);

    if (!mounted) return;
    setState(() {
      _movies = results[0] as List<MovieSummary>;
      _tvShows = results[1] as List<TvShowSummary>;
      _anime = results[2] as List<AnimeSummary>;
      _loading = false;
    });
  }

  Future<void> _toggleListening() async {
    if (_isListening) {
      await _speech.stop();
      if (mounted) setState(() => _isListening = false);
      return;
    }
    final started = await _speech.listen(
      onResult: (result) {
        _searchController.text = result.recognizedWords;
        _searchController.selection = TextSelection.collapsed(
          offset: _searchController.text.length,
        );
      },
    );
    if (mounted) setState(() => _isListening = started != false);
  }

  bool get _showDropdown =>
      _searchFocusNode.hasFocus &&
      _searchController.text.isNotEmpty &&
      !_loading &&
      (_movies.isNotEmpty || _tvShows.isNotEmpty || _anime.isNotEmpty);

  List<_Suggestion> get _suggestions {
    final list = <_Suggestion>[];
    for (final m in _movies) {
      if (list.length >= 5) break;
      list.add(_Suggestion(
        imageUrl: m.youtubeId != null
            ? (m.backdropUrl ??
                m.thumbnailUrl ??
                m.posterUrl ??
                m.coverUrl ??
                '')
            : (m.posterUrl ??
                m.thumbnailUrl ??
                m.coverUrl ??
                ''),
        title: m.title,
        type: 'Movie',
        onTap: () => context.push('/movies/${m.slug ?? m.id}'),
      ));
    }
    for (final t in _tvShows) {
      if (list.length >= 5) break;
      list.add(_Suggestion(
        imageUrl: t.posterUrl ?? t.thumbnailUrl ?? '',
        title: t.title,
        type: 'TV',
        onTap: () => context.push('/tv/${t.slug}'),
      ));
    }
    for (final a in _anime) {
      if (list.length >= 5) break;
      list.add(_Suggestion(
        imageUrl: a.coverImage.extraLarge ??
            a.coverImage.large ??
            '',
        title: a.title.english ??
            a.title.romaji ??
            a.title.native ??
            '',
        type: 'Anime',
        onTap: () => context.push('/anime/${a.id}'),
      ));
    }
    return list;
  }

  @override
  void dispose() {
    _searchController.removeListener(_onSearchChanged);
    _searchController.dispose();
    _searchFocusNode.dispose();
    _debounce?.cancel();
    _speech.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Search')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              focusNode: _searchFocusNode,
              style: theme.textTheme.bodyLarge,
              decoration: InputDecoration(
                hintText: 'Search movies, TV shows, and anime',
                hintStyle: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withAlpha(128),
                ),
                prefixIcon: Icon(
                  Icons.search,
                  color: theme.colorScheme.onSurface,
                ),
                suffixIcon: _speechAvailable || _searchController.text.isNotEmpty
                    ? Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (_searchController.text.isNotEmpty)
                            IconButton(
                              icon: const Icon(Icons.clear),
                              onPressed: () => _searchController.clear(),
                            ),
                          if (_speechAvailable)
                            IconButton(
                              icon: Icon(_isListening ? Icons.mic_off : Icons.mic),
                              onPressed: _toggleListening,
                            ),
                        ],
                      )
                    : null,
                filled: true,
                fillColor: theme.colorScheme.surface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                contentPadding:
                    const EdgeInsets.symmetric(vertical: 0, horizontal: 16),
              ),
            ),
          ),
          AnimatedSize(
            duration: _showDropdown
                ? const Duration(milliseconds: 250)
                : const Duration(milliseconds: 150),
            curve:
                _showDropdown ? Curves.easeOutQuart : Curves.easeInQuad,
            alignment: Alignment.topCenter,
            child: AnimatedOpacity(
              duration: _showDropdown
                  ? const Duration(milliseconds: 250)
                  : const Duration(milliseconds: 150),
              opacity: _showDropdown ? 1.0 : 0.0,
              child: _showDropdown
                  ? _buildSuggestionsDropdown(theme)
                  : const SizedBox(height: 0),
            ),
          ),
          Expanded(
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onTap: () => _searchFocusNode.unfocus(),
              child: _buildBody(theme),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSuggestionsDropdown(ThemeData theme) {
    final suggestions = _suggestions;
    if (suggestions.isEmpty) return const SizedBox.shrink();

    final isDark = theme.brightness == Brightness.dark;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: theme.colorScheme.outline.withAlpha(77),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(isDark ? 100 : 26),
            blurRadius: 24,
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children:
            suggestions.map((s) => _buildSuggestionRow(s, theme)).toList(),
      ),
    );
  }

  Widget _buildSuggestionRow(_Suggestion s, ThemeData theme) {
    return InkWell(
      onTap: () {
        _searchFocusNode.unfocus();
        s.onTap();
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: Image.network(
                s.imageUrl,
                width: 32,
                height: 48,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => Container(
                  width: 32,
                  height: 48,
                  color: theme.colorScheme.onSurface.withAlpha(26),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                s.title,
                style: theme.textTheme.bodyMedium,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: theme.colorScheme.secondary.withAlpha(30),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                s.type,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.secondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(ThemeData theme) {
    if (_query.isEmpty) {
      return Center(
        child: Text(
          'Search movies, TV shows, and anime',
          style: theme.textTheme.bodyLarge?.copyWith(
            color: theme.colorScheme.onSurface.withAlpha(128),
          ),
        ),
      );
    }

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final hasMovies = _movies.isNotEmpty;
    final hasTv = _tvShows.isNotEmpty;
    final hasAnime = _anime.isNotEmpty;

    if (!hasMovies && !hasTv && !hasAnime) {
      return Center(
        child: Text(
          'No results found',
          style: theme.textTheme.bodyLarge,
        ),
      );
    }

    return ListView(
      children: [
        if (hasMovies)
          ContentCarousel(
            title: 'Movies',
            children: _movies.map((m) {
              return PosterCard(
                imageUrl: m.youtubeId != null
                    ? (m.backdropUrl ??
                        m.thumbnailUrl ??
                        m.posterUrl ??
                        m.coverUrl ??
                        '')
                    : (m.posterUrl ??
                        m.thumbnailUrl ??
                        m.coverUrl ??
                        ''),
                isRectangular: m.youtubeId != null,
                title: m.title,
                onTap: () => context.push('/movies/${m.slug ?? m.id}'),
              );
            }).toList(),
          ),
        if (hasTv)
          ContentCarousel(
            title: 'TV Shows',
            children: _tvShows.map((t) {
              return PosterCard(
                imageUrl: t.posterUrl ?? t.thumbnailUrl ?? '',
                title: t.title,
                onTap: () => context.push('/tv/${t.slug}'),
              );
            }).toList(),
          ),
        if (hasAnime)
          ContentCarousel(
            title: 'Anime',
            children: _anime.map((a) {
              return PosterCard(
                imageUrl: a.coverImage.extraLarge ??
                    a.coverImage.large ??
                    '',
                title: a.title.english ??
                    a.title.romaji ??
                    a.title.native ??
                    '',
                onTap: () => context.push('/anime/${a.id}'),
              );
            }).toList(),
          ),
      ],
    );
  }
}
