import 'dart:async';

import 'package:flutter_inappwebview/flutter_inappwebview.dart';

class ExtractedEmbedStream {
  final String url;
  final String? referer;

  const ExtractedEmbedStream({required this.url, this.referer});
}

final RegExp _mediaUrlPattern =
    RegExp(r'\.(m3u8|mp4)(\?|$)', caseSensitive: false);

Future<ExtractedEmbedStream?> extractStreamFromEmbed(
  String embedUrl, {
  Duration timeout = const Duration(seconds: 8),
}) async {
  final completer = Completer<ExtractedEmbedStream?>();
  HeadlessInAppWebView? headlessWebView;
  Timer? timeoutTimer;

  void finish(ExtractedEmbedStream? result) {
    if (!completer.isCompleted) {
      timeoutTimer?.cancel();
      completer.complete(result);
    }
  }

  headlessWebView = HeadlessInAppWebView(
    initialUrlRequest: URLRequest(url: WebUri(embedUrl)),
    initialSettings: InAppWebViewSettings(
      javaScriptEnabled: true,
      useShouldInterceptRequest: true,
      mediaPlaybackRequiresUserGesture: false,
    ),
    shouldInterceptRequest: (controller, request) async {
      final url = request.url.toString();
      if (_mediaUrlPattern.hasMatch(url)) {
        finish(ExtractedEmbedStream(url: url, referer: embedUrl));
      }
      return null;
    },
  );

  await headlessWebView.run();
  timeoutTimer = Timer(timeout, () => finish(null));

  final result = await completer.future;
  await headlessWebView.dispose();
  return result;
}
