import 'package:flutter/material.dart';

class ContentCarousel extends StatefulWidget {
  final String title;
  final List<Widget> children;
  final double height;

  const ContentCarousel({
    super.key,
    required this.title,
    required this.children,
    this.height = 240,
  });

  @override
  State<ContentCarousel> createState() => _ContentCarouselState();
}

class _ContentCarouselState extends State<ContentCarousel> {
  static const double _paddingStart = 16.0;
  static const double _gapWidth = 8.0;

  final _scrollController = ScrollController();
  final _firstItemKey = GlobalKey();
  double _cardWidth = 130.0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _measureCardWidth());
  }

  @override
  void didUpdateWidget(covariant ContentCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.children != widget.children) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _measureCardWidth());
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _measureCardWidth() {
    if (!_scrollController.hasClients || widget.children.isEmpty) return;
    final renderBox =
        _firstItemKey.currentContext?.findRenderObject() as RenderBox?;
    if (renderBox != null && renderBox.hasSize) {
      _cardWidth = renderBox.size.width;
      if (mounted) setState(() {});
    }
  }

  double get _itemExtent => _cardWidth + _gapWidth;

  @override
  Widget build(BuildContext context) {
    if (widget.children.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Text(
            widget.title,
            style: Theme.of(context).textTheme.titleLarge,
          ),
        ),
        SizedBox(
          height: widget.height,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            physics: _SnapScrollPhysics(
              itemExtent: _itemExtent,
              paddingStart: _paddingStart,
              parent: const ClampingScrollPhysics(),
            ),
            controller: _scrollController,
            itemCount: widget.children.length,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final child = index == 0
                  ? SizedBox(key: _firstItemKey, child: widget.children[index])
                  : widget.children[index];
              return AnimatedBuilder(
                animation: _scrollController,
                builder: (context, child) {
                  if (!_scrollController.hasClients) {
                    return child ?? const SizedBox.shrink();
                  }
                  final viewportWidth =
                      _scrollController.position.viewportDimension;
                  final cardCenter = _paddingStart +
                      index * _itemExtent +
                      _cardWidth / 2 -
                      _scrollController.offset;
                  final viewportCenter = viewportWidth / 2;
                  final distance = (cardCenter - viewportCenter).abs();
                  final maxDistance = viewportWidth / 2;
                  final t = (distance / maxDistance).clamp(0.0, 1.0);
                  const falloffStart = 0.375;
                  double scale;
                  double opacity;
                  if (t <= falloffStart) {
                    scale = 1.0;
                    opacity = 1.0;
                  } else {
                    final falloffT =
                        ((t - falloffStart) / (1 - falloffStart))
                            .clamp(0.0, 1.0);
                    scale = 1.0 - falloffT * 0.08;
                    opacity = 1.0 - falloffT * 0.4;
                  }
                  return Opacity(
                    opacity: opacity,
                    child: Transform.scale(
                      scale: scale,
                      alignment: Alignment.center,
                      child: child,
                    ),
                  );
                },
                child: child,
              );
            },
          ),
        ),
      ],
    );
  }
}

class _SnapScrollPhysics extends ScrollPhysics {
  final double itemExtent;
  final double paddingStart;

  const _SnapScrollPhysics({
    required this.itemExtent,
    required this.paddingStart,
    super.parent,
  });

  @override
  _SnapScrollPhysics applyTo(ScrollPhysics? ancestor) {
    return _SnapScrollPhysics(
      itemExtent: itemExtent,
      paddingStart: paddingStart,
      parent: buildParent(ancestor),
    );
  }

  @override
  Simulation? createBallisticSimulation(
    ScrollMetrics position,
    double velocity,
  ) {
    if (itemExtent <= 0) {
      return super.createBallisticSimulation(position, velocity);
    }

    final simulation = super.createBallisticSimulation(position, velocity);

    final target = simulation?.x(double.infinity) ?? position.pixels;

    final relativeOffset = target - paddingStart;
    final snappedIndex = (relativeOffset / itemExtent).round();
    final snapped =
        (paddingStart + snappedIndex * itemExtent)
            .clamp(position.minScrollExtent, position.maxScrollExtent);

    final tol = toleranceFor(position);
    if ((snapped - position.pixels).abs() < tol.distance) return null;

    return ScrollSpringSimulation(
      spring,
      position.pixels,
      snapped,
      velocity.clamp(-2000, 2000),
      tolerance: tol,
    );
  }
}
