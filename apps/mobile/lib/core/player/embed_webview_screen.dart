import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import 'embed_stream_extractor.dart'
    show desktopUserAgent, embedOrigin, wrapperHtmlFor;

class EmbedSource {
  final String url;
  final String label;
  const EmbedSource({required this.url, required this.label});
}

class EmbedWebViewScreen extends StatefulWidget {
  final List<EmbedSource> sources;
  final int initialIndex;
  final String title;

  const EmbedWebViewScreen({
    super.key,
    required this.sources,
    this.initialIndex = 0,
    required this.title,
  });

  @override
  State<EmbedWebViewScreen> createState() => _EmbedWebViewScreenState();
}

class _EmbedWebViewScreenState extends State<EmbedWebViewScreen> {
  late int _currentIndex;
  InAppWebViewController? _webViewController;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    if (_currentIndex < 0 || _currentIndex >= widget.sources.length) {
      _currentIndex = 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.sources.isEmpty) {
      return Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(title: Text(widget.title)),
        body: const Center(child: Text('No sources available', style: TextStyle(color: Colors.white))),
      );
    }

    final currentSource = widget.sources[_currentIndex];

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: Text(widget.title),
        actions: [
          if (widget.sources.length > 1)
            PopupMenuButton<int>(
              icon: const Icon(Icons.dns_outlined),
              tooltip: 'Change Server',
              onSelected: (index) {
                if (index != _currentIndex) {
                  setState(() => _currentIndex = index);
                  _webViewController?.loadData(
                    data: wrapperHtmlFor(widget.sources[index].url),
                    baseUrl: WebUri(embedOrigin),
                  );
                }
              },
              itemBuilder: (context) {
                return List.generate(widget.sources.length, (i) {
                  return PopupMenuItem<int>(
                    value: i,
                    child: Text(
                      widget.sources[i].label,
                      style: TextStyle(
                        color: i == _currentIndex ? Colors.blue : null,
                        fontWeight: i == _currentIndex ? FontWeight.bold : null,
                      ),
                    ),
                  );
                });
              },
            ),
        ],
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
              initialData: InAppWebViewInitialData(
                data: wrapperHtmlFor(currentSource.url),
                baseUrl: WebUri(embedOrigin),
              ),
              onWebViewCreated: (controller) {
                _webViewController = controller;
              },
              initialSettings: InAppWebViewSettings(
                javaScriptEnabled: true,
                mediaPlaybackRequiresUserGesture: false,
                userAgent: desktopUserAgent,
                mixedContentMode: MixedContentMode.MIXED_CONTENT_ALWAYS_ALLOW,
                thirdPartyCookiesEnabled: true,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
