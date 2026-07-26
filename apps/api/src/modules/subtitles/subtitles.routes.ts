import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { z } from "zod";

import { NotFoundError } from "../../shared/errors/app-error";
import {
  SubtitleService,
  downloadAndConvertSubtitle,
} from "../movies/subtitles.service";
import { JimakuProvider } from "./providers/jimaku.provider";
import { OpenSubtitlesProvider } from "./providers/opensubtitles.provider";
import { WyzieProvider } from "./providers/wyzie.provider";
import {
  DEFAULT_SUBTITLE_LANGUAGES,
  resolveSubtitles,
  type SubtitleProvider,
} from "./subtitle-provider";

const searchQuerySchema = z.object({
  imdbId: z.string().optional(),
  tmdbId: z.coerce.number().int().positive().optional(),
  anilistId: z.coerce.number().int().positive().optional(),
  season: z.coerce.number().int().min(0).optional(),
  episode: z.coerce.number().int().min(0).optional(),
  title: z.string().optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  /** Comma-separated ISO-639-1 codes, most preferred first. */
  languages: z.string().optional(),
});

export const subtitleSearchRoutes = async (
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) => {
  // Order is only a tie-break: the resolver ranks by requested language and
  // then by the providers' own popularity signal, not by position here.
  const providers: SubtitleProvider[] = [
    new OpenSubtitlesProvider(),
    new WyzieProvider(),
    new JimakuProvider(),
  ];
  const openSubtitles = new SubtitleService();

  app.get("/", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const query = searchQuerySchema.parse(request.query);
      const languages = (query.languages || "")
        .split(",")
        .map((lang) => lang.trim().toLowerCase())
        .filter(Boolean);

      const resolution = await resolveSubtitles(providers, {
        imdbId: query.imdbId ?? null,
        tmdbId: query.tmdbId ?? null,
        anilistId: query.anilistId ?? null,
        season: query.season ?? null,
        episode: query.episode ?? null,
        title: query.title ?? null,
        year: query.year ?? null,
        languages: languages.length ? languages : DEFAULT_SUBTITLE_LANGUAGES,
      });

      return reply.send({
        success: true,
        data: {
          subtitles: resolution.tracks,
          providersQueried: resolution.providersQueried,
          providersSkipped: resolution.providersSkipped,
        },
      });
    },
  });

  // OpenSubtitles files are not directly linkable — turning a file id into a
  // URL needs an authenticated POST against the account's download quota, so
  // it has to happen here rather than in the player. The response is
  // normalised to WebVTT, which every client can render.
  app.get("/opensubtitles/:fileId/download", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { fileId } = request.params as { fileId: string };
      const downloadResult = await openSubtitles.getDownloadLink(fileId);
      if (!downloadResult) {
        throw new NotFoundError("Download link not available");
      }
      const { content } = await downloadAndConvertSubtitle(
        downloadResult.link,
        downloadResult.fileName,
      );
      reply.header("Content-Type", "text/vtt");
      reply.header("Content-Disposition", 'inline; filename="subtitle.vtt"');
      return reply.send(content);
    },
  });
};
