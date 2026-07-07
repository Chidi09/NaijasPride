import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class LocalProgressCache {
  static LocalProgressCache? _instance;
  late SharedPreferences _prefs;

  LocalProgressCache._();

  static Future<LocalProgressCache> getInstance() async {
    if (_instance == null) {
      _instance = LocalProgressCache._();
      _instance!._prefs = await SharedPreferences.getInstance();
    }
    return _instance!;
  }

  static const _pendingKeysKey = 'pending_progress_keys';

  Future<void> writeLocal(
    String contentKey,
    int progressSeconds,
    int durationSeconds,
  ) async {
    final entry = jsonEncode({
      'progressSeconds': progressSeconds,
      'durationSeconds': durationSeconds,
      'savedAtEpochMs': DateTime.now().millisecondsSinceEpoch,
    });
    await _prefs.setString(contentKey, entry);

    final keys = _prefs.getStringList(_pendingKeysKey) ?? [];
    if (!keys.contains(contentKey)) {
      keys.add(contentKey);
      await _prefs.setStringList(_pendingKeysKey, keys);
    }
  }

  Future<Map<String, dynamic>?> readLocal(String contentKey) async {
    final raw = _prefs.getString(contentKey);
    if (raw == null) return null;
    return jsonDecode(raw) as Map<String, dynamic>;
  }

  Future<void> clearLocal(String contentKey) async {
    await _prefs.remove(contentKey);
    final keys = _prefs.getStringList(_pendingKeysKey) ?? [];
    keys.remove(contentKey);
    await _prefs.setStringList(_pendingKeysKey, keys);
  }

  Future<List<String>> pendingKeys() async {
    return _prefs.getStringList(_pendingKeysKey) ?? [];
  }
}
