import 'package:flutter/material.dart';

const List<String> kWatchStatuses = [
  'WATCHING',
  'PLAN_TO_WATCH',
  'ON_HOLD',
  'COMPLETED',
  'DROPPED',
];

String watchStatusLabel(String status) {
  switch (status) {
    case 'WATCHING':
      return 'Watching';
    case 'PLAN_TO_WATCH':
      return 'Plan to Watch';
    case 'ON_HOLD':
      return 'On Hold';
    case 'COMPLETED':
      return 'Completed';
    case 'DROPPED':
      return 'Dropped';
    default:
      return status;
  }
}

Future<String?> showStatusPicker(BuildContext context, {String? current}) {
  return showModalBottomSheet<String>(
    context: context,
    builder: (context) {
      return SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: kWatchStatuses.map((s) {
            return ListTile(
              title: Text(watchStatusLabel(s)),
              trailing: s == current ? const Icon(Icons.check) : null,
              onTap: () => Navigator.of(context).pop(s),
            );
          }).toList(),
        ),
      );
    },
  );
}
