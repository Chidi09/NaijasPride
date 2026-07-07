import 'package:flutter/material.dart';

class ErrorStateView extends StatelessWidget {
  final VoidCallback onRetry;
  final String message;

  const ErrorStateView({
    super.key,
    required this.onRetry,
    this.message = 'Something went wrong',
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(message, style: theme.textTheme.bodyLarge),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: onRetry,
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}
