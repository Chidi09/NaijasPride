import { MmrcmsBaseSource } from '../base/mmrcms.base';

export class MmrcmsSource extends MmrcmsBaseSource {
  readonly id: string;
  readonly displayName: string;

  constructor(options: {
    id: string;
    displayName: string;
    baseUrl: string;
    listPath?: string;
    tagPath?: string;
    updatedCoverSuffix?: string;
    detailStatusSelector?: string;
    detailTagSelector?: string;
  }) {
    super({
      baseUrl: options.baseUrl,
      cachePrefix: options.id,
      listPath: options.listPath,
      tagPath: options.tagPath,
      updatedCoverSuffix: options.updatedCoverSuffix,
      detailStatusSelector: options.detailStatusSelector,
      detailTagSelector: options.detailTagSelector,
      defaultCacheTtlSeconds: 600,
    });

    this.id = options.id;
    this.displayName = options.displayName;
  }
}
