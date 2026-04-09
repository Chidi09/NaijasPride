import type { PrismaClient } from '@prisma/client';
import { NotificationType } from '@prisma/client';
import { torrentQueue } from '../../shared/services/queue.service.js';

interface YtsTorrent { hash: string; quality: string; seeds: number; }
interface YtsMovie { title: string; torrents: YtsTorrent[]; }
interface YtsResponse { data?: { movies?: YtsMovie[] }; }

interface EztvTorrent { filename: string; magnet_url: string; seeds: number; size_bytes: string; }
interface EztvResponse { torrents?: EztvTorrent[]; }

const QUALITY_RANK: Record<string, number> = { '2160p': 4, '1080p': 3, '720p': 2, '480p': 1 };

function buildMagnet(hash: string, title: string): string {
  const trackers = [
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.openbittorrent.com:80',
    'udp://tracker.coppersurfer.tk:6969',
    'udp://glotorrents.pw:6969/announce',
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://torrent.gresille.org:80/announce',
    'udp://p4p.arenabg.com:1337',
    'udp://tracker.leechers-paradise.org:6969',
  ].map(t => `&tr=${encodeURIComponent(t)}`).join('');
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}${trackers}`;
}

export async function findMovieMagnet(imdbId: string, title: string): Promise<string | null> {
  try {
    const url = `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(imdbId)}&limit=5`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const json: YtsResponse = await res.json();
    const movies = json.data?.movies;
    if (!movies?.length) return null;

    // Pick best quality torrent by rank then seeds
    const torrents: Array<{ hash: string; quality: string; seeds: number }> = [];
    for (const m of movies) {
      for (const t of (m.torrents || [])) {
        torrents.push({ hash: t.hash, quality: t.quality, seeds: t.seeds });
      }
    }
    torrents.sort((a, b) => {
      const qa = QUALITY_RANK[a.quality] ?? 0;
      const qb = QUALITY_RANK[b.quality] ?? 0;
      if (qb !== qa) return qb - qa;
      return b.seeds - a.seeds;
    });

    const best = torrents[0];
    if (!best) return null;
    return buildMagnet(best.hash, title);
  } catch {
    return null;
  }
}

export async function findShowMagnet(imdbId: string): Promise<string | null> {
  try {
    // EZTV expects numeric imdb id (strip "tt" prefix)
    const numericId = imdbId.replace(/^tt/i, '');
    const url = `https://eztv.re/api/get-torrents?imdb_id=${numericId}&limit=10`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const json: EztvResponse = await res.json();
    const torrents = json.torrents;
    if (!torrents?.length) return null;

    // Sort by seeds desc, prefer season packs or latest episode
    const sorted = [...torrents].sort((a, b) => (b.seeds || 0) - (a.seeds || 0));
    return sorted[0].magnet_url || null;
  } catch {
    return null;
  }
}

export async function processDownloadRequest(
  prisma: PrismaClient,
  requestId: string,
): Promise<void> {
  const req = await prisma.downloadRequest.findUnique({
    where: { id: requestId },
    include: {
      movie: { select: { id: true, title: true, imdbId: true, genre: true, year: true } },
      show: { select: { id: true, title: true, imdbId: true } },
    },
  });
  if (!req) return;

  await prisma.downloadRequest.update({ where: { id: requestId }, data: { status: 'SEARCHING' } });

  try {
    let magnetLink: string | null = null;
    let contentTitle = '';

    if (req.movie) {
      contentTitle = req.movie.title;
      if (!req.movie.imdbId) {
        await prisma.downloadRequest.update({
          where: { id: requestId },
          data: { status: 'FAILED', errorMsg: 'Movie has no IMDb ID — cannot auto-search' },
        });
        return;
      }
      magnetLink = await findMovieMagnet(req.movie.imdbId, req.movie.title);
    } else if (req.show) {
      contentTitle = req.show.title;
      if (!req.show.imdbId) {
        await prisma.downloadRequest.update({
          where: { id: requestId },
          data: { status: 'FAILED', errorMsg: 'Show has no IMDb ID — cannot auto-search' },
        });
        return;
      }
      magnetLink = await findShowMagnet(req.show.imdbId);
    }

    if (!magnetLink) {
      // Atomically record failure and notify the user.
      // NOTE: NotificationType.DOWNLOAD_READY is reused here because the schema
      // has no DOWNLOAD_FAILED variant. Title/body distinguish the two cases.
      await prisma.$transaction([
        prisma.downloadRequest.update({
          where: { id: requestId },
          data: { status: 'FAILED', errorMsg: `No torrent found for "${contentTitle}" — it may not be available yet` },
        }),
        prisma.notification.create({
          data: {
            userId: req.userId,
            type: NotificationType.DOWNLOAD_READY,
            title: 'Download request unavailable',
            body: `We couldn't find a download for "${contentTitle}". We'll keep checking.`,
            data: { movieId: req.movieId, showId: req.showId },
          },
        }),
      ]);
      return;
    }

    const queue = torrentQueue.get();
    if (queue && req.movieId) {
      // Movie: hand off to the torrent queue, then mark as queued.
      await queue.add('torrent-job', {
        movieId: req.movieId,
        magnetLink,
        requestedByUserId: req.userId,
        requestId,
      });
      await prisma.downloadRequest.update({
        where: { id: requestId },
        data: { status: 'QUEUED', magnetLink },
      });
    } else {
      // TV show (or no queue): save the magnet and notify the user atomically.
      await prisma.$transaction([
        prisma.downloadRequest.update({
          where: { id: requestId },
          data: { status: 'QUEUED', magnetLink },
        }),
        prisma.notification.create({
          data: {
            userId: req.userId,
            type: NotificationType.DOWNLOAD_READY,
            title: 'Download located!',
            body: `We found "${contentTitle}" and it's in the queue. You'll be notified when it's ready.`,
            data: { movieId: req.movieId, showId: req.showId },
          },
        }),
      ]);
    }
  } catch (err) {
    await prisma.downloadRequest.update({
      where: { id: requestId },
      data: { status: 'FAILED', errorMsg: 'Internal error while searching' },
    }).catch(() => {});
  }
}
