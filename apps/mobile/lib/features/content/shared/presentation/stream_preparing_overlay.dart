import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

class StreamPreparingOverlay extends StatefulWidget {
  final String title;
  final String? imageUrl;

  const StreamPreparingOverlay({super.key, required this.title, this.imageUrl});

  @override
  State<StreamPreparingOverlay> createState() => _StreamPreparingOverlayState();
}

class _StreamPreparingOverlayState extends State<StreamPreparingOverlay> {
  static const _stages = [
    'Finding source\u2026',
    'Connecting\u2026',
    'Almost there\u2026',
  ];
  int _stageIndex = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(milliseconds: 2500), (timer) {
      if (_stageIndex < _stages.length - 1) {
        setState(() => _stageIndex++);
      } else {
        _timer?.cancel();
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Stack(
      children: [
        if (widget.imageUrl != null)
          Positioned.fill(
            child: Image.network(
              widget.imageUrl!,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) =>
                  const SizedBox.shrink(),
            ),
          )
        else
          Container(color: theme.scaffoldBackgroundColor),
        if (widget.imageUrl != null)
          Positioned.fill(
            child: BackdropFilter(
              filter: ui.ImageFilter.blur(sigmaX: 12, sigmaY: 12),
              child: Container(color: Colors.transparent),
            ),
          ),
        Positioned.fill(child: Container(color: Colors.black.withAlpha(150))),
        Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  widget.title,
                  style: theme.textTheme.titleLarge?.copyWith(
                    color: Colors.white,
                    fontFamily: 'Cinzel',
                  ),
                  maxLines: 2,
                  textAlign: TextAlign.center,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 24),
                const SizedBox(
                  width: 180,
                  child: LinearProgressIndicator(minHeight: 3),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  height: 20,
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 300),
                    child: Text(
                      _stages[_stageIndex],
                      key: ValueKey(_stageIndex),
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: Colors.white70,
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
