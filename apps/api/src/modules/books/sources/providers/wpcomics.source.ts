import { WpComicsBaseSource } from '../base/wpcomics.base';

export class WpComicsSource extends WpComicsBaseSource {
  readonly id: string;
  readonly displayName: string;

  constructor(options: { id: string; displayName: string; baseUrl: string; listPath?: string }) {
    super({
      baseUrl: options.baseUrl,
      cachePrefix: options.id,
      listPath: options.listPath,
      defaultCacheTtlSeconds: 600,
    });

    this.id = options.id;
    this.displayName = options.displayName;
  }
}
