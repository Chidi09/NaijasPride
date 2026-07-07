import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/ads_api.dart';

Color _sponsoredColor(BuildContext context) {
  return Theme.of(context).brightness == Brightness.dark
      ? const Color(0xFFD6B87A)
      : const Color(0xFF9A6D1F);
}

class AdBannerCard extends ConsumerWidget {
  final String placement;
  final int index;

  const AdBannerCard({super.key, required this.placement, this.index = 0});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adSlotsProvider(placement));
    return async.when(
      data: (creatives) {
        if (creatives.isEmpty) return const SizedBox.shrink();
        final ad = creatives[index % creatives.length];
        final theme = Theme.of(context);
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: GestureDetector(
            onTap: ad.targetUrl != null
                ? () => launchUrl(
                    Uri.parse(ad.targetUrl!),
                    mode: LaunchMode.externalApplication,
                  )
                : null,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                width: double.infinity,
                child: AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (ad.imageUrl != null)
                        Image.network(
                          ad.imageUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) =>
                              Container(color: theme.colorScheme.surface),
                        )
                      else
                        Container(color: theme.colorScheme.surface),
                      Positioned.fill(
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.bottomCenter,
                              end: Alignment.topCenter,
                              colors: [
                                Colors.black.withAlpha(179),
                                Colors.transparent,
                              ],
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        top: 8,
                        left: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.black54,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            'Sponsored',
                            style: TextStyle(
                              fontSize: 10,
                              color: _sponsoredColor(context),
                              letterSpacing: 0.5,
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        bottom: 8,
                        left: 8,
                        child: Text(
                          ad.title,
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: Colors.white,
                          ),
                        ),
                      ),
                      if (ad.ctaLabel != null)
                        Positioned(
                          bottom: 8,
                          right: 8,
                          child: FilledButton.tonal(
                            onPressed: ad.targetUrl != null
                                ? () => launchUrl(
                                    Uri.parse(ad.targetUrl!),
                                    mode: LaunchMode.externalApplication,
                                  )
                                : null,
                            child: Text(ad.ctaLabel!),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
    );
  }
}

class AdPosterCard extends ConsumerWidget {
  final int index;

  const AdPosterCard({super.key, this.index = 0});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adSlotsProvider('BROWSE_GRID'));
    return async.when(
      data: (creatives) {
        if (creatives.isEmpty) return const SizedBox.shrink();
        final ad = creatives[index % creatives.length];
        final theme = Theme.of(context);
        return SizedBox(
          width: double.infinity,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: GestureDetector(
                  onTap: ad.targetUrl != null
                      ? () => launchUrl(
                          Uri.parse(ad.targetUrl!),
                          mode: LaunchMode.externalApplication,
                        )
                      : null,
                  child: AspectRatio(
                    aspectRatio: 2 / 3,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (ad.imageUrl != null)
                          Image.network(
                            ad.imageUrl!,
                            fit: BoxFit.cover,
                            errorBuilder: (_, _, _) =>
                                Container(color: theme.colorScheme.surface),
                          )
                        else
                          Container(color: theme.colorScheme.surface),
                        Positioned(
                          top: 8,
                          left: 8,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.black54,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              'Sponsored',
                              style: TextStyle(
                                fontSize: 10,
                                color: _sponsoredColor(context),
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                ad.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface,
                ),
              ),
            ],
          ),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
    );
  }
}
