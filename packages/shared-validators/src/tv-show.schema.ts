import { z } from 'zod';
import { Genre } from '@naijaspride/types';

export const tvShowSearchSchema = z.object({
  q: z.string().max(200).optional(),
  genre: z.array(z.nativeEnum(Genre)).optional(),
  year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 2).optional(),
  language: z.string().optional(),
  sortBy: z.enum(['latest', 'popular', 'title', 'trending']).default('latest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const tvEmbedQuerySchema = z.object({
  season: z.coerce.number().int().min(1),
  episode: z.coerce.number().int().min(1),
});

export const saveTvProgressSchema = z.object({
  showId: z.string().uuid(),
  episodeId: z.string().uuid(),
  seasonNumber: z.number().int().min(1),
  episodeNumber: z.number().int().min(1),
  progress: z.number().int().min(0).default(0),
  duration: z.number().int().min(0).default(0),
});
