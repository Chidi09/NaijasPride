import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../../core/build_flavor.dart';

/// A description clamped to [maxLines] with a "More"/"Less" toggle, so a
/// long synopsis can't push the rest of the detail page (episode list,
/// similar titles) far off screen.
class ExpandableDescription extends StatefulWidget {
  final String text;
  final TextStyle? style;
  final int maxLines;

  const ExpandableDescription({
    super.key,
    required this.text,
    this.style,
    this.maxLines = 4,
  });

  @override
  State<ExpandableDescription> createState() => _ExpandableDescriptionState();
}

class _ExpandableDescriptionState extends State<ExpandableDescription> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.text,
          style: widget.style,
          maxLines: _expanded ? null : widget.maxLines,
          overflow: _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
        ),
        GestureDetector(
          onTap: () => setState(() => _expanded = !_expanded),
          child: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              _expanded ? 'Less' : 'More',
              style: TextStyle(
                color: theme.colorScheme.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

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
        ...?sliverFooter,
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
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      if (posterUrl.isNotEmpty)
                        Hero(
                          tag: heroTag,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: CachedNetworkImage(
                              imageUrl: posterUrl,
                              width: 72,
                              height: 108,
                              fit: BoxFit.cover,
                              memCacheWidth: 180,
                              errorWidget: (_, _, _) =>
                                  Container(color: theme.colorScheme.surface),
                            ),
                          ),
                        ),
                      if (posterUrl.isNotEmpty) const SizedBox(width: 12),
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
                  ExpandableDescription(
                    text: description!,
                    style: theme.textTheme.bodyLarge,
                  ),
                ],
                if (description2 != null) ...[
                  const SizedBox(height: 16),
                  ExpandableDescription(
                    text: description2!,
                    style: theme.textTheme.bodyLarge,
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
      ],
    );
  }

  // Full-bleed backdrop with content overlaid on the left, rather than
  // giving half the screen to a static image panel — also drops the touch
  // back button (sliverFooter) entirely, since it would steal first D-pad
  // focus on a screen a remote, not a finger, navigates.
  Widget _buildTvLayout(BuildContext context) {
    final theme = Theme.of(context);
    return Stack(
      fit: StackFit.expand,
      children: [
        CachedNetworkImage(
          imageUrl: heroImageUrl,
          fit: BoxFit.cover,
          memCacheWidth: 1920,
          errorWidget: (_, _, _) => Container(color: theme.colorScheme.surface),
          placeholder: (_, _) => Container(color: theme.colorScheme.surface),
        ),
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: [
                  theme.scaffoldBackgroundColor,
                  theme.scaffoldBackgroundColor.withAlpha(220),
                  Colors.transparent,
                ],
                stops: const [0.0, 0.5, 0.85],
              ),
            ),
          ),
        ),
        FractionallySizedBox(
          alignment: Alignment.centerLeft,
          widthFactor: 0.55,
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
                        ExpandableDescription(
                          text: description!,
                          style: theme.textTheme.bodyLarge,
                        ),
                      ],
                      if (description2 != null) ...[
                        const SizedBox(height: 16),
                        ExpandableDescription(
                          text: description2!,
                          style: theme.textTheme.bodyLarge,
                        ),
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
            ],
          ),
        ),
      ],
    );
  }
}
