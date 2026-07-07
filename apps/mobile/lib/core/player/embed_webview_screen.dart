import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

class EmbedWebViewScreen extends StatelessWidget {
  final String embedUrl;
  final String title;

  const EmbedWebViewScreen({
    super.key,
    required this.embedUrl,
    required this.title,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: Text(title),
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            color: Colors.orange.withAlpha(40),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: const Text(
              'Playing in compatibility mode — some features like resume progress and remote-control support are unavailable.',
              style: TextStyle(color: Colors.orangeAccent, fontSize: 12),
            ),
          ),
          Expanded(
            child: InAppWebView(
              initialUrlRequest: URLRequest(url: WebUri(embedUrl)),
              initialSettings: InAppWebViewSettings(
                javaScriptEnabled: true,
                mediaPlaybackRequiresUserGesture: false,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
