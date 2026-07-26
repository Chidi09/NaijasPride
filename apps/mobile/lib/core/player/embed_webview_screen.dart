import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'embed_stream_extractor.dart'
    show
        adBlockerRules,
        blockedAdResourceResponse,
        desktopUserAgent,
        dynamicAdGuardJs,
        embedOrigin,
        embedProgressBridgeJs,
        evaluateNavigationTarget,
        isAdOrTrackerUrl,
        isBlockedEmbedDocumentRequest,
        isLikelySubtitleUrl,
        isSameSiteUrl,
        subtitleLabelFor,
        withResumeProgress,
        wrapperHtmlFor,
        mediaSnifferJs,
        isLikelyMediaStreamUrl;
import 'playback_source.dart';
import 'progress_recorder.dart';
import 'unified_video_player_screen.dart';
import 'watch_progress_api.dart';
import '../build_flavor.dart';
import '../../features/content/shared/presentation/tv_focusable.dart';
import '../../features/content/anime/data/anime_models.dart';

class EmbedSource {
  final String url;
  final String label;
  const EmbedSource({required this.url, required this.label});
}

/// Preference key for the strict-ad-blocking (iframe sandbox) opt-in. Off by
/// default — see [wrapperHtmlFor] for why turning it on stops most movie and
/// TV providers from playing at all.
const String _strictAdBlockingPrefKey = 'embed_strict_ad_blocking';

/// Network failures that mean the provider's host is genuinely unreachable
/// (dead domain, geo-block, TLS failure) rather than one of the many
/// transient per-resource errors a busy embed page throws while working
/// perfectly well. Only these auto-advance to the next server — treating
/// every error as fatal would skip past servers that are playing fine.
final Set<WebResourceErrorType> _fatalNetworkErrors = {
  WebResourceErrorType.HOST_LOOKUP,
  WebResourceErrorType.CANNOT_CONNECT_TO_HOST,
  WebResourceErrorType.SERVER_UNREACHABLE,
  WebResourceErrorType.TIMEOUT,
  WebResourceErrorType.FAILED_SSL_HANDSHAKE,
  WebResourceErrorType.SECURE_CONNECTION_FAILED,
  WebResourceErrorType.TOO_MANY_REDIRECTS,
  WebResourceErrorType.REDIRECT_FAILED,
  WebResourceErrorType.UNSAFE_RESOURCE,
};

class EmbedWebViewScreen extends ConsumerStatefulWidget {
  final List<EmbedSource> sources;
  final int initialIndex;
  final String title;
  final List<AnimeWatchSubtitle>? subtitles;

  /// What to record playback position against. When set, the screen relays
  /// the embed player's own `postMessage` telemetry into the same watch
  /// history the native player writes, and resumes where it left off.
  final ProgressTarget? progressTarget;

  const EmbedWebViewScreen({
    super.key,
    required this.sources,
    this.initialIndex = 0,
    required this.title,
    this.subtitles,
    this.progressTarget,
  });

  @override
  ConsumerState<EmbedWebViewScreen> createState() => _EmbedWebViewScreenState();
}

class _EmbedWebViewScreenState extends ConsumerState<EmbedWebViewScreen> {
  /// How long to wait before offering a one-tap way out. Deliberately a
  /// *hint*, not an auto-advance: plenty of embeds play fine in the WebView
  /// without ever exposing a sniffable stream, so silence here is not proof
  /// of failure. It exists because the previous version gave no signal at
  /// all — a server that quietly rendered nothing left a black rectangle and
  /// a switcher hidden behind an unlabelled icon.
  static const Duration _switchHintDelay = Duration(seconds: 9);

  late int _currentIndex;
  InAppWebViewController? _webViewController;
  String? _detectedStream;

  Timer? _hintTimer;
  bool _showSwitchHint = false;

  /// Set when a server fails outright and there is nothing left to advance
  /// to, so the whole screen becomes a picker instead of a black rectangle.
  bool _allServersFailed = false;
  String? _failureReason;

  /// Servers already written off, so auto-advance walks the list once
  /// instead of ping-ponging between two dead ones.
  final Set<int> _deadServers = <int>{};

  /// Resolved before the first load so the resume position can be baked into
  /// the provider URL — the player seeks on init from a query parameter, and
  /// there is no way to drive it afterwards across the frame boundary.
  int _resumeSeconds = 0;
  bool _resumeResolved = false;

  int _lastRecordedSeconds = -1;

  /// Opt-in iframe sandbox. Off by default because most movie/TV providers
  /// refuse to play inside a sandboxed frame at all.
  bool _strictAdBlocking = false;

  /// Subtitle tracks seen going past on the wire. A sniffed stream arrives
  /// with no track list, so without this the native player has no subtitles
  /// whenever the embed fallback is what produced the stream.
  final Map<String, AnimeWatchSubtitle> _sniffedSubtitles = {};

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    if (_currentIndex < 0 || _currentIndex >= widget.sources.length) {
      _currentIndex = 0;
    }
    _resolveResumePoint();
  }

  @override
  void dispose() {
    _hintTimer?.cancel();
    // Android keeps a detached WebView's media playing until the instance is
    // actually collected, so backing out of a running embed leaves its audio
    // over whatever is opened next. Tearing the page down first is what
    // actually stops the sound.
    final controller = _webViewController;
    _webViewController = null;
    if (controller != null) {
      unawaited(_teardownWebView(controller));
    }
    super.dispose();
  }

  static Future<void> _teardownWebView(
    InAppWebViewController controller,
  ) async {
    try {
      await controller.stopLoading();
      await controller.loadData(data: '<html><body></body></html>');
      await controller.pause();
    } catch (_) {
      // Best effort: the platform view may already be gone.
    }
  }

  /// Bridge tracks win when there are any — they arrive labelled with a real
  /// language — and sniffed ones fill in when there are none.
  List<AnimeWatchSubtitle>? get _effectiveSubtitles {
    final provided = widget.subtitles;
    if (provided != null && provided.isNotEmpty) return provided;
    if (_sniffedSubtitles.isEmpty) return provided;
    return _sniffedSubtitles.values.toList();
  }

  bool get _tracksProgress => widget.progressTarget != null;

  EmbedSource get _currentSource => widget.sources[_currentIndex];

  /// The URL actually handed to the WebView, resume position included.
  String get _currentLoadUrl =>
      withResumeProgress(_currentSource.url, _resumeSeconds);

  /// Resolved before the first load, alongside the resume point, so the very
  /// first document already has the right sandbox state — toggling it later
  /// costs a reload.
  Future<void> _resolveResumePoint() async {
    final target = widget.progressTarget;
    if (target != null) {
      final seconds = await resumePositionSeconds(
        api: ref.read(watchProgressApiProvider),
        target: target,
      );
      if (seconds != null) _resumeSeconds = seconds;
    }
    try {
      final prefs = await SharedPreferences.getInstance();
      _strictAdBlocking = prefs.getBool(_strictAdBlockingPrefKey) ?? false;
    } catch (_) {
      _strictAdBlocking = false;
    }
    if (!mounted) return;
    setState(() => _resumeResolved = true);
    _armHintTimer();
  }

  Future<void> _setStrictAdBlocking(bool value) async {
    if (value == _strictAdBlocking) return;
    setState(() => _strictAdBlocking = value);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_strictAdBlockingPrefKey, value);
    } catch (_) {
      // A failed write only costs the preference not sticking.
    }
    _reloadCurrent();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          value
              ? 'Strict ad blocking on. Some providers refuse to play with it '
                    'enabled — switch server or turn it back off if nothing '
                    'loads.'
              : 'Strict ad blocking off.',
        ),
      ),
    );
  }

  void _reloadCurrent() {
    _sniffedSubtitles.clear();
    _webViewController?.loadData(
      data: wrapperHtmlFor(
        _currentLoadUrl,
        strictAdBlocking: _strictAdBlocking,
      ),
      baseUrl: WebUri(embedOrigin),
    );
    _armHintTimer();
  }

  void _armHintTimer() {
    _hintTimer?.cancel();
    if (widget.sources.length < 2) return;
    _hintTimer = Timer(_switchHintDelay, () {
      if (!mounted || _detectedStream != null || _allServersFailed) return;
      setState(() => _showSwitchHint = true);
    });
  }

  void _onProgressTick(double position, double duration, String event) {
    final target = widget.progressTarget;
    if (target == null) return;
    final pos = position.floor();
    final dur = duration.floor();
    if (dur <= 0 || pos < 0 || pos > dur) return;
    if (pos == _lastRecordedSeconds) return;
    _lastRecordedSeconds = pos;
    recordProgress(
      api: ref.read(watchProgressApiProvider),
      target: target,
      positionSeconds: pos,
      durationSeconds: dur,
    );
  }

  /// Called when a server is proven dead (unreachable host, or an HTTP error
  /// status on its own document).
  void _markServerFailed(String reason) {
    if (!mounted || _allServersFailed) return;
    _deadServers.add(_currentIndex);

    final next = _nextUntriedServer();
    if (next != null) {
      // Move on without being asked: the whole point of carrying several
      // servers is that the user shouldn't have to discover a switcher to
      // get past a dead one.
      _switchTo(next);
      return;
    }
    _hintTimer?.cancel();
    setState(() {
      _allServersFailed = true;
      _failureReason = reason;
    });
  }

  int? _nextUntriedServer() {
    for (var i = 0; i < widget.sources.length; i++) {
      if (!_deadServers.contains(i)) return i;
    }
    return null;
  }

  void _switchTo(int index) {
    if (index < 0 || index >= widget.sources.length) return;
    setState(() {
      _currentIndex = index;
      _detectedStream = null;
      _showSwitchHint = false;
      _allServersFailed = false;
      _failureReason = null;
    });
    // Carries the resume position across a server switch: the new provider
    // starts where the dead one left off rather than back at zero.
    if (_lastRecordedSeconds > 0) _resumeSeconds = _lastRecordedSeconds;
    _reloadCurrent();
  }

  void _tryServer(int index) {
    _deadServers.remove(index);
    _switchTo(index);
  }

  /// True when [url] is the current server failing, rather than some
  /// unrelated third-party resource on the page (an ad host we blocked, an
  /// analytics beacon) that has no bearing on whether the video will play.
  bool _isCurrentServer(WebUri? url, bool? isForMainFrame) {
    if (isForMainFrame == true) return true;
    if (url == null) return false;
    return isSameSiteUrl(url.toString(), _currentSource.url);
  }

  Future<void> _playInApp() async {
    final stream = _detectedStream;
    if (stream == null) return;

    // Suspend the embed before leaving. Without this the WebView keeps
    // running behind the pushed route and its audio plays over the native
    // player.
    await _setEmbedSuspended(true);
    if (!mounted) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => UnifiedVideoPlayerScreen(
          source: DirectPlaybackSource(
            stream,
            headers: {
              'Referer': _currentSource.url,
              'User-Agent': desktopUserAgent,
            },
          ),
          title: widget.title,
          subtitles: _effectiveSubtitles,
          progressTarget: widget.progressTarget,
        ),
      ),
    );
    if (!mounted) return;
    await _setEmbedSuspended(false);
  }

  Future<void> _setEmbedSuspended(bool suspended) async {
    final controller = _webViewController;
    if (controller == null) return;
    try {
      if (suspended) {
        await controller.pause();
        await controller.pauseTimers();
      } else {
        await controller.resumeTimers();
        await controller.resume();
      }
    } catch (_) {
      // Android-only APIs; nothing to do where the platform lacks them.
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.sources.isEmpty) {
      return Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(title: Text(widget.title)),
        body: const Center(
          child: Text(
            'No sources available',
            style: TextStyle(color: Colors.white),
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
          _strictAdBlockingToggle(),
          if (widget.sources.length > 1) _serverMenu(),
        ],
      ),
      floatingActionButton: _detectedStream != null
          ? FloatingActionButton.extended(
              onPressed: _playInApp,
              icon: const Icon(Icons.play_arrow),
              label: const Text('Play in app'),
            )
          : null,
      body: Column(
        children: [
          _statusBar(),
          if (_showSwitchHint && !_allServersFailed) _switchHintBar(),
          Expanded(
            child: Stack(
              children: [
                Positioned.fill(
                  child: _resumeResolved
                      ? _webView()
                      : const ColoredBox(
                          color: Colors.black,
                          child: Center(
                            child: CircularProgressIndicator(
                              color: Colors.white,
                            ),
                          ),
                        ),
                ),
                if (_allServersFailed) Positioned.fill(child: _failurePanel()),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Exposed rather than forced on, because the trade-off genuinely has two
  /// sides: the sandbox is the only thing that can stop an embed navigating
  /// itself to an ad, and it is also the reason a provider will show its
  /// "remove the sandbox attribute" page instead of a video.
  Widget _strictAdBlockingToggle() {
    final button = IconButton(
      icon: Icon(
        _strictAdBlocking ? Icons.shield : Icons.shield_outlined,
        color: _strictAdBlocking ? Colors.lightBlueAccent : null,
      ),
      tooltip: _strictAdBlocking
          ? 'Strict ad blocking on — tap to turn off if nothing plays'
          : 'Strict ad blocking off — tap if you are seeing ads',
      onPressed: () => _setStrictAdBlocking(!_strictAdBlocking),
    );
    return _maybeFocusable(button);
  }

  Widget _serverMenu() {
    final menu = PopupMenuButton<int>(
      icon: const Icon(Icons.dns_outlined),
      tooltip: 'Change server',
      onSelected: _tryServer,
      itemBuilder: (context) {
        return List.generate(widget.sources.length, (i) {
          final isCurrent = i == _currentIndex;
          final isDead = _deadServers.contains(i) && !isCurrent;
          return PopupMenuItem<int>(
            value: i,
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.sources[i].label,
                    style: TextStyle(
                      color: isCurrent
                          ? Colors.blue
                          : isDead
                          ? Colors.grey
                          : null,
                      fontWeight: isCurrent ? FontWeight.bold : null,
                    ),
                  ),
                ),
                if (isDead)
                  const Icon(Icons.error_outline, size: 16, color: Colors.grey),
              ],
            ),
          );
        });
      },
    );
    return isTvBuild ? TvFocusable(child: menu) : menu;
  }

  Widget _statusBar() {
    final buffer = StringBuffer(
      'Server ${_currentIndex + 1} of ${widget.sources.length} · '
      '${_currentSource.label} — compatibility mode',
    );
    if (_tracksProgress) {
      buffer.write(', so remote-control support is unavailable');
      if (_resumeSeconds > 0) {
        buffer.write('. Resuming from ${_formatDuration(_resumeSeconds)}');
      }
      buffer.write('.');
    } else {
      buffer.write(
        ', so resume progress and remote-control support are unavailable.',
      );
    }

    return Container(
      width: double.infinity,
      color: Colors.orange.withAlpha(40),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Text(
        buffer.toString(),
        style: const TextStyle(color: Colors.orangeAccent, fontSize: 12),
      ),
    );
  }

  static String _formatDuration(int seconds) {
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    final s = seconds % 60;
    final mm = m.toString().padLeft(2, '0');
    final ss = s.toString().padLeft(2, '0');
    return h > 0 ? '$h:$mm:$ss' : '$m:$ss';
  }

  Widget _switchHintBar() {
    final next = _nextServerAfterCurrent();
    return Container(
      width: double.infinity,
      color: Colors.white10,
      padding: const EdgeInsets.only(left: 16, right: 8, top: 4, bottom: 4),
      child: Row(
        children: [
          const Expanded(
            child: Text(
              'Nothing playing?',
              style: TextStyle(color: Colors.white70, fontSize: 12),
            ),
          ),
          _maybeFocusable(
            TextButton(
              onPressed: () => _tryServer(next),
              child: Text('Try ${widget.sources[next].label}'),
            ),
          ),
        ],
      ),
    );
  }

  int _nextServerAfterCurrent() => (_currentIndex + 1) % widget.sources.length;

  Widget _failurePanel() {
    final reason = _failureReason ?? 'This server didn’t load.';
    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off, color: Colors.white38, size: 44),
              const SizedBox(height: 16),
              Text(
                reason,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 15),
              ),
              const SizedBox(height: 8),
              const Text(
                'Every server has been tried. Pick one to try again — these '
                'providers come and go, so one that just failed often works a '
                'moment later.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white54, fontSize: 13),
              ),
              const SizedBox(height: 24),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (var i = 0; i < widget.sources.length; i++)
                    _serverChip(i),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _serverChip(int index) {
    return _maybeFocusable(
      ActionChip(
        label: Text(widget.sources[index].label),
        avatar: Icon(
          index == _currentIndex ? Icons.refresh : Icons.play_arrow,
          size: 16,
        ),
        onPressed: () => _tryServer(index),
      ),
      borderRadius: const BorderRadius.all(Radius.circular(20)),
    );
  }

  Widget _maybeFocusable(
    Widget child, {
    BorderRadius borderRadius = const BorderRadius.all(Radius.circular(8)),
  }) {
    if (!isTvBuild) return child;
    return TvFocusable(borderRadius: borderRadius, child: child);
  }

  Widget _webView() {
    return InAppWebView(
      initialData: InAppWebViewInitialData(
        data: wrapperHtmlFor(
          _currentLoadUrl,
          strictAdBlocking: _strictAdBlocking,
        ),
        baseUrl: WebUri(embedOrigin),
      ),
      initialUserScripts: UnmodifiableListView<UserScript>([
        UserScript(
          source: dynamicAdGuardJs,
          injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
          forMainFrameOnly: false,
        ),
        UserScript(
          source: mediaSnifferJs,
          injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
          forMainFrameOnly: false,
        ),
        // Main frame only: this one listens for the messages the provider
        // posts *up* from inside the iframe, so it belongs in the wrapper.
        UserScript(
          source: embedProgressBridgeJs,
          injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
          forMainFrameOnly: true,
        ),
      ]),
      onWebViewCreated: (controller) {
        _webViewController = controller;
        controller.addJavaScriptHandler(
          handlerName: 'nsMedia',
          callback: (args) {
            if (args.isNotEmpty && args.first is String) {
              final u = args.first as String;
              if (mounted && isLikelyMediaStreamUrl(u)) {
                _hintTimer?.cancel();
                setState(() {
                  _detectedStream ??= u;
                  _showSwitchHint = false;
                });
              }
            }
          },
        );
        controller.addJavaScriptHandler(
          handlerName: 'nsSubtitle',
          callback: (args) {
            if (!mounted || args.isEmpty || args.first is! String) return;
            final url = args.first as String;
            if (!isLikelySubtitleUrl(url)) return;
            if (_sniffedSubtitles.containsKey(url)) return;
            setState(() {
              _sniffedSubtitles[url] = AnimeWatchSubtitle(
                url: url,
                lang: subtitleLabelFor(url),
              );
            });
          },
        );
        controller.addJavaScriptHandler(
          handlerName: 'nsProgress',
          callback: (args) {
            if (!mounted || args.length < 2) return;
            final position = (args[0] as num?)?.toDouble();
            final duration = (args[1] as num?)?.toDouble();
            if (position == null || duration == null) return;
            final event = args.length > 2 ? '${args[2]}' : '';
            _onProgressTick(position, duration, event);
          },
        );
      },
      shouldOverrideUrlLoading: (controller, navigationAction) async {
        // Blocks the "tap anywhere hijacks the whole page to an ad/
        // scam site" pattern that content blockers can't touch,
        // since that's a navigation, not a blockable resource load.
        final url = navigationAction.request.url?.toString();
        if (url == null) return NavigationActionPolicy.ALLOW;
        return evaluateNavigationTarget(url, embedUrl: _currentSource.url);
      },
      onCreateWindow: (controller, createWindowAction) async {
        // This screen only ever needs to show the current embed —
        // never let it spawn a popup/new tab.
        return false;
      },
      shouldInterceptRequest: (controller, request) async {
        final url = request.url.toString();
        if (isAdOrTrackerUrl(url)) return blockedAdResourceResponse();
        if (isBlockedEmbedDocumentRequest(
          url,
          isForMainFrame: request.isForMainFrame == true,
        )) {
          return blockedAdResourceResponse();
        }
        return null;
      },
      onReceivedError: (controller, request, error) {
        // The embed runs inside an iframe, so a dead provider surfaces as a
        // *sub-frame* error against its own host, never a main-frame one.
        if (!mounted) return;
        if (!_fatalNetworkErrors.contains(error.type)) return;
        if (!_isCurrentServer(request.url, request.isForMainFrame)) return;
        _markServerFailed(
          '“${_currentSource.label}” couldn’t be reached '
          '(${error.description}).',
        );
      },
      onReceivedHttpError: (controller, request, response) {
        if (!mounted) return;
        final status = response.statusCode ?? 0;
        if (status < 400) return;
        if (!_isCurrentServer(request.url, request.isForMainFrame)) return;
        _markServerFailed(
          '“${_currentSource.label}” returned an error ($status).',
        );
      },
      initialSettings: InAppWebViewSettings(
        javaScriptEnabled: true,
        useShouldInterceptRequest: true,
        useShouldOverrideUrlLoading: true,
        mediaPlaybackRequiresUserGesture: false,
        userAgent: desktopUserAgent,
        mixedContentMode: MixedContentMode.MIXED_CONTENT_ALWAYS_ALLOW,
        thirdPartyCookiesEnabled: true,
        supportMultipleWindows: false,
        javaScriptCanOpenWindowsAutomatically: false,
        contentBlockers: adBlockerRules,
      ),
    );
  }
}
