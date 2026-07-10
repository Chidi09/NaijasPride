class AnimeTitle {
  final String? romaji;
  final String? english;
  final String? native;

  AnimeTitle({this.romaji, this.english, this.native});

  factory AnimeTitle.fromJson(Map<String, dynamic> json) {
    return AnimeTitle(
      romaji: json['romaji'] as String?,
      english: json['english'] as String?,
      native: json['native'] as String?,
    );
  }
}

class AnimeCoverImage {
  final String? large;
  final String? medium;
  final String? extraLarge;
  final String? color;

  AnimeCoverImage({this.large, this.medium, this.extraLarge, this.color});

  factory AnimeCoverImage.fromJson(Map<String, dynamic> json) {
    return AnimeCoverImage(
      large: json['large'] as String?,
      medium: json['medium'] as String?,
      extraLarge: json['extraLarge'] as String?,
      color: json['color'] as String?,
    );
  }
}

class AnimeSummary {
  final int id;
  final int? idMal;
  final AnimeTitle title;
  final String? description;
  final String? season;
  final int? seasonYear;
  final String? format;
  final String? status;
  final int? episodes;
  final int? duration;
  final int? averageScore;
  final int? popularity;
  final List<String> genres;
  final AnimeCoverImage coverImage;
  final String? bannerImage;
  final List<String> studios;

  AnimeSummary({
    required this.id,
    this.idMal,
    required this.title,
    this.description,
    this.season,
    this.seasonYear,
    this.format,
    this.status,
    this.episodes,
    this.duration,
    this.averageScore,
    this.popularity,
    this.genres = const [],
    required this.coverImage,
    this.bannerImage,
    this.studios = const [],
  });

  factory AnimeSummary.fromJson(Map<String, dynamic> json) {
    return AnimeSummary(
      id: (json['id'] as num?)?.toInt() ?? 0,
      idMal: (json['idMal'] as num?)?.toInt(),
      title: json['title'] != null
          ? AnimeTitle.fromJson(json['title'] as Map<String, dynamic>)
          : AnimeTitle(),
      description: json['description'] as String?,
      season: json['season'] as String?,
      seasonYear: (json['seasonYear'] as num?)?.toInt(),
      format: json['format'] as String?,
      status: json['status'] as String?,
      episodes: (json['episodes'] as num?)?.toInt(),
      duration: (json['duration'] as num?)?.toInt(),
      averageScore: (json['averageScore'] as num?)?.toInt(),
      popularity: (json['popularity'] as num?)?.toInt(),
      genres: (json['genres'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          [],
      coverImage: json['coverImage'] != null
          ? AnimeCoverImage.fromJson(
              json['coverImage'] as Map<String, dynamic>)
          : AnimeCoverImage(),
      bannerImage: json['bannerImage'] as String?,
      studios: _parseStudios(json['studios']),
    );
  }

  static List<String> _parseStudios(dynamic studios) {
    if (studios == null) return [];
    if (studios is List) {
      return studios.map((e) => e is String ? e : '').toList();
    }
    if (studios is Map) {
      final nodes = studios['nodes'];
      if (nodes is List) {
        return nodes
            .map((e) => (e as Map<String, dynamic>)['name'] as String? ?? '')
            .toList();
      }
    }
    return [];
  }
}

class AnimeDetail {
  final int id;
  final int? idMal;
  final AnimeTitle title;
  final String? description;
  final String? season;
  final int? seasonYear;
  final String? format;
  final String? status;
  final int? episodes;
  final int? duration;
  final int? averageScore;
  final int? popularity;
  final List<String> genres;
  final AnimeCoverImage coverImage;
  final String? bannerImage;
  final List<String> studios;
  final List<String> synonyms;
  final String? source;
  final String? countryOfOrigin;
  final String? siteUrl;
  final Map<String, dynamic>? trailer;
  final int? nextAiringEpisode;

  AnimeDetail({
    required this.id,
    this.idMal,
    required this.title,
    this.description,
    this.season,
    this.seasonYear,
    this.format,
    this.status,
    this.episodes,
    this.duration,
    this.averageScore,
    this.popularity,
    this.genres = const [],
    required this.coverImage,
    this.bannerImage,
    this.studios = const [],
    this.synonyms = const [],
    this.source,
    this.countryOfOrigin,
    this.siteUrl,
    this.trailer,
    this.nextAiringEpisode,
  });

  factory AnimeDetail.fromJson(Map<String, dynamic> json) {
    return AnimeDetail(
      id: (json['id'] as num?)?.toInt() ?? 0,
      idMal: (json['idMal'] as num?)?.toInt(),
      title: json['title'] != null
          ? AnimeTitle.fromJson(json['title'] as Map<String, dynamic>)
          : AnimeTitle(),
      description: json['description'] as String?,
      season: json['season'] as String?,
      seasonYear: (json['seasonYear'] as num?)?.toInt(),
      format: json['format'] as String?,
      status: json['status'] as String?,
      episodes: (json['episodes'] as num?)?.toInt(),
      duration: (json['duration'] as num?)?.toInt(),
      averageScore: (json['averageScore'] as num?)?.toInt(),
      popularity: (json['popularity'] as num?)?.toInt(),
      genres: (json['genres'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          [],
      coverImage: json['coverImage'] != null
          ? AnimeCoverImage.fromJson(
              json['coverImage'] as Map<String, dynamic>)
          : AnimeCoverImage(),
      bannerImage: json['bannerImage'] as String?,
      studios: AnimeSummary._parseStudios(json['studios']),
      synonyms: (json['synonyms'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          [],
      source: json['source'] as String?,
      countryOfOrigin: json['countryOfOrigin'] as String?,
      siteUrl: json['siteUrl'] as String?,
      trailer: json['trailer'] as Map<String, dynamic>?,
      nextAiringEpisode: (json['nextAiringEpisode']?['episode'] as num?)?.toInt(),
    );
  }
}

class AnimeEpisode {
  final String? id;
  final int number;
  final String? title;
  final String? image;
  final String? url;
  final bool isFiller;

  AnimeEpisode({
    this.id,
    required this.number,
    this.title,
    this.image,
    this.url,
    this.isFiller = false,
  });

  factory AnimeEpisode.fromJson(Map<String, dynamic> json) {
    return AnimeEpisode(
      id: json['id'] as String?,
      number: (json['number'] as num?)?.toInt() ?? 0,
      title: json['title'] as String?,
      image: json['image'] as String?,
      url: json['url'] as String?,
      isFiller: json['isFiller'] as bool? ?? false,
    );
  }
}

class AnimeWatchSource {
  final String url;
  final String quality;
  final bool isM3U8;
  final bool isEmbed;
  final String? referer;

  AnimeWatchSource({
    required this.url,
    required this.quality,
    this.isM3U8 = false,
    this.isEmbed = false,
    this.referer,
  });

  factory AnimeWatchSource.fromJson(Map<String, dynamic> json) {
    return AnimeWatchSource(
      url: json['url'] as String? ?? '',
      quality: json['quality'] as String? ?? '',
      isM3U8: json['isM3U8'] as bool? ?? false,
      isEmbed: json['isEmbed'] as bool? ?? false,
      referer: json['referer'] as String?,
    );
  }
}

class AnimeWatchSubtitle {
  final String? url;
  final String? lang;

  AnimeWatchSubtitle({this.url, this.lang});

  factory AnimeWatchSubtitle.fromJson(Map<String, dynamic> json) {
    return AnimeWatchSubtitle(
      url: json['url'] as String?,
      lang: json['lang'] as String?,
    );
  }
}

class AnimeSkipInterval {
  final int start;
  final int end;

  const AnimeSkipInterval({required this.start, required this.end});

  factory AnimeSkipInterval.fromJson(Map<String, dynamic> json) {
    return AnimeSkipInterval(
      start: (json['start'] as num?)?.toInt() ?? 0,
      end: (json['end'] as num?)?.toInt() ?? 0,
    );
  }
}

class AnimeSkipTimes {
  final AnimeSkipInterval? op;
  final AnimeSkipInterval? ed;

  const AnimeSkipTimes({this.op, this.ed});

  factory AnimeSkipTimes.fromJson(Map<String, dynamic> json) {
    return AnimeSkipTimes(
      op: json['op'] != null
          ? AnimeSkipInterval.fromJson(json['op'] as Map<String, dynamic>)
          : null,
      ed: json['ed'] != null
          ? AnimeSkipInterval.fromJson(json['ed'] as Map<String, dynamic>)
          : null,
    );
  }
}

class AnimeWatchProgress {
  final String id;
  final int anilistId;
  final int episodeNumber;
  final String title;
  final String? imageUrl;
  final int progress;
  final int duration;
  final String? status;
  final String createdAt;
  final String updatedAt;

  AnimeWatchProgress({
    required this.id,
    required this.anilistId,
    required this.episodeNumber,
    required this.title,
    this.imageUrl,
    required this.progress,
    required this.duration,
    this.status,
    required this.createdAt,
    required this.updatedAt,
  });

  factory AnimeWatchProgress.fromJson(Map<String, dynamic> json) {
    return AnimeWatchProgress(
      id: json['id'] as String? ?? '',
      anilistId: (json['anilistId'] as num?)?.toInt() ?? 0,
      episodeNumber: (json['episodeNumber'] as num?)?.toInt() ?? 0,
      title: json['title'] as String? ?? '',
      imageUrl: json['imageUrl'] as String?,
      progress: (json['progress'] as num?)?.toInt() ?? 0,
      duration: (json['duration'] as num?)?.toInt() ?? 0,
      status: json['status'] as String?,
      createdAt: json['createdAt'] as String? ?? '',
      updatedAt: json['updatedAt'] as String? ?? '',
    );
  }
}
