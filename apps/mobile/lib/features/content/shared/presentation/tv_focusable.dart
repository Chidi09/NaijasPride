import 'package:flutter/material.dart';

/// Visible focus ring for D-pad/remote navigation, matching [PosterCard]'s
/// focus treatment. Material widgets like [ListTile] show only a faint
/// built-in focus overlay, easy to miss from couch viewing distance.
class TvFocusable extends StatefulWidget {
  final Widget child;
  final BorderRadius borderRadius;

  const TvFocusable({
    super.key,
    required this.child,
    this.borderRadius = const BorderRadius.all(Radius.circular(8)),
  });

  @override
  State<TvFocusable> createState() => _TvFocusableState();
}

class _TvFocusableState extends State<TvFocusable> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Focus(
      onFocusChange: (focused) => setState(() => _focused = focused),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        decoration: BoxDecoration(
          borderRadius: widget.borderRadius,
          border: Border.all(
            color: _focused ? primary : Colors.transparent,
            width: 2,
          ),
          boxShadow: _focused
              ? [
                  BoxShadow(
                    color: primary.withAlpha(100),
                    blurRadius: 8,
                    spreadRadius: 1,
                  ),
                ]
              : const [],
        ),
        child: widget.child,
      ),
    );
  }
}
