import '../../movies/data/movie_models.dart';
import '../../tv_shows/data/tv_show_models.dart';

/// Formats a 0-10 scale rating (TMDB/IMDB/local) to one decimal, or null
/// when there's nothing worth showing.
String? formatRating(num? value) {
  if (value == null || value <= 0) return null;
  return value.toStringAsFixed(1);
}

/// AniList's averageScore is 0-100; normalise it to the same 0-10 scale
/// used everywhere else so movie/TV/anime rating pills read consistently.
String? formatAniListScore(num? averageScore) {
  if (averageScore == null || averageScore <= 0) return null;
  return (averageScore / 10).toStringAsFixed(1);
}

String? movieRatingLabel(MovieSummary movie) =>
    formatRating(movie.imdbRating ?? movie.tmdbRating ?? movie.rating);

String? tvRatingLabel(TvShowSummary show) => formatRating(show.tmdbRating);
