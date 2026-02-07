import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { YoutubeScoutService } from './services/youtube-scout.service';
import { RssScoutService } from './services/rss-scout.service';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';

// Validation schemas
const RssUrlSchema = z.object({
  url: z.string().url()
});

const ImportYoutubeSchema = z.object({
  title: z.string().min(1),
  youtubeId: z.string().min(1),
  description: z.string().optional(),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 2),
  thumbnailUrl: z.string().url().optional(),
  genre: z.array(z.string()).default(['Nollywood']),
  isStreamOnly: z.boolean().default(true)
});

export const adminRoutes = async (
  app: FastifyInstance,
  opts: FastifyPluginOptions
) => {
  const ytService = new YoutubeScoutService();
  const rssService = new RssScoutService();

  // GET /api/admin/discovery/youtube - Scan YouTube for Nollywood movies
  app.get('/discovery/youtube', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const results = await ytService.scanForMovies();
        
        return reply.send({
          status: 'success',
          data: results
        });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to scan YouTube'
        });
      }
    }
  });

  // POST /api/admin/discovery/rss - Parse an RSS feed
  app.post('/discovery/rss', {
    preHandler: [app.authenticate],
    schema: {
      body: RssUrlSchema
    },
    handler: async (request, reply) => {
      try {
        const { url } = request.body as z.infer<typeof RssUrlSchema>;
        const results = await rssService.fetchFeed(url);
        
        return reply.send({
          status: 'success',
          data: results
        });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to parse RSS feed'
        });
      }
    }
  });
  
  // POST /api/admin/import/youtube - Import a YouTube video as a movie
  app.post('/import/youtube', {
    preHandler: [app.authenticate],
    schema: {
      body: ImportYoutubeSchema
    },
    handler: async (request, reply) => {
      try {
        const data = request.body as z.infer<typeof ImportYoutubeSchema>;
        
        // Generate slug from title
        const slug = `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${data.year}`;
        
        // Create movie in database
        const movie = await app.prisma.movie.create({
          data: {
            title: data.title,
            slug: slug,
            description: data.description || null,
            year: data.year,
            genre: ['Nollywood'] as Prisma.Genre[],
            quality: [], // No downloads for stream-only
            language: 'English',
            thumbnailUrl: data.thumbnailUrl || null,
            youtubeId: data.youtubeId,
            isStreamOnly: data.isStreamOnly,
            fileUrls: {},
            fileSizes: {},
            status: 'active'
          }
        });
        
        return reply.send({
          status: 'success',
          data: movie,
          message: `Successfully imported "${data.title}"`
        });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to import movie'
        });
      }
    }
  });

  // GET /api/admin/rss-feeds - Get all RSS feeds
  app.get('/rss-feeds', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const feeds = await app.prisma.rssFeed.findMany({
          orderBy: { lastChecked: 'desc' }
        });
        
        return reply.send({
          status: 'success',
          data: feeds
        });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch RSS feeds'
        });
      }
    }
  });

  // POST /api/admin/rss-feeds - Create a new RSS feed
  app.post('/rss-feeds', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const { name, url } = request.body as { name: string; url: string };
        
        const feed = await app.prisma.rssFeed.create({
          data: {
            name,
            url,
            isEnabled: true
          }
        });
        
        return reply.send({
          status: 'success',
          data: feed,
          message: 'RSS feed added successfully'
        });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to create RSS feed'
        });
      }
    }
  });
};
