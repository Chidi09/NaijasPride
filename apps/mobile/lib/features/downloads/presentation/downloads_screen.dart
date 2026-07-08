import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/downloads/download_manager.dart';
import '../../../core/player/playback_source.dart';
import '../../../core/player/unified_video_player_screen.dart';
import '../../content/movies/data/movies_api.dart';

class DownloadsScreen extends ConsumerStatefulWidget {
  const DownloadsScreen({super.key});

  @override
  ConsumerState<DownloadsScreen> createState() => _DownloadsScreenState();
}

class _DownloadsScreenState extends ConsumerState<DownloadsScreen> {
  List<LocalDownloadRecord> _downloads = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadDownloads();
  }

  Future<void> _loadDownloads() async {
    setState(() => _isLoading = true);
    final records = await DownloadManager.instance.listDownloads();
    if (!mounted) return;
    setState(() {
      _downloads = records;
      _isLoading = false;
    });
  }

  Future<void> _removeDownload(LocalDownloadRecord record) async {
    await DownloadManager.instance.removeDownload(record.movieId);
    ref.read(moviesApiProvider).removeOffline(record.movieId);
    _loadDownloads();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Downloads')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _downloads.isEmpty
              ? Center(
                  child: Text(
                    'No downloads yet',
                    style: theme.textTheme.bodyLarge,
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadDownloads,
                  child: ListView.builder(
                    itemCount: _downloads.length,
                    itemBuilder: (context, index) {
                      final record = _downloads[index];
                      return _DownloadTile(
                        record: record,
                        onTap: () {
                          if (record.status == DownloadStatus.completed) {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => UnifiedVideoPlayerScreen(
                                  source: DirectPlaybackSource(
                                      record.localFilePath),
                                  title: record.title,
                                  progressTarget:
                                      MovieProgressTarget(record.movieId),
                                ),
                              ),
                            );
                          }
                        },
                        onDelete: () => _removeDownload(record),
                      );
                    },
                  ),
                ),
    );
  }
}

class _DownloadTile extends StatelessWidget {
  final LocalDownloadRecord record;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const _DownloadTile({
    required this.record,
    required this.onTap,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final isDownloading = record.status == DownloadStatus.downloading;
    final isCompleted = record.status == DownloadStatus.completed;

    String statusLabel;
    switch (record.status) {
      case DownloadStatus.queued:
        statusLabel = 'Queued';
        break;
      case DownloadStatus.downloading:
        statusLabel = 'Downloading';
        break;
      case DownloadStatus.completed:
        statusLabel = 'Downloaded';
        break;
      case DownloadStatus.failed:
        statusLabel = 'Failed';
        break;
    }

    return ListTile(
      leading: ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: SizedBox(
          width: 48,
          height: 64,
          child: record.posterUrl != null && record.posterUrl!.isNotEmpty
              ? CachedNetworkImage(
                  imageUrl: record.posterUrl!,
                  fit: BoxFit.cover,
                  errorWidget: (_, _, _) =>
                      const Icon(Icons.movie_outlined),
                  placeholder: (_, _) =>
                      const Icon(Icons.movie_outlined),
                )
              : const Icon(Icons.movie_outlined),
        ),
      ),
      title: Text(record.title, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: isDownloading
          ? LinearProgressIndicator(value: record.progress)
          : Text(statusLabel),
      trailing: IconButton(
        icon: const Icon(Icons.delete_outline),
        onPressed: onDelete,
      ),
      onTap: isCompleted ? onTap : null,
    );
  }
}
