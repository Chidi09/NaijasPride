import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

/// Loading placeholder shaped like [ContentDetailScaffold] (hero banner +
/// title/metadata bars), rather than [ShimmerPosterGrid] which is shaped for
/// browse grids and doesn't match a detail page's layout.
class DetailLoadingSkeleton extends StatelessWidget {
  const DetailLoadingSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Shimmer.fromColors(
      baseColor: theme.colorScheme.surface,
      highlightColor: theme.colorScheme.surface.withAlpha(150),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: MediaQuery.of(context).size.height * 0.4,
            color: theme.colorScheme.surface,
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(height: 22, width: 220, color: theme.colorScheme.surface),
                const SizedBox(height: 12),
                Container(height: 14, width: 140, color: theme.colorScheme.surface),
                const SizedBox(height: 24),
                Container(height: 14, width: double.infinity, color: theme.colorScheme.surface),
                const SizedBox(height: 8),
                Container(height: 14, width: double.infinity, color: theme.colorScheme.surface),
                const SizedBox(height: 8),
                Container(height: 14, width: 180, color: theme.colorScheme.surface),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
