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

  const PosterCard({
    super.key,
    required this.imageUrl,
    required this.title,
    required this.onTap,
    this.width = 130,
    this.isRectangular = false,
    this.progressFraction,
    this.heroTag,
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
                        color: Theme.of(context)
                            .colorScheme
                            .primary
                            .withAlpha(120),
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
                        if (widget.progressFraction != null)
                          Positioned(
                            left: 0,
                            right: 0,
                            bottom: 0,
                            child: _ProgressBar(
                              fraction: widget.progressFraction!
                                  .clamp(0.0, 1.0),
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
    final theme = Theme.of(context);
    return Container(
      height: 4,
      color: Colors.black.withAlpha(80),
      child: FractionallySizedBox(
        alignment: Alignment.centerLeft,
        widthFactor: fraction,
        child: Container(color: theme.colorScheme.primary),
      ),
    );
  }
}
