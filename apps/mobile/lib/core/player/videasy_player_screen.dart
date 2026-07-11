import 'dart:async';
import 'dart:collection';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'embed_stream_extractor.dart' show embedOrigin, wrapperHtmlFor;
import 'playback_source.dart';
import 'watch_progress_api.dart';

class VideasyPlayerScreen extends ConsumerStatefulWidget {
  final String videasyUrl;
  final String title;
  final ProgressTarget? progressTarget;

  const VideasyPlayerScreen({
    super.key,
    required this.videasyUrl,
    required this.title,
    this.progressTarget,
  });

  @override
  ConsumerState<VideasyPlayerScreen> createState() =>
      _VideasyPlayerScreenState();
}

const String _videasyProgressBridgeJs = r'''
(function() {
  if (window.__nsProgressBridge) return;
  window.__nsProgressBridge = true;
  window.addEventListener('message', function(event) {
    try {
      var payload = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
      if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
        window.flutter_inappwebview.callHandler('nsProgress', payload);
      }
    } catch (e) {}
  });
})();
''';

class _VideasyPlayerScreenState extends ConsumerState<VideasyPlayerScreen>
    with WidgetsBindingObserver {
  int _lastPositionSeconds = 0;
  int _lastDurationSeconds = 0;
  DateTime? _lastSavedAt;
  bool _dirty = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  void _onProgressMessage(String raw) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return;
      final ts = (decoded['timestamp'] as num?)?.toInt();
      final dur = (decoded['duration'] as num?)?.toInt();
      if (ts == null || dur == null || dur <= 0) return;
      _lastPositionSeconds = ts;
      _lastDurationSeconds = dur;
      _dirty = true;
      final now = DateTime.now();
      if (_lastSavedAt == null ||
          now.difference(_lastSavedAt!).inSeconds >= 15) {
        _lastSavedAt = now;
        _persistProgress();
      }
    } catch (_) {}
  }

  Future<void> _persistProgress() async {
    final target = widget.progressTarget;
    if (target == null || !_dirty) return;
    _dirty = false;
    final api = ref.read(watchProgressApiProvider);
    if (target is MovieProgressTarget) {
      await api.saveMovieProgress(
        target.movieId,
        _lastPositionSeconds,
        _lastDurationSeconds,
      );
    } else if (target is AnimeProgressTarget) {
      await api.saveAnimeProgress(
        anilistId: target.anilistId,
        episodeNumber: target.episodeNumber,
        title: target.title,
        imageUrl: target.imageUrl,
        progressSeconds: _lastPositionSeconds,
        durationSeconds: _lastDurationSeconds,
      );
    } else if (target is TvProgressTarget) {
      await api.saveTvProgress(
        showId: target.showId,
        episodeId: target.episodeId,
        seasonNumber: target.seasonNumber,
        episodeNumber: target.episodeNumber,
        progressSeconds: _lastPositionSeconds,
        durationSeconds: _lastDurationSeconds,
      );
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      _persistProgress();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _persistProgress();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) _persistProgress();
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          title: Text(widget.title),
        ),
        body: InAppWebView(
          initialData: InAppWebViewInitialData(
            data: wrapperHtmlFor(widget.videasyUrl),
            baseUrl: WebUri(embedOrigin),
          ),
          initialSettings: InAppWebViewSettings(
            javaScriptEnabled: true,
            mediaPlaybackRequiresUserGesture: false,
            mixedContentMode: MixedContentMode.MIXED_CONTENT_ALWAYS_ALLOW,
            thirdPartyCookiesEnabled: true,
          ),
          initialUserScripts: UnmodifiableListView<UserScript>([
            UserScript(
              source: _videasyProgressBridgeJs,
              injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
              forMainFrameOnly: true,
            ),
          ]),
          onWebViewCreated: (controller) {
            controller.addJavaScriptHandler(
              handlerName: 'nsProgress',
              callback: (args) {
                if (args.isNotEmpty && args.first is String) {
                  _onProgressMessage(args.first as String);
                }
              },
            );
          },
        ),
      ),
    );
  }
}
