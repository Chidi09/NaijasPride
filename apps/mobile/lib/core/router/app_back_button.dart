import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class AppBackButton extends StatelessWidget {
  const AppBackButton({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.arrow_back),
      onPressed: () {
        if (context.canPop()) {
          context.pop();
        } else {
          context.go('/');
        }
      },
    );
  }
}

/// [AppBackButton] with a dark scrim behind it, for use on a transparent
/// [SliverAppBar] pinned over hero art — without it the arrow can vanish
/// against light backgrounds.
class ScrimAppBackButton extends StatelessWidget {
  const ScrimAppBackButton({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(4),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.black.withAlpha(90),
          shape: BoxShape.circle,
        ),
        child: const AppBackButton(),
      ),
    );
  }
}
