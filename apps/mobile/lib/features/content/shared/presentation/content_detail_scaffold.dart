import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

class ContentDetailScaffold extends StatelessWidget {
  final String heroImageUrl;
  final String posterUrl;
  final String heroTag;
  final Widget titleWidget;
  final Widget? metadataRow;
  final List<String> genres;
  final String? description;
  final String? description2;
  final bool Function(String)? genreOnTap;
  final Widget? episodeSection;
  final Widget? actionButtonsRow;
  final Widget? extraSections;
  final List<Widget>? sliverFooter;

  const ContentDetailScaffold({
    super.key,
    required this.heroImageUrl,
    required this.posterUrl,
    required this.heroTag,
    required this.titleWidget,
    this.metadataRow,
    this.genres = const [],
    this.description,
    this.description2,
    this.genreOnTap,
    this.episodeSection,
    this.actionButtonsRow,
    this.extraSections,
    this.sliverFooter,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          expandedHeight: MediaQuery.of(context).size.height * 0.42,
          pinned: true,
          flexibleSpace: FlexibleSpaceBar(
            background: Stack(
              fit: StackFit.expand,
              children: [
                CachedNetworkImage(
                  imageUrl: heroImageUrl,
                  fit: BoxFit.cover,
                  errorWidget: (_, _, _) =>
                      Container(color: theme.colorScheme.surface),
                  placeholder: (_, _) =>
                      Container(color: theme.colorScheme.surface),
                ),
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          theme.scaffoldBackgroundColor,
                        ],
                        stops: const [0.6, 1.0],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Column(
            children: [
              Transform.translate(
                offset: const Offset(0, -48),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Container(
                        width: 110,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withAlpha(60),
                              blurRadius: 8,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: AspectRatio(
                            aspectRatio: 2 / 3,
                            child: Hero(
                              tag: heroTag,
                              child: CachedNetworkImage(
                                imageUrl: posterUrl,
                                fit: BoxFit.cover,
                                errorWidget: (_, _, _) =>
                                    Container(color: theme.colorScheme.surface),
                                placeholder: (_, _) =>
                                    Container(color: theme.colorScheme.surface),
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            titleWidget,
                            if (metadataRow != null) ...[
                              const SizedBox(height: 8),
                              metadataRow!,
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Transform.translate(
                offset: const Offset(0, -48),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (genres.isNotEmpty)
                        Wrap(
                          spacing: 8,
                          runSpacing: 4,
                          children: genres.map((g) {
                            return Chip(
                              label: Text(g),
                              materialTapTargetSize:
                                  MaterialTapTargetSize.shrinkWrap,
                              visualDensity: VisualDensity.compact,
                            );
                          }).toList(),
                        ),
                      if (description != null) ...[
                        const SizedBox(height: 16),
                        Text(
                          description!,
                          style: theme.textTheme.bodyLarge,
                        ),
                      ],
                      if (description2 != null) ...[
                        const SizedBox(height: 16),
                        Text(
                          description2!,
                          style: theme.textTheme.bodyLarge,
                        ),
                      ],
                      if (actionButtonsRow != null) ...[
                        const SizedBox(height: 16),
                        actionButtonsRow!,
                      ],
                      if (extraSections != null) ...[
                        const SizedBox(height: 24),
                        extraSections!,
                      ],
                      if (episodeSection != null) ...[
                        const SizedBox(height: 24),
                        episodeSection!,
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        ...?sliverFooter,
      ],
    );
  }
}
