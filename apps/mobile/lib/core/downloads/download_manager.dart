import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:background_downloader/background_downloader.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum DownloadStatus { queued, downloading, completed, failed }

class LocalDownloadRecord {
  final String movieId;
  final String title;
  final String? posterUrl;
  final String quality;
  final String localFilePath;
  final DownloadStatus status;
  final double progress;

  const LocalDownloadRecord({
    required this.movieId,
    required this.title,
    this.posterUrl,
    required this.quality,
    required this.localFilePath,
    required this.status,
    this.progress = 0.0,
  });

  Map<String, dynamic> toJson() => {
        'movieId': movieId,
        'title': title,
        'posterUrl': posterUrl,
        'quality': quality,
        'localFilePath': localFilePath,
        'status': status.name,
        'progress': progress,
      };

  factory LocalDownloadRecord.fromJson(Map<String, dynamic> json) {
    return LocalDownloadRecord(
      movieId: json['movieId'] as String? ?? '',
      title: json['title'] as String? ?? '',
      posterUrl: json['posterUrl'] as String?,
      quality: json['quality'] as String? ?? '',
      localFilePath: json['localFilePath'] as String? ?? '',
      status: DownloadStatus.values.firstWhere(
        (s) => s.name == json['status'],
        orElse: () => DownloadStatus.failed,
      ),
      progress: (json['progress'] as num?)?.toDouble() ?? 0.0,
    );
  }

  LocalDownloadRecord copyWith({
    DownloadStatus? status,
    double? progress,
    String? localFilePath,
  }) {
    return LocalDownloadRecord(
      movieId: movieId,
      title: title,
      posterUrl: posterUrl,
      quality: quality,
      localFilePath: localFilePath ?? this.localFilePath,
      status: status ?? this.status,
      progress: progress ?? this.progress,
    );
  }
}

class DownloadManager {
  DownloadManager._() {
    _initUpdatesListener();
  }
  static final DownloadManager instance = DownloadManager._();

  static const _indexKey = 'offline_movie_ids';

  StreamSubscription<TaskUpdate>? _subscription;
  final Map<String, void Function(double)?> _progressCallbacks = {};

  Future<SharedPreferences> get _prefs => SharedPreferences.getInstance();

  void _initUpdatesListener() {
    _subscription = FileDownloader().updates.listen((update) async {
      final taskId = update.task.taskId;
      if (update is TaskStatusUpdate) {
        if (update.status == TaskStatus.complete) {
          final record = await getRecord(taskId);
          if (record != null) {
            await _writeRecord(
                record.copyWith(status: DownloadStatus.completed, progress: 1.0));
          }
        } else if (update.status == TaskStatus.failed ||
            update.status == TaskStatus.canceled) {
          final record = await getRecord(taskId);
          if (record != null) {
            await _writeRecord(record.copyWith(status: DownloadStatus.failed));
          }
        }
        _progressCallbacks.remove(taskId);
      } else if (update is TaskProgressUpdate) {
        _progressCallbacks[taskId]?.call(update.progress);
        final record = await getRecord(taskId);
        if (record != null) {
          await _writeRecord(record.copyWith(
              status: DownloadStatus.downloading, progress: update.progress));
        }
      }
    });
  }

  Future<List<String>> _movieIds() async {
    final prefs = await _prefs;
    return prefs.getStringList(_indexKey) ?? [];
  }

  Future<void> _addMovieId(String movieId) async {
    final prefs = await _prefs;
    final ids = prefs.getStringList(_indexKey) ?? [];
    if (!ids.contains(movieId)) {
      ids.add(movieId);
      await prefs.setStringList(_indexKey, ids);
    }
  }

  Future<void> _removeMovieId(String movieId) async {
    final prefs = await _prefs;
    final ids = prefs.getStringList(_indexKey) ?? [];
    ids.remove(movieId);
    await prefs.setStringList(_indexKey, ids);
  }

  Future<void> _writeRecord(LocalDownloadRecord record) async {
    final prefs = await _prefs;
    await prefs.setString(
        'offline_movie:${record.movieId}', jsonEncode(record.toJson()));
    await _addMovieId(record.movieId);
  }

  Future<LocalDownloadRecord?> getRecord(String movieId) async {
    final prefs = await _prefs;
    final raw = prefs.getString('offline_movie:$movieId');
    if (raw == null) return null;
    return LocalDownloadRecord.fromJson(
        jsonDecode(raw) as Map<String, dynamic>);
  }

  Future<List<LocalDownloadRecord>> listDownloads() async {
    final ids = await _movieIds();
    final records = <LocalDownloadRecord>[];
    for (final id in ids) {
      final record = await getRecord(id);
      if (record != null) records.add(record);
    }
    return records;
  }

  Future<void> startDownload({
    required String movieId,
    required String title,
    String? posterUrl,
    required String quality,
    required String fileUrl,
    void Function(double progress)? onProgress,
  }) async {
    final dir = await getApplicationDocumentsDirectory();
    final fileName = '$movieId.mp4';

    await _writeRecord(LocalDownloadRecord(
      movieId: movieId,
      title: title,
      posterUrl: posterUrl,
      quality: quality,
      localFilePath: '${dir.path}/$fileName',
      status: DownloadStatus.queued,
    ));

    _progressCallbacks[movieId] = onProgress;

    final task = DownloadTask(
      taskId: movieId,
      url: fileUrl,
      filename: fileName,
      baseDirectory: BaseDirectory.applicationDocuments,
      updates: Updates.statusAndProgress,
    );

    await FileDownloader().enqueue(task);
  }

  Future<void> cancelDownload(String movieId) async {
    await FileDownloader().cancelTaskWithId(movieId);
  }

  Future<void> removeDownload(String movieId) async {
    final record = await getRecord(movieId);
    if (record != null) {
      try {
        final file = File(record.localFilePath);
        if (await file.exists()) await file.delete();
      } catch (_) {}
    }
    final prefs = await _prefs;
    await prefs.remove('offline_movie:$movieId');
    await _removeMovieId(movieId);
  }

  void dispose() {
    _subscription?.cancel();
    _subscription = null;
  }
}
