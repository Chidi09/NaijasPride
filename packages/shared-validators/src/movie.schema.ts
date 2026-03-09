import { z } from 'zod';
import { Genre, Quality } from '@naijaspride/types';

const booleanQueryParam = z
  .preprocess((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
    }
    return value;
  }, z.boolean())
  .optional();

export const movieSearchSchema = z.object({
  q: z.string().max(200).optional(),
  genre: z.preprocess(
    (value) => {
      if (typeof value === 'string') return [value];
      return value;
    },
    z.array(z.nativeEnum(Genre)).optional(),
  ),
  year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 2).optional(),
  quality: z.nativeEnum(Quality).optional(),
  language: z.string().optional(),
  sortBy: z.enum(['latest', 'popular', 'rating', 'title', 'trending', 'newest']).default('latest'),
  nollywoodOnly: booleanQueryParam.default(false),
  isStreamOnly: booleanQueryParam,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createMovieSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 2),
  genre: z.array(z.nativeEnum(Genre)).min(1),
  quality: z.array(z.nativeEnum(Quality)).min(1),
  language: z.string().default('English'),
  durationMinutes: z.number().int().positive().optional(),
  overview: z.string().max(10000).optional(),
  tagline: z.string().max(300).optional(),
  tmdbRating: z.number().min(0).max(10).optional(),
  imdbRating: z.number().min(0).max(10).optional(),
  rottenTomatoes: z.string().max(20).optional(),
  imdbId: z.string().regex(/^tt\d{7,8}$/).optional(),
  tmdbId: z.number().int().positive().optional(),
  posterUrl: z.string().url().optional(),
  backdropUrl: z.string().url().optional(),
  trailerUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
  fileUrls: z.record(z.string().url()),
  fileSizes: z.record(z.number().positive()).optional(),
  metadata: z.object({
    director: z.string().optional(),
    cast: z.array(z.string()).optional(),
    country: z.string().optional(),
    subtitles: z.array(z.string()).optional(),
    trailerUrl: z.string().url().optional(),
    nollywood: z.boolean().optional(),
  }).optional(),
  youtubeId: z.string().optional(),
  isStreamOnly: z.boolean().default(false),
});
