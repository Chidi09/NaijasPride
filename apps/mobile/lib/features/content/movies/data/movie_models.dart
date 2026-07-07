import '../../domain/enums.dart';

class MovieSummary {
  final String id;
  final String title;
  final String? slug;
  final int year;
  final List<Genre> genre;
  final List<Quality> quality;
  final double? rating;
  final String? thumbnailUrl;
  final String? coverUrl;
  final String? posterUrl;
  final String? backdropUrl;
  final int? durationMinutes;
  final int downloadCount;
  final int viewCount;
  final bool nollywood;
  final bool isStreamOnly;
  final String? youtubeId;
  final bool canStream;

  MovieSummary({
    required this.id,
    required this.title,
    this.slug,
    required this.year,
    required this.genre,
    required this.quality,
    this.rating,
    this.thumbnailUrl,
    this.coverUrl,
    this.posterUrl,
    this.backdropUrl,
    this.durationMinutes,
    this.downloadCount = 0,
    this.viewCount = 0,
    this.nollywood = false,
    this.isStreamOnly = false,
    this.youtubeId,
    this.canStream = false,
  });

  factory MovieSummary.fromJson(Map<String, dynamic> json) {
    return MovieSummary(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      slug: json['slug'] as String?,
      year: (json['year'] as num?)?.toInt() ?? 0,
      genre: (json['genre'] as List<dynamic>?)
              ?.map((e) => Genre.fromWire(e as String))
              .toList() ??
          [],
      quality: (json['quality'] as List<dynamic>?)
              ?.map((e) => Quality.fromWire(e as String))
              .toList() ??
          [],
      rating: (json['rating'] as num?)?.toDouble(),
      thumbnailUrl: json['thumbnailUrl'] as String?,
      coverUrl: json['coverUrl'] as String?,
      posterUrl: json['posterUrl'] as String?,
      backdropUrl: json['backdropUrl'] as String?,
      durationMinutes: (json['durationMinutes'] as num?)?.toInt(),
      downloadCount: (json['downloadCount'] as num?)?.toInt() ?? 0,
      viewCount: (json['viewCount'] as num?)?.toInt() ?? 0,
      nollywood: json['nollywood'] as bool? ?? false,
      isStreamOnly: json['isStreamOnly'] as bool? ?? false,
      youtubeId: json['youtubeId'] as String?,
      canStream: json['canStream'] as bool? ?? false,
    );
  }
}

class CastMember {
  final String id;
  final String name;
  final String? character;
  final String? photoUrl;

  CastMember({
    required this.id,
    required this.name,
    this.character,
    this.photoUrl,
  });

  factory CastMember.fromJson(Map<String, dynamic> json) {
    return CastMember(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      character: json['character'] as String?,
      photoUrl: json['photoUrl'] as String?,
    );
  }
}

class Movie {
  final String id;
  final String title;
  final String? slug;
  final int year;
  final List<Genre> genre;
  final List<Quality> quality;
  final double? rating;
  final String? thumbnailUrl;
  final String? coverUrl;
  final String? posterUrl;
  final String? backdropUrl;
  final int? durationMinutes;
  final int downloadCount;
  final int viewCount;
  final bool nollywood;
  final bool isStreamOnly;
  final String? youtubeId;
  final bool canStream;
  final String? description;
  final String? overview;
  final String? tagline;
  final String? imdbId;
  final int? tmdbId;
  final double? tmdbRating;
  final double? imdbRating;
  final String? rottenTomatoes;
  final String? trailerUrl;
  final Map<String, String> fileUrls;
  final List<CastMember> cast;
  final String language;

  Movie({
    required this.id,
    required this.title,
    this.slug,
    required this.year,
    required this.genre,
    required this.quality,
    this.rating,
    this.thumbnailUrl,
    this.coverUrl,
    this.posterUrl,
    this.backdropUrl,
    this.durationMinutes,
    this.downloadCount = 0,
    this.viewCount = 0,
    this.nollywood = false,
    this.isStreamOnly = false,
    this.youtubeId,
    this.canStream = false,
    this.description,
    this.overview,
    this.tagline,
    this.imdbId,
    this.tmdbId,
    this.tmdbRating,
    this.imdbRating,
    this.rottenTomatoes,
    this.trailerUrl,
    this.fileUrls = const {},
    this.cast = const [],
    this.language = '',
  });

  factory Movie.fromJson(Map<String, dynamic> json) {
    return Movie(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      slug: json['slug'] as String?,
      year: (json['year'] as num?)?.toInt() ?? 0,
      genre: (json['genre'] as List<dynamic>?)
              ?.map((e) => Genre.fromWire(e as String))
              .toList() ??
          [],
      quality: (json['quality'] as List<dynamic>?)
              ?.map((e) => Quality.fromWire(e as String))
              .toList() ??
          [],
      rating: (json['rating'] as num?)?.toDouble(),
      thumbnailUrl: json['thumbnailUrl'] as String?,
      coverUrl: json['coverUrl'] as String?,
      posterUrl: json['posterUrl'] as String?,
      backdropUrl: json['backdropUrl'] as String?,
      durationMinutes: (json['durationMinutes'] as num?)?.toInt(),
      downloadCount: (json['downloadCount'] as num?)?.toInt() ?? 0,
      viewCount: (json['viewCount'] as num?)?.toInt() ?? 0,
      nollywood: json['nollywood'] as bool? ?? false,
      isStreamOnly: json['isStreamOnly'] as bool? ?? false,
      youtubeId: json['youtubeId'] as String?,
      canStream: json['canStream'] as bool? ?? false,
      description: json['description'] as String?,
      overview: json['overview'] as String?,
      tagline: json['tagline'] as String?,
      imdbId: json['imdbId'] as String?,
      tmdbId: (json['tmdbId'] as num?)?.toInt(),
      tmdbRating: (json['tmdbRating'] as num?)?.toDouble(),
      imdbRating: (json['imdbRating'] as num?)?.toDouble(),
      rottenTomatoes: json['rottenTomatoes'] as String?,
      trailerUrl: json['trailerUrl'] as String?,
      fileUrls: (json['fileUrls'] as Map<String, dynamic>?)
              ?.map((k, v) => MapEntry(k, v as String)) ??
          {},
      cast: (json['cast'] as List<dynamic>?)
              ?.map((e) => CastMember.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      language: json['language'] as String? ?? '',
    );
  }
}

class OfflineMovieRecord {
  final String movieId;
  final String quality;
  final int? fileSizeBytes;
  final String title;
  final String? posterUrl;

  OfflineMovieRecord({
    required this.movieId,
    required this.quality,
    this.fileSizeBytes,
    required this.title,
    this.posterUrl,
  });

  factory OfflineMovieRecord.fromJson(Map<String, dynamic> json) {
    final movie = json['movie'] as Map<String, dynamic>? ?? {};
    return OfflineMovieRecord(
      movieId: json['movieId'] as String? ?? '',
      quality: json['quality'] as String? ?? '',
      fileSizeBytes: (json['fileSizeBytes'] as num?)?.toInt(),
      title: movie['title'] as String? ?? '',
      posterUrl:
          movie['posterUrl'] as String? ?? movie['thumbnailUrl'] as String?,
    );
  }
}

class MovieEmbedProvider {
  final String id;
  final String name;
  final String url;
  final bool supportsProgressEvents;

  MovieEmbedProvider({
    required this.id,
    required this.name,
    required this.url,
    this.supportsProgressEvents = false,
  });

  factory MovieEmbedProvider.fromJson(Map<String, dynamic> json) {
    return MovieEmbedProvider(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      url: json['url'] as String? ?? '',
      supportsProgressEvents: json['supportsProgressEvents'] as bool? ?? false,
    );
  }
}
