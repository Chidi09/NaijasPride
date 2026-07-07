import 'dart:async';

import 'package:app_links/app_links.dart';

class AniListDeepLinkService {
  final _appLinks = AppLinks();
  StreamSubscription<Uri>? _subscription;
  final _codeController = StreamController<String>.broadcast();

  Stream<String> get onAuthCode => _codeController.stream;

  void initialize() {
    _subscription = _appLinks.uriLinkStream.listen((uri) {
      if (uri.scheme == 'naijaspride' && uri.host == 'anilist-callback') {
        final code = uri.queryParameters['code'];
        if (code != null) {
          _codeController.add(code);
        }
      }
    });
  }

  void dispose() {
    _subscription?.cancel();
    _codeController.close();
  }
}

final aniListDeepLinkService = AniListDeepLinkService();
