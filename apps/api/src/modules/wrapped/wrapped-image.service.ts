import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import { chromium } from 'playwright';
import { WrappedStats, TopItem } from './wrapped-stats.service';
import { StorageService } from '../../shared/services/storage.service';

// Card types matching the templates
export type CardType = 'hero' | 'topMovie' | 'topMusic' | 'topBook' | 'genres' | 'summary';

export type CardUrls = {
  hero: string;
  topMovie: string;
  topMusic: string;
  topBook: string;
  genres: string;
  summary: string;
};

interface TemplateData {
  // Period info
  periodLabel: string;
  isAnnual: boolean;
  totalHours: number;
  musicHours: number;
  bookHours: number;

  // Stats
  totalMoviesWatched: number;
  totalMusicPlays: number;
  totalBooksRead: number;
  totalMangaChapters: number;
  totalHighlights: number;
  totalDownloads: number;

  // Top items
  topMovie: TopItem | null;
  topArtist: TopItem | null;
  topSong: TopItem | null;
  topBook: TopItem | null;
  topMangaSeries: TopItem | null;

  // Genres
  topGenres: { name: string; count: number; percentage: number }[];
  genrePersonality: string;

  // Streaks
  streak: { longestStreak: number; currentStreak: number; totalActiveDays: number };

  // Fun facts
  funFact: string;
  milestoneLabel: string | null;
}

const TEMPLATES_DIR = path.join(__dirname, 'templates');
const VIEWPORT = { width: 1080, height: 1920 };

// R2 key prefix for wrapped images
const R2_PREFIX = 'wrapped';

export class WrappedImageService {
  private storage = new StorageService();
  private baseTemplate!: Handlebars.TemplateDelegate;
  private cardTemplates: Map<CardType, Handlebars.TemplateDelegate> = new Map();

  constructor() {
    this.registerHelpers();
    this.loadTemplates();
  }

  private registerHelpers() {
    // Helpers for conditional rendering in templates
    const self = this;
    Handlebars.registerHelper('ifPercentageHigh', function(value: number, options: any) {
      return value > 35 ? options.fn(self) : options.inverse(self);
    });
  }

  private loadTemplates() {
    const baseSource = fs.readFileSync(path.join(TEMPLATES_DIR, 'base.hbs'), 'utf-8');
    this.baseTemplate = Handlebars.compile(baseSource);

    const cards: CardType[] = ['hero', 'topMovie', 'topMusic', 'topBook', 'genres', 'summary'];
    for (const card of cards) {
      const fileName = card === 'hero' ? '01-hero.hbs' :
                       card === 'topMovie' ? '02-top-movie.hbs' :
                       card === 'topMusic' ? '03-top-music.hbs' :
                       card === 'topBook' ? '04-top-book.hbs' :
                       card === 'genres' ? '05-genres.hbs' :
                       '06-summary.hbs';
      
      const source = fs.readFileSync(path.join(TEMPLATES_DIR, fileName), 'utf-8');
      this.cardTemplates.set(card, Handlebars.compile(source));
    }
  }

  async generateAllCards(stats: WrappedStats, userId: string): Promise<CardUrls> {
    const data = this.transformStatsToTemplateData(stats);
    
    const results: Partial<CardUrls> = {};
    const cards: CardType[] = ['hero', 'topMovie', 'topMusic', 'topBook', 'genres', 'summary'];

    for (const cardType of cards) {
      // Skip cards with missing essential data
      if (cardType === 'topMovie' && !data.topMovie) continue;
      if (cardType === 'topBook' && !data.topBook) continue;
      if (cardType === 'topMusic' && !data.topArtist) continue;

      const imageBuffer = await this.renderCard(cardType, data);
      const key = `${R2_PREFIX}/${userId}/${stats.period}/${cardType}.png`;
      
      // Upload to R2
      await this.uploadToR2(key, imageBuffer);
      
      // Get public URL
      const url = await this.storage.getDownloadUrl(key);
      results[cardType] = url;
    }

    return results as CardUrls;
  }

  async generateSingleCard(
    cardType: CardType,
    stats: WrappedStats,
    userId: string
  ): Promise<string> {
    const data = this.transformStatsToTemplateData(stats);
    const imageBuffer = await this.renderCard(cardType, data);
    const key = `${R2_PREFIX}/${userId}/${stats.period}/${cardType}.png`;
    
    await this.uploadToR2(key, imageBuffer);
    return this.storage.getDownloadUrl(key);
  }

  private async renderCard(cardType: CardType, data: TemplateData): Promise<Buffer> {
    const cardTemplate = this.cardTemplates.get(cardType)!;
    const bodyHtml = cardTemplate(data);
    
    // Wrap with base template
    const fullHtml = this.baseTemplate({ body: bodyHtml });

    // Launch browser and render
    const browser = await chromium.launch({ headless: true });
    
    try {
      const page = await browser.newPage({ viewport: VIEWPORT });
      await page.setContent(fullHtml, { waitUntil: 'networkidle' });

      // Wait for fonts to load
      await page.waitForTimeout(500);

      // Screenshot
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: false,
        clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height }
      });

      return screenshot;
    } finally {
      await browser.close();
    }
  }

  private async uploadToR2(key: string, buffer: Buffer): Promise<void> {
    const s3Client = StorageService.getClient();
    const bucket = StorageService.getBucket();

    const command = new (await import('@aws-sdk/client-s3')).PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000', // 1 year cache
    });

    await s3Client.send(command);
  }

  private transformStatsToTemplateData(stats: WrappedStats): TemplateData {
    return {
      periodLabel: stats.periodLabel,
      isAnnual: stats.isAnnual,
      totalHours: Math.round(stats.totalMinutes / 60),
      musicHours: stats.topSong?.minutes ? Math.round(stats.topSong.minutes / 60) : 0,
      bookHours: stats.topBook?.minutes ? Math.round(stats.topBook.minutes / 60) : 0,

      totalMoviesWatched: stats.totalMoviesWatched,
      totalMusicPlays: stats.totalMusicPlays,
      totalBooksRead: stats.totalBooksRead,
      totalMangaChapters: stats.totalMangaChapters,
      totalHighlights: stats.totalHighlights,
      totalDownloads: stats.totalDownloads,

      topMovie: stats.topMovie,
      topArtist: stats.topArtist,
      topSong: stats.topSong,
      topBook: stats.topBook,
      topMangaSeries: stats.topMangaSeries,

      topGenres: stats.topGenres,
      genrePersonality: stats.genrePersonality,

      streak: stats.streak,
      funFact: stats.funFact,
      milestoneLabel: stats.milestoneLabel,
    };
  }

  // Helper to delete old wrapped images when regenerating
  async deleteWrappedImages(userId: string, period: string): Promise<void> {
    const s3Client = StorageService.getClient();
    const bucket = StorageService.getBucket();
    const { ListObjectsV2Command, DeleteObjectCommand } = await import('@aws-sdk/client-s3');

    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `${R2_PREFIX}/${userId}/${period}/`,
    });

    const response = await s3Client.send(listCommand);
    
    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key) {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: obj.Key,
          }));
        }
      }
    }
  }
}
