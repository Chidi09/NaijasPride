import 'dart:async';
import 'dart:math' show min, max;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:screen_brightness/screen_brightness.dart';

import 'local_progress_cache.dart';
import 'pip_service.dart';
import 'playback_source.dart';
import 'watch_progress_api.dart';
import 'youtube_resolver.dart';
import '../../features/content/anime/data/anime_models.dart';

class UnifiedVideoPlayerScreen extends ConsumerStatefulWidget {
  final PlaybackSource source;
  final String title;
  final ProgressTarget? progressTarget;
  final String? nextEpisodeLabel;
  final VoidCallback? onNextEpisode;
  final AnimeSkipTimes? skipTimes;
  final bool restoreProgress;

  const UnifiedVideoPlayerScreen({
    super.key,
    required this.source,
    required this.title,
    this.progressTarget,
    this.nextEpisodeLabel,
    this.onNextEpisode,
    this.skipTimes,
    this.restoreProgress = true,
  });

  @override
  ConsumerState<UnifiedVideoPlayerScreen> createState() =>
      _UnifiedVideoPlayerScreenState();
}

class _UnifiedVideoPlayerScreenState
    extends ConsumerState<UnifiedVideoPlayerScreen> {
  Player? _player;
  VideoController? _controller;
  bool _isLoading = false;
  String? _error;

  Timer? _periodicTimer;
  StreamSubscription<Duration>? _positionSub;
  StreamSubscription<Duration>? _durationSub;
  Duration _lastSavedPosition = Duration.zero;
  Duration _lastKnownPosition = Duration.zero;
  Duration _lastKnownDuration = Duration.zero;

  // Gesture state
  Offset? _lastTapPosition;
  double _seekIndicatorOpacity = 0.0;
  IconData _seekIndicatorIcon = Icons.replay_10;
  double _brightnessValue = 0.8;
  double _volumeValue = 100.0;
  double _levelIndicatorOpacity = 0.0;
  bool _isBrightnessAdjustment = true;
  Timer? _levelIndicatorTimer;
  double _swipeDismissDy = 0.0;
  bool _isSwipeDismissMode = false;
  bool _hasPopped = false;
  bool _isLongPressing = false;

  bool _showNextEpisodeCountdown = false;
  bool _nextEpisodeCountdownDismissed = false;
  int _countdownSeconds = 5;
  Timer? _countdownTimer;

  bool _showSkipIntro = false;
  bool _showSkipOutro = false;

  // Subtitle styling state
  double _subtitleFontSize = 32.0;
  double _subtitleOutlineWidth = 1.0;
  double _subtitleBackgroundOpacity = 0.6;

  @override
  void initState() {
    super.initState();
    _initPlayback();
  }

  Future<void> _initPlayback() async {
    final source = widget.source;
    if (source is UnresolvedPlaybackSource) return;

    setState(() {
      _isLoading = true;
      _error = null;
    });

    Player? player;
    try {
      String mediaUrl;
      Map<String, String>? httpHeaders;

      if (source is DirectPlaybackSource) {
        mediaUrl = source.url;
        httpHeaders = source.headers;
      } else if (source is YoutubePlaybackSource) {
        mediaUrl = await resolveYoutubeStreamUrl(source.youtubeId);
        httpHeaders = null;
      } else {
        return;
      }

      player = Player();
      await player.open(
        Media(mediaUrl, httpHeaders: httpHeaders),
        play: true,
      );

      if (!mounted) {
        player.dispose();
        return;
      }

      setState(() {
        _player = player;
        _controller = VideoController(player!);
        _isLoading = false;
      });
      PipService.setEnabled(true);

      if (widget.restoreProgress) await _restoreProgress(player);
      _startAutosave(player);
      _flushPendingProgress();
    } catch (e) {
      player?.dispose();
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _restoreProgress(Player player) async {
    final target = widget.progressTarget;
    if (target == null) return;

    final api = ref.read(watchProgressApiProvider);

    if (target is MovieProgressTarget) {
      final result = await api.getMovieProgress(target.movieId);
      if (result == null) return;
      final progress = result.progress;
      final duration = result.duration;
      if (progress > 10 &&
          (duration <= 0 || duration - progress > 15)) {
        await player.seek(Duration(seconds: progress));
      }
    } else if (target is AnimeProgressTarget) {
      final result =
          await api.getAnimeEpisodeProgress(target.anilistId, target.episodeNumber);
      if (result == null) return;
      final progress = result.progress;
      final duration = result.duration;
      if (progress > 10 &&
          (duration <= 0 || duration - progress > 15)) {
        await player.seek(Duration(seconds: progress));
      }
    } else if (target is TvProgressTarget) {
      final result = await api.getTvProgress(target.showId);
      if (result == null) return;
      if (result.episodeId != target.episodeId) return;
      final progress = result.progress;
      final duration = result.duration;
      if (progress > 10 &&
          (duration <= 0 || duration - progress > 15)) {
        await player.seek(Duration(seconds: progress));
      }
    }
  }

  void _startAutosave(Player player) {
    _durationSub = player.stream.duration.listen((dur) {
      _lastKnownDuration = dur;
    });

    _positionSub = player.stream.position.listen((pos) {
      _lastKnownPosition = pos;
      _tryTriggerNextEpisodeCountdown();
      _updateSkipButtonVisibility();
    });

    final target = widget.progressTarget;
    if (target == null) return;

    if (target is MovieProgressTarget) {
      _periodicTimer = Timer.periodic(const Duration(seconds: 5), (_) {
        if (_lastKnownPosition != _lastSavedPosition) {
          _saveProgress(target);
        }
        _flushPendingProgress();
      });
    } else if (target is AnimeProgressTarget) {
      _periodicTimer = Timer.periodic(const Duration(seconds: 15), (_) {
        if (_lastKnownPosition.inSeconds - _lastSavedPosition.inSeconds >
            10) {
          _saveProgress(target);
        }
        _flushPendingProgress();
      });
    } else if (target is TvProgressTarget) {
      _periodicTimer = Timer.periodic(const Duration(seconds: 15), (_) {
        if (_lastKnownPosition.inSeconds - _lastSavedPosition.inSeconds >
            10) {
          _saveProgress(target);
        }
        _flushPendingProgress();
      });
    }
  }

  void _saveProgress(ProgressTarget target) {
    final player = _player;
    if (player == null) return;

    final pos = _lastKnownPosition.inSeconds;
    final dur = _lastKnownDuration.inSeconds;

    String contentKey;
    if (target is MovieProgressTarget) {
      contentKey = 'movie:${target.movieId}';
    } else if (target is AnimeProgressTarget) {
      contentKey = 'anime:${target.anilistId}:${target.episodeNumber}';
    } else if (target is TvProgressTarget) {
      contentKey = 'tv:${target.showId}:${target.episodeId}';
    } else {
      return;
    }

    _writeLocalProgress(contentKey, pos, dur);
    _syncProgressToServer(target, contentKey, pos, dur);

    _lastSavedPosition = _lastKnownPosition;
  }

  Future<void> _writeLocalProgress(
    String contentKey,
    int pos,
    int dur,
  ) async {
    final cache = await LocalProgressCache.getInstance();
    await cache.writeLocal(contentKey, pos, dur);
  }

  Future<void> _syncProgressToServer(
    ProgressTarget target,
    String contentKey,
    int pos,
    int dur,
  ) async {
    final api = ref.read(watchProgressApiProvider);
    bool success = false;
    if (target is MovieProgressTarget) {
      success = await api.saveMovieProgress(target.movieId, pos, dur);
    } else if (target is AnimeProgressTarget) {
      success = await api.saveAnimeProgress(
        anilistId: target.anilistId,
        episodeNumber: target.episodeNumber,
        title: target.title,
        imageUrl: target.imageUrl,
        progressSeconds: pos,
        durationSeconds: dur,
      );
    } else if (target is TvProgressTarget) {
      success = await api.saveTvProgress(
        showId: target.showId,
        episodeId: target.episodeId,
        seasonNumber: target.seasonNumber,
        episodeNumber: target.episodeNumber,
        progressSeconds: pos,
        durationSeconds: dur,
      );
    }
    if (!success) return;
    final cache = await LocalProgressCache.getInstance();
    await cache.clearLocal(contentKey);
  }

  Future<void> _flushPendingProgress() async {
    final cache = await LocalProgressCache.getInstance();
    final api = ref.read(watchProgressApiProvider);
    final keys = await cache.pendingKeys();
    for (final key in keys) {
      final entry = await cache.readLocal(key);
      if (entry == null) continue;
      final pos = entry['progressSeconds'] as int;
      final dur = entry['durationSeconds'] as int;
      try {
        bool success = false;
        if (key.startsWith('movie:')) {
          final movieId = key.substring(6);
          success = await api.saveMovieProgress(movieId, pos, dur);
        } else if (key.startsWith('anime:')) {
          final parts = key.split(':');
          if (parts.length >= 3) {
            final anilistId = int.parse(parts[1]);
            final episodeNumber = int.parse(parts[2]);
            success = await api.saveAnimeProgress(
              anilistId: anilistId,
              episodeNumber: episodeNumber,
              title: '',
              imageUrl: null,
              progressSeconds: pos,
              durationSeconds: dur,
            );
          }
        } else if (key.startsWith('tv:')) {
          final parts = key.split(':');
          if (parts.length >= 3) {
            final showId = parts[1];
            final episodeId = parts[2];
            success = await api.saveTvProgress(
              showId: showId,
              episodeId: episodeId,
              seasonNumber: 0,
              episodeNumber: 0,
              progressSeconds: pos,
              durationSeconds: dur,
            );
          }
        }
        if (success) await cache.clearLocal(key);
      } catch (_) {}
    }
  }

  void _tryTriggerNextEpisodeCountdown() {
    if (!mounted) return;
    if (_showNextEpisodeCountdown || _nextEpisodeCountdownDismissed) return;
    if (widget.onNextEpisode == null) return;
    if (_lastKnownDuration <= Duration.zero ||
        _lastKnownPosition <= Duration.zero) {
      return;
    }

    final ratio =
        _lastKnownPosition.inSeconds / _lastKnownDuration.inSeconds;
    if (ratio >= 0.85) {
      setState(() {
        _showNextEpisodeCountdown = true;
        _countdownSeconds = 5;
      });
      _countdownTimer?.cancel();
      _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) {
          _countdownTimer?.cancel();
          return;
        }
        setState(() {
          _countdownSeconds--;
          if (_countdownSeconds <= 0) {
            _countdownTimer?.cancel();
            _countdownTimer = null;
            widget.onNextEpisode!();
          }
        });
      });
    }
  }

  void _updateSkipButtonVisibility() {
    final skip = widget.skipTimes;
    if (skip == null) return;
    final posSec = _lastKnownPosition.inSeconds;

    final op = skip.op;
    final showIntro = op != null && posSec >= op.start && posSec < op.end;
    final ed = skip.ed;
    final showOutro = ed != null && posSec >= ed.start && posSec < ed.end;

    if (showIntro != _showSkipIntro || showOutro != _showSkipOutro) {
      setState(() {
        _showSkipIntro = showIntro;
        _showSkipOutro = showOutro;
      });
    }
  }

  // --- Gesture handlers ---

  void _onDoubleTapDown(TapDownDetails details) {
    _lastTapPosition = details.localPosition;
  }

  void _onDoubleTap() {
    if (_player == null || _lastTapPosition == null) return;
    final renderBox = context.findRenderObject() as RenderBox;
    final size = renderBox.size;
    final isLeftHalf = _lastTapPosition!.dx < size.width / 2;
    final currentSeconds = _lastKnownPosition.inSeconds;
    final durationSeconds = _lastKnownDuration.inSeconds;

    int newSeconds;
    if (isLeftHalf) {
      newSeconds = max(0, currentSeconds - 10);
      _seekIndicatorIcon = Icons.replay_10;
    } else {
      newSeconds = min(durationSeconds, currentSeconds + 10);
      _seekIndicatorIcon = Icons.forward_10;
    }
    _player!.seek(Duration(seconds: newSeconds));

    setState(() => _seekIndicatorOpacity = 1.0);
    Future.delayed(const Duration(milliseconds: 600), () {
      if (mounted) setState(() => _seekIndicatorOpacity = 0.0);
    });
  }

  void _onLongPressStart(LongPressStartDetails details) {
    _player?.setRate(2.0);
    setState(() => _isLongPressing = true);
  }

  void _onLongPressEnd(LongPressEndDetails details) {
    _player?.setRate(1.0);
    if (mounted) setState(() => _isLongPressing = false);
  }

  void _onLongPressCancel() {
    _player?.setRate(1.0);
    if (mounted) setState(() => _isLongPressing = false);
  }

  void _onVerticalDragStart(DragStartDetails details) {
    final renderBox = context.findRenderObject() as RenderBox;
    final localPos = renderBox.globalToLocal(details.globalPosition);
    final size = renderBox.size;

    if (localPos.dy < size.height * 0.15) {
      _isSwipeDismissMode = true;
      _swipeDismissDy = 0.0;
      _hasPopped = false;
      return;
    }

    _isSwipeDismissMode = false;
    _isBrightnessAdjustment = localPos.dx < size.width / 2;
    _levelIndicatorTimer?.cancel();
    setState(() => _levelIndicatorOpacity = 1.0);
  }

  void _onVerticalDragUpdate(DragUpdateDetails details) {
    if (_isSwipeDismissMode && !_hasPopped) {
      _swipeDismissDy += details.delta.dy;
      if (_swipeDismissDy > 100) {
        _hasPopped = true;
        Navigator.of(context).pop();
      }
      return;
    }

    if (_isSwipeDismissMode) return;

    final normalizedDelta = -details.delta.dy / 300;
    if (_isBrightnessAdjustment) {
      _brightnessValue = (_brightnessValue + normalizedDelta).clamp(0.0, 1.0);
      ScreenBrightness.instance.setApplicationScreenBrightness(_brightnessValue);
    } else {
      _volumeValue = (_volumeValue + normalizedDelta * 100).clamp(0.0, 100.0);
      _player?.setVolume(_volumeValue);
    }
    setState(() {});
  }

  void _onVerticalDragEnd(DragEndDetails details) {
    if (!_isSwipeDismissMode) {
      _levelIndicatorTimer?.cancel();
      _levelIndicatorTimer = Timer(const Duration(milliseconds: 800), () {
        if (mounted) setState(() => _levelIndicatorOpacity = 0.0);
      });
    }
  }

  // --- Overlay widgets ---

  Widget _buildSeekIndicator() {
    return AnimatedOpacity(
      opacity: _seekIndicatorOpacity,
      duration: const Duration(milliseconds: 200),
      child: IgnorePointer(
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            decoration: BoxDecoration(
              color: Colors.black54,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(_seekIndicatorIcon, color: Colors.white, size: 28),
                const SizedBox(width: 8),
                const Text('10s',
                    style: TextStyle(color: Colors.white, fontSize: 20)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLevelIndicator() {
    return AnimatedOpacity(
      opacity: _levelIndicatorOpacity,
      duration: const Duration(milliseconds: 200),
      child: IgnorePointer(
        child: Align(
          alignment:
              _isBrightnessAdjustment ? Alignment.centerLeft : Alignment.centerRight,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  _isBrightnessAdjustment ? Icons.brightness_6 : Icons.volume_up,
                  color: Colors.white,
                  size: 24,
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: 4,
                  height: 100,
                  child: Stack(
                    children: [
                      Container(
                        decoration: BoxDecoration(
                          color: Colors.white24,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      FractionallySizedBox(
                        alignment: Alignment.bottomCenter,
                        heightFactor: _isBrightnessAdjustment
                            ? _brightnessValue
                            : _volumeValue / 100.0,
                        child: Container(
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSpeedBadge() {
    return Positioned(
      top: 8,
      right: 8,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: Colors.black54,
          borderRadius: BorderRadius.circular(6),
        ),
        child: const Text(
          '2x',
          style: TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }

  Widget _buildNextEpisodeCountdown() {
    return Positioned(
      bottom: 16,
      right: 16,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.black54,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              widget.nextEpisodeLabel ?? 'Next Episode',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '$_countdownSeconds',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 36,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  _countdownTimer?.cancel();
                  _countdownTimer = null;
                  widget.onNextEpisode!();
                },
                child: const Text('Play Now'),
              ),
            ),
            Align(
              alignment: Alignment.centerRight,
              child: IconButton(
                icon: const Icon(Icons.close, color: Colors.white, size: 20),
                onPressed: () {
                  _countdownTimer?.cancel();
                  _countdownTimer = null;
                  setState(() {
                    _showNextEpisodeCountdown = false;
                    _nextEpisodeCountdownDismissed = true;
                  });
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSkipButton({required String label, required VoidCallback onTap}) {
    return Positioned(
      bottom: 16,
      left: 16,
      child: ElevatedButton(
        onPressed: onTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.black54,
          foregroundColor: Colors.white,
        ),
        child: Text(label),
      ),
    );
  }

  SubtitleViewConfiguration _buildSubtitleConfig() {
    final List<Shadow> shadows = [];
    final double o = _subtitleOutlineWidth;
    if (o > 0) {
      shadows.addAll([
        Shadow(offset: Offset(-o, -o), color: Colors.black, blurRadius: 0),
        Shadow(offset: Offset(o, -o), color: Colors.black, blurRadius: 0),
        Shadow(offset: Offset(-o, o), color: Colors.black, blurRadius: 0),
        Shadow(offset: Offset(o, o), color: Colors.black, blurRadius: 0),
        Shadow(offset: Offset(0, -o), color: Colors.black, blurRadius: 0),
        Shadow(offset: Offset(0, o), color: Colors.black, blurRadius: 0),
        Shadow(offset: Offset(-o, 0), color: Colors.black, blurRadius: 0),
        Shadow(offset: Offset(o, 0), color: Colors.black, blurRadius: 0),
      ]);
    }
    final int bgAlpha =
        (_subtitleBackgroundOpacity * 255).round().clamp(0, 255);
    return SubtitleViewConfiguration(
      style: TextStyle(
        fontSize: _subtitleFontSize,
        color: Colors.white,
        shadows: shadows,
        backgroundColor: Color.fromARGB(bgAlpha, 0, 0, 0),
      ),
    );
  }

  void _showSubtitleSettings() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.grey[900],
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            return Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Subtitle Settings',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 24),
                  _buildSlider(
                    label: 'Font Size',
                    value: _subtitleFontSize,
                    min: 16,
                    max: 64,
                    divisions: 48,
                    displayValue: '${_subtitleFontSize.round()}',
                    onChanged: (v) {
                      setSheetState(() => _subtitleFontSize = v);
                      setState(() {});
                    },
                  ),
                  _buildSlider(
                    label: 'Outline',
                    value: _subtitleOutlineWidth,
                    min: 0,
                    max: 4,
                    divisions: 40,
                    displayValue: _subtitleOutlineWidth.toStringAsFixed(1),
                    onChanged: (v) {
                      setSheetState(() => _subtitleOutlineWidth = v);
                      setState(() {});
                    },
                  ),
                  _buildSlider(
                    label: 'Background Opacity',
                    value: _subtitleBackgroundOpacity,
                    min: 0,
                    max: 1,
                    divisions: 20,
                    displayValue:
                        (_subtitleBackgroundOpacity * 100).round().toString(),
                    onChanged: (v) {
                      setSheetState(() => _subtitleBackgroundOpacity = v);
                      setState(() {});
                    },
                  ),
                  const SizedBox(height: 8),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildSlider({
    required String label,
    required double value,
    required double min,
    required double max,
    required int divisions,
    required String displayValue,
    required ValueChanged<double> onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: const TextStyle(color: Colors.white70)),
              Text(displayValue, style: const TextStyle(color: Colors.white)),
            ],
          ),
          Slider(
            value: value,
            min: min,
            max: max,
            divisions: divisions,
            activeColor: Colors.white,
            inactiveColor: Colors.white24,
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }

  Widget _buildVideoWithGestures(Widget video) {
    return Stack(
      fit: StackFit.expand,
      children: [
        video,
        GestureDetector(
          onDoubleTapDown: _onDoubleTapDown,
          onDoubleTap: _onDoubleTap,
          onLongPressStart: _onLongPressStart,
          onLongPressEnd: _onLongPressEnd,
          onLongPressCancel: _onLongPressCancel,
          onVerticalDragStart: _onVerticalDragStart,
          onVerticalDragUpdate: _onVerticalDragUpdate,
          onVerticalDragEnd: _onVerticalDragEnd,
          behavior: HitTestBehavior.translucent,
        ),
        _buildSeekIndicator(),
        _buildLevelIndicator(),
        if (_isLongPressing) _buildSpeedBadge(),
        if (_showNextEpisodeCountdown) _buildNextEpisodeCountdown(),
        if (_showSkipIntro)
          _buildSkipButton(
            label: 'Skip Intro',
            onTap: () {
              _player?.seek(Duration(seconds: widget.skipTimes!.op!.end));
              setState(() => _showSkipIntro = false);
            },
          ),
        if (_showSkipOutro)
          _buildSkipButton(
            label: 'Skip Outro',
            onTap: () {
              _player?.seek(Duration(seconds: widget.skipTimes!.ed!.end));
              setState(() => _showSkipOutro = false);
            },
          ),
      ],
    );
  }

  @override
  void dispose() {
    PipService.setEnabled(false);
    final target = widget.progressTarget;
    if (target != null && _player != null) {
      _saveProgress(target);
    }
    _periodicTimer?.cancel();
    _positionSub?.cancel();
    _durationSub?.cancel();
    _levelIndicatorTimer?.cancel();
    _countdownTimer?.cancel();
    _player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final source = widget.source;
    if (source is UnresolvedPlaybackSource) {
      return Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          title: Text(widget.title),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.info_outline,
                    color: Colors.white70, size: 48),
                const SizedBox(height: 16),
                Text(
                  source.reason,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white70, fontSize: 16),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Back'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: Text(widget.title),
        actions: [
          IconButton(
            icon: const Icon(Icons.subtitles, color: Colors.white70),
            onPressed: _showSubtitleSettings,
          ),
          IconButton(
            icon: const Icon(Icons.picture_in_picture_alt, color: Colors.white70),
            onPressed: () => PipService.enterNow(),
            tooltip: 'Picture-in-picture',
          ),
        ],
      ),
      body: Center(
        child: _isLoading
            ? const CircularProgressIndicator(color: Colors.white)
            : _error != null
                ? _ErrorView(
                    error: _error!,
                    onRetry: _initPlayback,
                  )
                : _controller != null
                    ? _buildVideoWithGestures(Video(controller: _controller!, subtitleViewConfiguration: _buildSubtitleConfig()))
                    : const SizedBox.shrink(),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String error;
  final VoidCallback onRetry;

  const _ErrorView({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
          const SizedBox(height: 16),
          Text(
            error,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white70, fontSize: 14),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}
