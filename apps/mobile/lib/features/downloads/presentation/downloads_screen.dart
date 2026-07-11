import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';

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
    final colors = theme.brightness == Brightness.light
        ? AppColors.light
        : AppColors.dark;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text('Downloads'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _downloads.isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.file_download_off,
                    size: 96,
                    color: colors.text.withAlpha(20),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'No downloads yet',
                    style: theme.textTheme.titleLarge?.copyWith(
                      color: colors.textStrong,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Start downloading your favorite\nmovies and shows',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: colors.text.withAlpha(100),
                      height: 1.5,
                    ),
                  ),
                ],
              ),
            )
          : RefreshIndicator(
              onRefresh: _loadDownloads,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: ListView.builder(
                  padding: const EdgeInsets.only(top: 8, bottom: 24),
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
                                  record.localFilePath,
                                ),
                                title: record.title,
                                progressTarget: MovieProgressTarget(
                                  record.movieId,
                                ),
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
    final theme = Theme.of(context);
    final colors = theme.brightness == Brightness.light
        ? AppColors.light
        : AppColors.dark;
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

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: isCompleted ? onTap : null,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  width: 70,
                  height: 100,
                  child:
                      record.posterUrl != null && record.posterUrl!.isNotEmpty
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
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      record.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: colors.textStrong,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      isDownloading
                          ? '${(record.progress * 100).toInt()}%'
                          : statusLabel,
                      style: TextStyle(
                        color: colors.text.withAlpha(120),
                        fontSize: 13,
                      ),
                    ),
                    if (isDownloading) ...[
                      const SizedBox(height: 8),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: record.progress,
                          minHeight: 6,
                          backgroundColor: colors.surface,
                          valueColor: AlwaysStoppedAnimation(
                            Theme.of(context).colorScheme.primary,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Container(
                decoration: BoxDecoration(
                  color: colors.surface,
                  shape: BoxShape.circle,
                ),
                child: IconButton(
                  icon: const Icon(Icons.delete_outline, size: 20),
                  color: colors.text,
                  onPressed: onDelete,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
