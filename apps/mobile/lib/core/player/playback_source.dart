sealed class PlaybackSource {}

class DirectPlaybackSource extends PlaybackSource {
  final String url;
  final Map<String, String>? headers;
  DirectPlaybackSource(this.url, {this.headers});
}

class YoutubePlaybackSource extends PlaybackSource {
  final String youtubeId;
  YoutubePlaybackSource(this.youtubeId);
}

class UnresolvedPlaybackSource extends PlaybackSource {
  final String reason;
  UnresolvedPlaybackSource(this.reason);
}

sealed class ProgressTarget {}

class MovieProgressTarget extends ProgressTarget {
  final String movieId;
  MovieProgressTarget(this.movieId);
}

class AnimeProgressTarget extends ProgressTarget {
  final int anilistId;
  final int episodeNumber;
  final String title;
  final String? imageUrl;
  AnimeProgressTarget({
    required this.anilistId,
    required this.episodeNumber,
    required this.title,
    this.imageUrl,
  });
}

class TvProgressTarget extends ProgressTarget {
  final String showId;
  final String episodeId;
  final int seasonNumber;
  final int episodeNumber;

  TvProgressTarget({
    required this.showId,
    required this.episodeId,
    required this.seasonNumber,
    required this.episodeNumber,
  });
}
