import 'package:flutter/material.dart';

class QualityOption {
  final String label;
  final String url;
  const QualityOption({required this.label, required this.url});
}

/// Shows a picker when there's an actual choice to make; returns the chosen
/// URL immediately without prompting when there's only one (or zero)
/// options, so the common case stays a single tap like before.
Future<String?> pickQualityOrDefault(
  BuildContext context,
  List<QualityOption> options,
) async {
  if (options.isEmpty) return null;
  if (options.length == 1) return options.first.url;

  return showModalBottomSheet<String>(
    context: context,
    builder: (context) {
      return SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Choose quality',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
            ),
            ...options.map(
              (o) => ListTile(
                title: Text(o.label),
                onTap: () => Navigator.of(context).pop(o.url),
              ),
            ),
          ],
        ),
      );
    },
  );
}
