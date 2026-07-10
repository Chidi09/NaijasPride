import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../../core/build_flavor.dart';

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
    if (isTvBuild) return _buildTvLayout(context);
    return _buildPhoneLayout(context);
  }

  Widget _buildPhoneLayout(BuildContext context) {
    final theme = Theme.of(context);
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: SizedBox(
            height: MediaQuery.of(context).size.height * 0.45,
            child: Stack(
              fit: StackFit.expand,
              children: [
                CachedNetworkImage(
                  imageUrl: heroImageUrl,
                  fit: BoxFit.cover,
                  memCacheWidth: 1080,
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
                        stops: const [0.3, 0.85],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 16,
                  right: 16,
                  bottom: 16,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      titleWidget,
                      if (metadataRow != null) ...[
                        const SizedBox(height: 8),
                        metadataRow!,
                      ],
                      if (actionButtonsRow != null) ...[
                        const SizedBox(height: 12),
                        actionButtonsRow!,
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
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
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        visualDensity: VisualDensity.compact,
                      );
                    }).toList(),
                  ),
                if (description != null) ...[
                  const SizedBox(height: 16),
                  Text(description!, style: theme.textTheme.bodyLarge),
                ],
                if (description2 != null) ...[
                  const SizedBox(height: 16),
                  Text(description2!, style: theme.textTheme.bodyLarge),
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
        ...?sliverFooter,
      ],
    );
  }

  Widget _buildTvLayout(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Expanded(
          flex: 1,
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      titleWidget,
                      if (metadataRow != null) ...[
                        const SizedBox(height: 12),
                        metadataRow!,
                      ],
                      if (actionButtonsRow != null) ...[
                        const SizedBox(height: 16),
                        actionButtonsRow!,
                      ],
                      if (description != null) ...[
                        const SizedBox(height: 24),
                        Text(description!, style: theme.textTheme.bodyLarge),
                      ],
                      if (description2 != null) ...[
                        const SizedBox(height: 16),
                        Text(description2!, style: theme.textTheme.bodyLarge),
                      ],
                      if (genres.isNotEmpty) ...[
                        const SizedBox(height: 16),
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
              ...?sliverFooter,
            ],
          ),
        ),
        Expanded(
          flex: 1,
          child: ClipRRect(
            child: Stack(
              children: [
                CachedNetworkImage(
                  imageUrl: heroImageUrl,
                  fit: BoxFit.cover,
                  memCacheWidth: 1080,
                  width: double.infinity,
                  height: double.infinity,
                  errorWidget: (_, _, _) =>
                      Container(color: theme.colorScheme.surface),
                  placeholder: (_, _) =>
                      Container(color: theme.colorScheme.surface),
                ),
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.centerLeft,
                        end: Alignment.centerRight,
                        colors: [
                          theme.scaffoldBackgroundColor,
                          Colors.transparent,
                        ],
                        stops: const [0.0, 0.3],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
