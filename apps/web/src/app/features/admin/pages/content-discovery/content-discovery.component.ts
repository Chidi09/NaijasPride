import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

interface YouTubeVideo {
  youtubeId: string;
  title: string;
  description: string;
  thumbnail: string;
  channel: string;
  publishedAt: string;
}

interface RssItem {
  title: string;
  link: string | null;
  pubDate: string | null;
  magnet: string | null;
  description: string | null;
}

@Component({
  selector: 'app-content-discovery',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6">
      <h2 class="text-2xl font-serif text-white mb-6">Content Scout 🕵️‍♂️</h2>

      <div class="flex gap-4 mb-8">
        <button 
          (click)="scanYoutube()" 
          [disabled]="isLoading()"
          class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          @if (isLoading()) {
            <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
          }
          Scan YouTube (Nigeria)
        </button>
        <button 
          (click)="toggleRssSection()" 
          class="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
        >
          Parse RSS Feed
        </button>
      </div>

      <!-- RSS Feed Input Section -->
      @if (showRssInput()) {
        <div class="bg-cinema-800 p-4 rounded-lg mb-8">
          <h3 class="text-white font-bold mb-4">Parse RSS Feed</h3>
          <div class="flex gap-2">
            <input 
              [(ngModel)]="rssUrl" 
              type="url" 
              placeholder="https://example.com/feed.rss"
              class="flex-1 px-4 py-2 rounded bg-cinema-700 text-white border border-cinema-600 focus:border-cinema-500 focus:outline-none"
            >
            <button 
              (click)="parseRssFeed()"
              [disabled]="isRssLoading() || !rssUrl()"
              class="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 disabled:opacity-50"
            >
              @if (isRssLoading()) {
                <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
              }
              Parse
            </button>
          </div>
        </div>
      }

      <!-- RSS Results -->
      @if (rssResults().length > 0) {
        <h3 class="text-white font-bold mb-4">RSS Feed Results</h3>
        <div class="grid grid-cols-1 gap-4 mb-8">
          @for (item of rssResults(); track item.title) {
            <div class="bg-cinema-800 rounded-lg p-4 flex justify-between items-start">
              <div class="flex-1">
                <h4 class="text-white font-bold text-sm">{{ item.title }}</h4>
                <p class="text-gray-400 text-xs mt-1">
                  {{ item.pubDate | date:'mediumDate' }}
                </p>
                @if (item.magnet) {
                  <p class="text-green-500 text-xs mt-1">✓ Magnet link available</p>
                }
              </div>
              <div class="flex gap-2">
                @if (item.magnet) {
                  <a 
                    [href]="item.magnet" 
                    target="_blank"
                    class="bg-green-600 text-white text-xs px-3 py-1 rounded hover:bg-green-700"
                  >
                    Magnet
                  </a>
                }
                @if (item.link) {
                  <a 
                    [href]="item.link" 
                    target="_blank"
                    class="bg-cinema-600 text-white text-xs px-3 py-1 rounded hover:bg-cinema-500"
                  >
                    Link
                  </a>
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- YouTube Results -->
      @if (ytResults().length > 0) {
        <h3 class="text-white font-bold mb-4">YouTube Trends</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          @for (video of ytResults(); track video.youtubeId) {
            <div class="bg-cinema-800 rounded-lg overflow-hidden flex flex-col">
              <img [src]="video.thumbnail" class="w-full h-40 object-cover" [alt]="video.title">
              <div class="p-4 flex-grow">
                <h4 class="text-white font-bold text-sm line-clamp-2">{{ video.title }}</h4>
                <p class="text-gray-400 text-xs mt-1">{{ video.channel }}</p>
                <p class="text-gray-500 text-xs mt-1">
                  {{ video.publishedAt | date:'mediumDate' }}
                </p>
              </div>
              <div class="p-4 pt-0">
                <button 
                  (click)="importYoutube(video)"
                  [disabled]="isImporting()"
                  class="w-full bg-green-600 text-white text-xs py-2 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  @if (isImporting()) {
                    <span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1"></span>
                  }
                  Import as Stream
                </button>
              </div>
            </div>
          }
        </div>
      }

      @if (!isLoading() && ytResults().length === 0 && rssResults().length === 0) {
        <div class="text-center py-20 text-gray-500">
          <p class="text-lg">No results yet. Click "Scan YouTube" or "Parse RSS Feed" to discover content.</p>
        </div>
      }
    </div>
  `
})
export class ContentDiscoveryComponent {
  private http = inject(HttpClient);
  
  ytResults = signal<YouTubeVideo[]>([]);
  rssResults = signal<RssItem[]>([]);
  isLoading = signal(false);
  isRssLoading = signal(false);
  isImporting = signal(false);
  showRssInput = signal(false);
  rssUrl = signal('');

  scanYoutube() {
    this.isLoading.set(true);
    this.http.get<{ status: string; data: YouTubeVideo[] }>('/api/v1/admin/discovery/youtube')
      .subscribe({
        next: (response) => {
          this.ytResults.set(response.data);
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Error scanning YouTube:', error);
          alert('Failed to scan YouTube. Please try again.');
          this.isLoading.set(false);
        }
      });
  }

  toggleRssSection() {
    this.showRssInput.update(value => !value);
    if (!this.showRssInput()) {
      this.rssUrl.set('');
      this.rssResults.set([]);
    }
  }

  parseRssFeed() {
    if (!this.rssUrl()) return;
    
    this.isRssLoading.set(true);
    this.http.post<{ status: string; data: RssItem[] }>('/api/v1/admin/discovery/rss', {
      url: this.rssUrl()
    }).subscribe({
      next: (response) => {
        this.rssResults.set(response.data);
        this.isRssLoading.set(false);
      },
      error: (error) => {
        console.error('Error parsing RSS:', error);
        alert('Failed to parse RSS feed. Please check the URL and try again.');
        this.isRssLoading.set(false);
      }
    });
  }

  importYoutube(video: YouTubeVideo) {
    this.isImporting.set(true);
    this.http.post('/api/v1/admin/import/youtube', {
      title: video.title,
      youtubeId: video.youtubeId,
      description: video.description,
      year: new Date(video.publishedAt).getFullYear(),
      thumbnailUrl: video.thumbnail,
      genre: ['Nollywood'],
      isStreamOnly: true
    }).subscribe({
      next: () => {
        alert(`Successfully imported "${video.title}"`);
        this.ytResults.update(list => list.filter(v => v.youtubeId !== video.youtubeId));
        this.isImporting.set(false);
      },
      error: (error) => {
        console.error('Error importing video:', error);
        alert('Failed to import video. Please try again.');
        this.isImporting.set(false);
      }
    });
  }
}
