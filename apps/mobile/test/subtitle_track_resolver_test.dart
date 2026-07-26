import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naijaspride_mobile/core/player/subtitles_api.dart';

/// A Dio that fails loudly if anything reaches the network, so a test that
/// expects a pass-through proves it made no request rather than merely
/// returning the right string.
class _NoNetworkDio with DioMixin implements Dio {
  bool wasCalled = false;

  @override
  Future<Response<T>> get<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    ProgressCallback? onReceiveProgress,
  }) {
    wasCalled = true;
    throw StateError('network reached for $path');
  }
}

void main() {
  group('SubtitleTrackResolver', () {
    test('passes an absolute URL straight through', () async {
      // Most providers hand back a directly linkable file. Downloading those
      // ourselves would add a round trip and a copy for no gain.
      final dio = _NoNetworkDio();
      final resolver = SubtitleTrackResolver(dio);

      final result = await resolver.resolve('https://subs.example/en.vtt');

      expect(result, 'https://subs.example/en.vtt');
      expect(dio.wasCalled, isFalse);
    });

    test('passes a non-http scheme through untouched', () async {
      final resolver = SubtitleTrackResolver(_NoNetworkDio());

      expect(
        await resolver.resolve('file:///data/user/0/subs/en.vtt'),
        'file:///data/user/0/subs/en.vtt',
      );
    });

    test(
      'returns null when a track that needs fetching cannot be fetched',
      () async {
        // An API-relative URL is one only this app can fetch, because the route
        // behind it requires a bearer token the player cannot send. A failure
        // has to surface as "no track" rather than as a URL the player will
        // silently fail to open.
        final resolver = SubtitleTrackResolver(_NoNetworkDio());

        expect(
          await resolver.resolve('/api/v1/subtitles/opensubtitles/42/download'),
          isNull,
        );
      },
    );
  });
}
