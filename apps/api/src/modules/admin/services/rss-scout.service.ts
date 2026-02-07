import Parser from 'rss-parser';

const parser = new Parser();

export interface RssFeedItem {
  title: string;
  link: string | null;
  pubDate: string | null;
  magnet: string | null;
  description: string | null;
}

export class RssScoutService {
  
  /**
   * Parses a Torrent RSS Feed and returns standard objects
   */
  async fetchFeed(feedUrl: string): Promise<RssFeedItem[]> {
    try {
      const feed = await parser.parseURL(feedUrl);
      
      return feed.items.map(item => {
        // Most torrent RSS feeds put the magnet link in the 'link' or 'enclosure'
        // We try to extract magnet link if possible, or just the .torrent url
        const magnet = item.link?.startsWith('magnet:') ? item.link : null;
        
        return {
          title: item.title || 'Unknown Title',
          link: item.link || null,
          pubDate: item.pubDate || null,
          magnet: magnet,
          description: item.contentSnippet || item.content || null
        };
      });
    } catch (error) {
      console.error(`[RSS] Failed to parse ${feedUrl}`, error);
      return [];
    }
  }

  /**
   * Parse multiple feeds and aggregate results
   */
  async fetchMultipleFeeds(feedUrls: string[]): Promise<Map<string, RssFeedItem[]>> {
    const results = new Map<string, RssFeedItem[]>();
    
    await Promise.all(
      feedUrls.map(async url => {
        const items = await this.fetchFeed(url);
        results.set(url, items);
      })
    );
    
    return results;
  }

  /**
   * Extract magnet links from feed items
   */
  extractMagnets(items: RssFeedItem[]): string[] {
    return items
      .map(item => item.magnet)
      .filter((magnet): magnet is string => magnet !== null);
  }
}
