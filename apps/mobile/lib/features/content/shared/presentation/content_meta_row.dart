import 'package:flutter/material.dart';

/// A consistent "rating · year · runtime/episodes · status" line for detail
/// pages. Callers pass already-formatted, non-null segments in the order
/// they should appear; this just handles consistent spacing/wrapping so
/// movie/TV/anime detail screens stop diverging on layout.
class ContentMetaRow extends StatelessWidget {
  final List<String> items;
  final String? ratingLabel;

  const ContentMetaRow({super.key, required this.items, this.ratingLabel});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final children = <Widget>[];
    if (ratingLabel != null) {
      children.add(
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.star_rounded, size: 15, color: Color(0xFFD6B87A)),
            const SizedBox(width: 3),
            Text(ratingLabel!, style: theme.textTheme.bodyMedium),
          ],
        ),
      );
    }
    children.addAll(items.map((item) => Text(item)));

    if (children.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: 16,
      runSpacing: 4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: children,
    );
  }
}
