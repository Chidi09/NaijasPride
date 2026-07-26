import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class AppBackButton extends StatelessWidget {
  final Color? color;

  const AppBackButton({super.key, this.color});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(Icons.arrow_back, color: color),
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

/// [AppBackButton] with a dark glass scrim behind it, for use on a transparent
/// [SliverAppBar] pinned over hero art.
class ScrimAppBackButton extends StatelessWidget {
  const ScrimAppBackButton({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(6),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.black.withAlpha(160),
          shape: BoxShape.circle,
          border: Border.all(
            color: Colors.white.withAlpha(40),
            width: 0.8,
          ),
        ),
        child: const AppBackButton(color: Colors.white),
      ),
    );
  }
}
