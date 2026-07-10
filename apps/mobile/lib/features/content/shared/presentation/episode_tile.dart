import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

class EpisodeTile extends StatelessWidget {
  final String? thumbnailUrl;
  final int number;
  final String title;
  final String? subtitle;
  final bool isFiller;
  final bool watched;
  final double? progressFraction;
  final VoidCallback? onTap;

  const EpisodeTile({
    super.key,
    this.thumbnailUrl,
    required this.number,
    required this.title,
    this.subtitle,
    this.isFiller = false,
    this.watched = false,
    this.progressFraction,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: SizedBox(
        width: 80,
        height: 56,
        child: Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: CachedNetworkImage(
                imageUrl: thumbnailUrl ?? '',
                fit: BoxFit.cover,
                memCacheWidth: 200,
                errorWidget: (_, _, _) => Container(
                  color: theme.colorScheme.surface,
                  child: Center(
                    child: Icon(
                      Icons.movie_outlined,
                      color: theme.colorScheme.onSurface.withAlpha(100),
                    ),
                  ),
                ),
                placeholder: (_, _) => Container(
                  color: theme.colorScheme.surface,
                ),
              ),
            ),
            if (progressFraction != null &&
                progressFraction! >= 0.05 &&
                progressFraction! <= 0.95)
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: LinearProgressIndicator(
                  value: progressFraction,
                  minHeight: 2,
                ),
              ),
          ],
        ),
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              '$number. $title',
              style: theme.textTheme.bodyMedium,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (isFiller)
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.orange.withAlpha(40),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  'Filler',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: Colors.orange.shade800,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          if (watched)
            Padding(
              padding: const EdgeInsets.only(left: 6),
              child: Icon(
                Icons.check,
                size: 16,
                color: theme.colorScheme.primary,
              ),
            ),
        ],
      ),
      subtitle: subtitle != null
          ? Text(subtitle!, style: theme.textTheme.bodySmall)
          : null,
      onTap: onTap,
    );
  }
}
