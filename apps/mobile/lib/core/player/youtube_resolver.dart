import 'package:youtube_explode_dart/youtube_explode_dart.dart';

Future<String> resolveYoutubeStreamUrl(String youtubeId) async {
  final client = YoutubeExplode();
  try {
    final manifest = await client.videos.streamsClient.getManifest(
      VideoId(youtubeId),
    );
    return manifest.muxed.withHighestBitrate().url.toString();
  } finally {
    client.close();
  }
}
