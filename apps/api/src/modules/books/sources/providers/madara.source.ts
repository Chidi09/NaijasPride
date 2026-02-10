import { MadaraBaseSource } from '../base/madara.base';

export class MadaraSource extends MadaraBaseSource {
  readonly id: string;
  readonly displayName: string;

  constructor(options: { id: string; displayName: string; baseUrl: string }) {
    super({
      baseUrl: options.baseUrl,
      cachePrefix: options.id,
      defaultCacheTtlSeconds: 600,
    });

    this.id = options.id;
    this.displayName = options.displayName;
  }
}
