import 'package:flutter/services.dart';

class PipService {
  static const _channel = MethodChannel('naijaspride/pip');

  static Future<void> setEnabled(bool enabled) async {
    try {
      await _channel.invokeMethod('setPipEnabled', {'enabled': enabled});
    } catch (_) {}
  }

  static Future<void> enterNow() async {
    try {
      await _channel.invokeMethod('enterPipNow');
    } catch (_) {}
  }
}
