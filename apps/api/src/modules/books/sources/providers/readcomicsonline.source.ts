import { MmrcmsSource } from "./mmrcms.source";

export class ReadComicsOnlineSource extends MmrcmsSource {
  constructor() {
    super({
      id: "readcomicsonline",
      displayName: "ReadComicsOnline.ru",
      baseUrl: "https://readcomicsonline.ru",
      detailStatusSelector: 'dt:contains("Status")',
      detailTagSelector: 'dt:contains("Categories")',
    });
  }
}
