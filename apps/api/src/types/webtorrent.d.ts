declare module "webtorrent" {
  export interface TorrentFile {
    name: string;
    path: string;
    length: number;
    downloaded: number;
    progress: number;
    createReadStream(options?: {
      start?: number;
      end?: number;
    }): import("node:stream").Readable;
  }

  export interface Torrent {
    name: string;
    infoHash: string;
    files: TorrentFile[];
  }

  export interface WebTorrentInstance {
    add(
      torrentId: string | Buffer,
      options?: Record<string, unknown>,
      cb?: (torrent: Torrent) => void,
    ): Torrent;
    destroy(cb?: (err?: Error) => void): void;
    on(event: "error", cb: (err: Error) => void): this;
  }

  export default class WebTorrent {
    constructor();
    add(
      torrentId: string | Buffer,
      options?: Record<string, unknown>,
      cb?: (torrent: Torrent) => void,
    ): Torrent;
    destroy(cb?: (err?: Error) => void): void;
    on(event: "error", cb: (err: Error) => void): this;
  }
}
