import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class PressableScale extends StatefulWidget {
  final Widget child;
  final Color? pressedColor;

  const PressableScale({
    super.key,
    required this.child,
    this.pressedColor,
  });

  @override
  State<PressableScale> createState() => _PressableScaleState();
}

class _PressableScaleState extends State<PressableScale> {
  bool _isPressed = false;

  void _setPressed(bool pressed) {
    setState(() => _isPressed = pressed);
    if (pressed) {
      HapticFeedback.lightImpact();
    } else {
      HapticFeedback.selectionClick();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerDown: (_) => _setPressed(true),
      onPointerUp: (_) => _setPressed(false),
      onPointerCancel: (_) => _setPressed(false),
      child: AnimatedScale(
        scale: _isPressed ? 0.95 : 1.0,
        duration: Duration(milliseconds: _isPressed ? 100 : 250),
        curve: _isPressed ? Curves.easeOut : Curves.easeOutCubic,
        child: AnimatedContainer(
          duration: Duration(milliseconds: _isPressed ? 100 : 250),
          decoration: BoxDecoration(
            color: _isPressed ? widget.pressedColor : null,
            borderRadius: BorderRadius.circular(8),
          ),
          child: widget.child,
        ),
      ),
    );
  }
}
