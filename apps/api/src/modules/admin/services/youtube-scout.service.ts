import { google } from 'googleapis';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY // Get this from Google Cloud Console
});

export interface YouTubeVideoResult {
  youtubeId: string;
  title: string;
  description: string;
  thumbnail: string;
  channel: string;
  publishedAt: string;
}

export class YoutubeScoutService {
  
  /**
   * Finds trending Nollywood movies (Long form, High view count)
   */
  async scanForMovies(): Promise<YouTubeVideoResult[]> {
    try {
      const res = await youtube.search.list({
        part: ['snippet'],
        q: 'Nollywood Movie 2026 Full',
        type: ['video'],
        videoDuration: 'long', // > 20 mins
        regionCode: 'NG',      // Nigeria Only
        relevanceLanguage: 'en',
        order: 'viewCount',    // Most popular first
        publishedAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Last 7 days
        maxResults: 10,
      });

      return res.data.items?.map(item => ({
        youtubeId: item.id?.videoId || '',
        title: item.snippet?.title || '',
        description: item.snippet?.description || '',
        thumbnail: item.snippet?.thumbnails?.high?.url || '',
        channel: item.snippet?.channelTitle || '',
        publishedAt: item.snippet?.publishedAt || ''
      })) || [];
    } catch (error) {
      console.error('[YouTube Scout] Error scanning for movies:', error);
      return [];
    }
  }

  /**
   * Search for specific movie titles
   */
  async searchByTitle(title: string): Promise<YouTubeVideoResult[]> {
    try {
      const res = await youtube.search.list({
        part: ['snippet'],
        q: `${title} Nollywood Full Movie`,
        type: ['video'],
        videoDuration: 'long',
        regionCode: 'NG',
        maxResults: 5,
      });

      return res.data.items?.map(item => ({
        youtubeId: item.id?.videoId || '',
        title: item.snippet?.title || '',
        description: item.snippet?.description || '',
        thumbnail: item.snippet?.thumbnails?.high?.url || '',
        channel: item.snippet?.channelTitle || '',
        publishedAt: item.snippet?.publishedAt || ''
      })) || [];
    } catch (error) {
      console.error('[YouTube Scout] Error searching by title:', error);
      return [];
    }
  }
}
