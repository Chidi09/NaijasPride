import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

class PosterCard extends StatefulWidget {
  final String imageUrl;
  final String title;
  final VoidCallback onTap;
  final double width;

  /// True for YouTube-sourced cards (Nollywood/Bollywood stream-only movies),
  /// which use landscape 16:9 thumbnails instead of the 2:3 poster ratio
  /// everything else (movies/TV/anime posters) uses.
  final bool isRectangular;

  /// 0.0-1.0 watch progress. Null/omitted means "no progress to show" —
  /// most browse/search grids won't have this; it's populated by
  /// continue-watching/history views.
  final double? progressFraction;
  final Object? heroTag;

  /// Optional rating badge like "8.5" rendered as a small star pill at
  /// top-right of the poster image.
  final String? ratingLabel;

  /// Optional remaining-time label like "23m left", shown just above the
  /// progress bar. Ignored when [watched] is true.
  final String? progressLabel;

  /// True once the title has been finished, rendered as a check badge
  /// instead of a progress bar/label.
  final bool watched;

  const PosterCard({
    super.key,
    required this.imageUrl,
    required this.title,
    required this.onTap,
    this.width = 130,
    this.isRectangular = false,
    this.progressFraction,
    this.heroTag,
    this.ratingLabel,
    this.progressLabel,
    this.watched = false,
  });

  @override
  State<PosterCard> createState() => _PosterCardState();
}

class _PosterCardState extends State<PosterCard> {
  bool _isFocused = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      width: widget.width,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: _isFocused
                    ? Theme.of(context).colorScheme.primary
                    : Colors.transparent,
                width: 3,
              ),
              boxShadow: _isFocused
                  ? [
                      BoxShadow(
                        color: Theme.of(
                          context,
                        ).colorScheme.primary.withAlpha(120),
                        blurRadius: 12,
                        spreadRadius: 2,
                      ),
                    ]
                  : [],
            ),
            child: AnimatedScale(
              scale: _isFocused ? 1.08 : 1.0,
              duration: const Duration(milliseconds: 150),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: InkWell(
                  onTap: widget.onTap,
                  onFocusChange: (focused) =>
                      setState(() => _isFocused = focused),
                  child: AspectRatio(
                    aspectRatio: widget.isRectangular ? 16 / 9 : 2 / 3,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        _buildPosterImage(theme),
                        if (widget.progressLabel != null && !widget.watched)
                          Positioned(
                            left: 0,
                            right: 0,
                            bottom: widget.progressFraction != null ? 6 : 0,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Colors.transparent,
                                    Colors.black.withAlpha(160),
                                  ],
                                ),
                              ),
                              child: Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  6,
                                  10,
                                  6,
                                  4,
                                ),
                                child: Text(
                                  widget.progressLabel!,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ),
                          ),
                        if (widget.progressFraction != null)
                          Positioned(
                            left: 0,
                            right: 0,
                            bottom: 0,
                            child: _ProgressBar(
                              fraction: widget.progressFraction!.clamp(
                                0.0,
                                1.0,
                              ),
                            ),
                          ),
                        if (widget.watched)
                          Positioned(
                            bottom: 6,
                            right: 6,
                            child: Container(
                              padding: const EdgeInsets.all(3),
                              decoration: BoxDecoration(
                                color: Colors.black.withAlpha(140),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Icons.check,
                                size: 12,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        if (widget.ratingLabel != null)
                          Positioned(
                            top: 6,
                            right: 6,
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(6),
                              child: Container(
                                decoration: BoxDecoration(
                                  color: Colors.black.withAlpha(160),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                    color: const Color(0xFFD6B87A).withAlpha(90),
                                    width: 0.8,
                                  ),
                                ),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 2.5,
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(
                                      Icons.star_rounded,
                                      size: 13,
                                      color: Color(0xFFD6B87A),
                                    ),
                                    const SizedBox(width: 3),
                                    Text(
                                      widget.ratingLabel!,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 0.2,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            widget.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPosterImage(ThemeData theme) {
    final image = CachedNetworkImage(
      imageUrl: widget.imageUrl,
      fit: BoxFit.cover,
      memCacheWidth: (widget.width * 2.5).toInt(),
      placeholder: (_, _) => _placeholder(theme),
      errorWidget: (_, _, _) => _placeholder(theme),
    );
    if (widget.heroTag != null) {
      return Hero(tag: widget.heroTag!, child: image);
    }
    return image;
  }

  Widget _placeholder(ThemeData theme) {
    return Container(
      color: theme.colorScheme.surface,
      child: Center(
        child: Icon(
          Icons.movie_outlined,
          color: theme.colorScheme.onSurface.withAlpha(100),
        ),
      ),
    );
  }
}

class _ProgressBar extends StatelessWidget {
  final double fraction;

  const _ProgressBar({required this.fraction});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 4,
      decoration: BoxDecoration(
        color: Colors.black.withAlpha(120),
      ),
      child: FractionallySizedBox(
        alignment: Alignment.centerLeft,
        widthFactor: fraction,
        child: Container(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF800020), Color(0xFFA31535)],
            ),
            borderRadius: BorderRadius.horizontal(
              right: Radius.circular(fraction >= 0.98 ? 0 : 2),
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x99800020),
                blurRadius: 4,
                spreadRadius: 0.5,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
