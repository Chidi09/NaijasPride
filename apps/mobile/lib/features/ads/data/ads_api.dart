import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/base_api.dart';

class AdCreative {
  final String id;
  final String placement;
  final String title;
  final String? imageUrl;
  final String? targetUrl;
  final String? ctaLabel;

  const AdCreative({
    required this.id,
    required this.placement,
    required this.title,
    this.imageUrl,
    this.targetUrl,
    this.ctaLabel,
  });

  factory AdCreative.fromJson(Map<String, dynamic> json) {
    return AdCreative(
      id: json['id'] as String,
      placement: json['placement'] as String,
      title: json['title'] as String,
      imageUrl: json['imageUrl'] as String?,
      targetUrl: json['targetUrl'] as String?,
      ctaLabel: json['ctaLabel'] as String?,
    );
  }
}

class AdsApi extends BaseApi {
  AdsApi(super.dio);

  Future<List<AdCreative>> slots(String placement, {int limit = 3}) async {
    try {
      final body = await get(
        '/api/v1/ads',
        queryParameters: {'placement': placement, 'limit': limit},
      );
      final data =
          (body['data'] as List<dynamic>?)
              ?.map((e) => AdCreative.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [];
      return data;
    } catch (_) {
      return const [];
    }
  }
}

final adsApiProvider = Provider<AdsApi>(
  (ref) => AdsApi(ref.watch(dioProvider)),
);

final adSlotsProvider = FutureProvider.family<List<AdCreative>, String>((
  ref,
  placement,
) {
  return ref.watch(adsApiProvider).slots(placement);
});
