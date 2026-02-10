import { ZeistMangaBaseSource } from '../base/zeistmanga.base';

export class ZeistMangaSource extends ZeistMangaBaseSource {
  readonly id: string;
  readonly displayName: string;

  constructor(options: {
    id: string;
    displayName: string;
    baseUrl: string;
    seriesFeedLabel?: string;
    maxResults?: number;
  }) {
    super({
      baseUrl: options.baseUrl,
      cachePrefix: options.id,
      seriesFeedLabel: options.seriesFeedLabel,
      maxResults: options.maxResults,
      defaultCacheTtlSeconds: 600,
    });

    this.id = options.id;
    this.displayName = options.displayName;
  }
}
