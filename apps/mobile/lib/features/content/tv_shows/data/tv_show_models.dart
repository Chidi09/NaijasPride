import '../../domain/enums.dart';

class TvEpisode {
  final String id;
  final int episodeNumber;
  final String title;
  final String? overview;
  final int? durationMinutes;
  final String? thumbnailUrl;

  TvEpisode({
    required this.id,
    required this.episodeNumber,
    required this.title,
    this.overview,
    this.durationMinutes,
    this.thumbnailUrl,
  });

  factory TvEpisode.fromJson(Map<String, dynamic> json) {
    return TvEpisode(
      id: json['id'] as String? ?? '',
      episodeNumber: (json['episodeNumber'] as num?)?.toInt() ?? 0,
      title: json['title'] as String? ?? '',
      overview: json['overview'] as String?,
      durationMinutes: (json['durationMinutes'] as num?)?.toInt(),
      thumbnailUrl: json['thumbnailUrl'] as String?,
    );
  }
}

class TvSeason {
  final String id;
  final int seasonNumber;
  final String? title;
  final String? overview;
  final String? posterUrl;
  final List<TvEpisode> episodes;

  TvSeason({
    required this.id,
    required this.seasonNumber,
    this.title,
    this.overview,
    this.posterUrl,
    this.episodes = const [],
  });

  factory TvSeason.fromJson(Map<String, dynamic> json) {
    return TvSeason(
      id: json['id'] as String? ?? '',
      seasonNumber: (json['seasonNumber'] as num?)?.toInt() ?? 0,
      title: json['title'] as String?,
      overview: json['overview'] as String?,
      posterUrl: json['posterUrl'] as String?,
      episodes: (json['episodes'] as List<dynamic>?)
              ?.map((e) => TvEpisode.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}

class TvShowSummary {
  final String id;
  final String title;
  final String slug;
  final int year;
  final List<Genre> genre;
  final String? thumbnailUrl;
  final String? posterUrl;
  final String? backdropUrl;
  final String? imdbId;
  final int? tmdbId;
  final bool canStream;
  final int seasonCount;
  final int episodeCount;
  final int viewCount;

  TvShowSummary({
    required this.id,
    required this.title,
    required this.slug,
    required this.year,
    required this.genre,
    this.thumbnailUrl,
    this.posterUrl,
    this.backdropUrl,
    this.imdbId,
    this.tmdbId,
    this.canStream = false,
    this.seasonCount = 0,
    this.episodeCount = 0,
    this.viewCount = 0,
  });

  factory TvShowSummary.fromJson(Map<String, dynamic> json) {
    return TvShowSummary(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      year: (json['year'] as num?)?.toInt() ?? 0,
      genre: (json['genre'] as List<dynamic>?)
              ?.map((e) => Genre.fromWire(e as String))
              .toList() ??
          [],
      thumbnailUrl: json['thumbnailUrl'] as String?,
      posterUrl: json['posterUrl'] as String?,
      backdropUrl: json['backdropUrl'] as String?,
      imdbId: json['imdbId'] as String?,
      tmdbId: (json['tmdbId'] as num?)?.toInt(),
      canStream: json['canStream'] as bool? ?? false,
      seasonCount: (json['seasonCount'] as num?)?.toInt() ?? 0,
      episodeCount: (json['episodeCount'] as num?)?.toInt() ?? 0,
      viewCount: (json['viewCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class TvShow {
  final String id;
  final String title;
  final String slug;
  final int year;
  final List<Genre> genre;
  final String? thumbnailUrl;
  final String? posterUrl;
  final String? backdropUrl;
  final String? imdbId;
  final int? tmdbId;
  final bool canStream;
  final String? overview;
  final String? language;
  final String? trailerUrl;
  final List<TvSeason> seasons;

  TvShow({
    required this.id,
    required this.title,
    required this.slug,
    required this.year,
    required this.genre,
    this.thumbnailUrl,
    this.posterUrl,
    this.backdropUrl,
    this.imdbId,
    this.tmdbId,
    this.canStream = false,
    this.overview,
    this.language,
    this.trailerUrl,
    this.seasons = const [],
  });

  factory TvShow.fromJson(Map<String, dynamic> json) {
    return TvShow(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      year: (json['year'] as num?)?.toInt() ?? 0,
      genre: (json['genre'] as List<dynamic>?)
              ?.map((e) => Genre.fromWire(e as String))
              .toList() ??
          [],
      thumbnailUrl: json['thumbnailUrl'] as String?,
      posterUrl: json['posterUrl'] as String?,
      backdropUrl: json['backdropUrl'] as String?,
      imdbId: json['imdbId'] as String?,
      tmdbId: (json['tmdbId'] as num?)?.toInt(),
      canStream: json['canStream'] as bool? ?? false,
      overview: json['overview'] as String?,
      language: json['language'] as String?,
      trailerUrl: json['trailerUrl'] as String?,
      seasons: (json['seasons'] as List<dynamic>?)
              ?.map((e) => TvSeason.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}

class TvEmbedProvider {
  final String id;
  final String name;
  final String url;
  final bool supportsProgressEvents;

  TvEmbedProvider({
    required this.id,
    required this.name,
    required this.url,
    this.supportsProgressEvents = false,
  });

  factory TvEmbedProvider.fromJson(Map<String, dynamic> json) {
    return TvEmbedProvider(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      url: json['url'] as String? ?? '',
      supportsProgressEvents: json['supportsProgressEvents'] as bool? ?? false,
    );
  }
}

class TvExtractedStream {
  final String streamUrl;
  final String kind;
  final String? referer;

  TvExtractedStream({
    required this.streamUrl,
    required this.kind,
    this.referer,
  });

  factory TvExtractedStream.fromJson(Map<String, dynamic> json) {
    return TvExtractedStream(
      streamUrl: json['streamUrl'] as String? ?? '',
      kind: json['kind'] as String? ?? 'other',
      referer: json['referer'] as String?,
    );
  }
}
