import 'dart:async';
import 'dart:ui';

import 'package:cached_network_image/cached_network_image.dart';
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
    _debounce = Timer(const Duration(milliseconds: 260), () {
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

    final results = await Future.wait([moviesFuture, tvFuture, animeFuture]);

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
      list.add(
        _Suggestion(
          imageUrl: m.youtubeId != null
              ? (m.backdropUrl ??
                    m.thumbnailUrl ??
                    m.posterUrl ??
                    m.coverUrl ??
                    '')
              : (m.posterUrl ?? m.thumbnailUrl ?? m.coverUrl ?? ''),
          title: m.title,
          type: 'Movie',
          onTap: () => context.push('/movies/${m.slug ?? m.id}'),
        ),
      );
    }
    for (final t in _tvShows) {
      if (list.length >= 5) break;
      list.add(
        _Suggestion(
          imageUrl: t.posterUrl ?? t.thumbnailUrl ?? '',
          title: t.title,
          type: 'TV',
          onTap: () => context.push('/tv/${t.slug}'),
        ),
      );
    }
    for (final a in _anime) {
      if (list.length >= 5) break;
      list.add(
        _Suggestion(
          imageUrl: a.coverImage.extraLarge ?? a.coverImage.large ?? '',
          title: a.title.english ?? a.title.romaji ?? a.title.native ?? '',
          type: 'Anime',
          onTap: () => context.push('/anime/${a.id}'),
        ),
      );
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
      backgroundColor: const Color(0xFF0A0A0F),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: TextField(
                controller: _searchController,
                focusNode: _searchFocusNode,
                style: theme.textTheme.bodyLarge?.copyWith(color: Colors.white),
                decoration: InputDecoration(
                  hintText: 'Search movies, TV shows, and anime',
                  hintStyle: theme.textTheme.bodyMedium?.copyWith(
                    color: Colors.white.withAlpha(80),
                  ),
                  prefixIcon: Icon(Icons.search, color: Colors.white70),
                  suffixIcon:
                      _speechAvailable || _searchController.text.isNotEmpty
                      ? Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (_searchController.text.isNotEmpty)
                              IconButton(
                                icon: Icon(Icons.clear, color: Colors.white70),
                                onPressed: () => _searchController.clear(),
                              ),
                            if (_speechAvailable)
                              IconButton(
                                icon: Icon(
                                  _isListening ? Icons.mic_off : Icons.mic,
                                  color: Colors.white70,
                                ),
                                onPressed: _toggleListening,
                              ),
                          ],
                        )
                      : null,
                  filled: true,
                  fillColor: Colors.white.withAlpha(15),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    vertical: 14,
                    horizontal: 16,
                  ),
                ),
              ),
            ),
            AnimatedSize(
              duration: _showDropdown
                  ? const Duration(milliseconds: 250)
                  : const Duration(milliseconds: 150),
              curve: _showDropdown ? Curves.easeOutQuart : Curves.easeInQuad,
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
      ),
    );
  }

  Widget _buildSuggestionsDropdown(ThemeData theme) {
    final suggestions = _suggestions;
    if (suggestions.isEmpty) return const SizedBox.shrink();

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: Colors.white.withAlpha(15),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withAlpha(20)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: suggestions
                .map((s) => _buildSuggestionRow(s, theme))
                .toList(),
          ),
        ),
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
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: CachedNetworkImage(
                imageUrl: s.imageUrl,
                width: 40,
                height: 60,
                fit: BoxFit.cover,
                errorWidget: (_, _, _) => Container(
                  width: 40,
                  height: 60,
                  color: Colors.white.withAlpha(10),
                ),
                placeholder: (_, _) => Container(
                  width: 40,
                  height: 60,
                  color: Colors.white.withAlpha(10),
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                s.title,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w500,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.white.withAlpha(20),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                s.type,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: Colors.white70,
                  fontWeight: FontWeight.w600,
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
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search, size: 80, color: Colors.white.withAlpha(10)),
            const SizedBox(height: 16),
            Text(
              'Search movies, TV shows, and anime',
              style: theme.textTheme.titleMedium?.copyWith(
                color: Colors.white.withAlpha(80),
              ),
            ),
          ],
        ),
      );
    }

    if (_loading) {
      return Center(
        child: CircularProgressIndicator(color: Colors.white70, strokeWidth: 3),
      );
    }

    final hasMovies = _movies.isNotEmpty;
    final hasTv = _tvShows.isNotEmpty;
    final hasAnime = _anime.isNotEmpty;

    if (!hasMovies && !hasTv && !hasAnime) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search_off, size: 80, color: Colors.white.withAlpha(10)),
            const SizedBox(height: 16),
            Text(
              'No results found',
              style: theme.textTheme.titleMedium?.copyWith(
                color: Colors.white.withAlpha(80),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Try a different search term',
              style: theme.textTheme.bodySmall?.copyWith(
                color: Colors.white.withAlpha(40),
              ),
            ),
          ],
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
                    : (m.posterUrl ?? m.thumbnailUrl ?? m.coverUrl ?? ''),
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
                imageUrl: a.coverImage.extraLarge ?? a.coverImage.large ?? '',
                title:
                    a.title.english ?? a.title.romaji ?? a.title.native ?? '',
                onTap: () => context.push('/anime/${a.id}'),
              );
            }).toList(),
          ),
      ],
    );
  }
}
