import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

enum AuthEvent { unauthenticated }

final authEventsProvider = Provider<StreamController<AuthEvent>>((ref) {
  final controller = StreamController<AuthEvent>.broadcast();
  ref.onDispose(controller.close);
  return controller;
});
