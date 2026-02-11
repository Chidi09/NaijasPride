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

interface SearchResults {
  [title: string]: YouTubeVideo[];
}

interface ChannelImportResult {
  imported: string[];
  skipped: string[];
  failed: { title: string; error: string }[];
  notFound: string[];
  dryRun: boolean;
}

@Component({
  selector: 'app-content-discovery',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 max-w-6xl mx-auto">
      <div class="mb-6">
        <h2 class="text-2xl font-serif text-white mb-2">Content Scout</h2>
        <p class="text-gray-400 text-sm">Import Nigerian movies from YouTube channels</p>
      </div>

      <!-- Tab buttons -->
      <div class="flex gap-2 mb-8 border-b border-[#5f1327]/40 pb-4 flex-wrap">
        <button
          (click)="activeTab.set('channels')"
          [class]="activeTab() === 'channels'
            ? 'bg-[#800020] text-white px-4 py-2 rounded text-sm font-semibold'
            : 'bg-transparent text-gray-400 hover:text-white px-4 py-2 rounded text-sm border border-gray-700'"
        >Add Channels (Bulk)</button>
        <button
          (click)="activeTab.set('search')"
          [class]="activeTab() === 'search'
            ? 'bg-[#800020] text-white px-4 py-2 rounded text-sm font-semibold'
            : 'bg-transparent text-gray-400 hover:text-white px-4 py-2 rounded text-sm border border-gray-700'"
        >Search by Title</button>
        <button
          (click)="activeTab.set('trending')"
          [class]="activeTab() === 'trending'
            ? 'bg-[#800020] text-white px-4 py-2 rounded text-sm font-semibold'
            : 'bg-transparent text-gray-400 hover:text-white px-4 py-2 rounded text-sm border border-gray-700'"
        >Trending</button>
        <button
          (click)="activeTab.set('rss')"
          [class]="activeTab() === 'rss'
            ? 'bg-[#800020] text-white px-4 py-2 rounded text-sm font-semibold'
            : 'bg-transparent text-gray-400 hover:text-white px-4 py-2 rounded text-sm border border-gray-700'"
        >RSS Feed</button>
      </div>

      <!-- ============ ADD CHANNELS TAB (BULK IMPORT) ============ -->
      @if (activeTab() === 'channels') {
        <div class="space-y-6">
          <!-- Instructions -->
          <div class="bg-[#1b1014] border border-[#5f1327] rounded-lg p-4">
            <h3 class="text-[#d6b87a] font-bold mb-2">How to Add YouTube Channels</h3>
            <ol class="text-gray-300 text-sm list-decimal list-inside space-y-1">
              <li>Go to YouTube and find Nigerian movie channels</li>
              <li>Copy the channel URL (e.g., youtube.com/&#64;channelname or youtube.com/c/ChannelName)</li>
              <li>Paste URLs below (one per line)</li>
              <li>Click "Import All Movies" to bulk import</li>
            </ol>
            <p class="text-gray-500 text-xs mt-2">Popular channels: &#64;nollywoodmovies, &#64;africamagic, &#64;ibakatv, &#64;apatatv</p>
          </div>

          <!-- Channel URLs Input -->
          <div>
            <label class="block text-xs font-semibold uppercase tracking-[0.2em] text-[#d6b87a] mb-2">
              YouTube Channel URLs (one per line)
            </label>
            <textarea
              [(ngModel)]="channelUrlsInput"
              rows="8"
              placeholder="https://www.youtube.com/@nollywoodmovies&#10;https://www.youtube.com/c/AfricanMagic&#10;https://www.youtube.com/@ibakatv"
              class="w-full rounded-lg border border-[#5f1327] bg-[#1b1014] px-4 py-3 text-[#f7eee7] placeholder-[#a88a78] outline-none focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/50 font-mono text-sm"
            ></textarea>
            
            <!-- Settings -->
            <div class="flex flex-wrap gap-4 mt-3 items-center">
              <label class="flex items-center gap-2 text-sm text-gray-300">
                <input 
                  type="checkbox" 
                  [(ngModel)]="channelDryRun"
                  class="rounded border-gray-600 bg-[#1b1014] text-[#800020]"
                >
                Dry Run (preview only)
              </label>
              <label class="flex items-center gap-2 text-sm text-gray-300">
                <span>Max videos per channel:</span>
                <input 
                  type="number" 
                  [(ngModel)]="maxResultsPerChannel"
                  min="1"
                  max="20"
                  class="w-16 rounded border border-[#5f1327] bg-[#1b1014] px-2 py-1 text-sm text-center"
                >
              </label>
            </div>

            <div class="flex gap-3 mt-4">
              <button
                (click)="importChannels()"
                [disabled]="isImportingChannels() || !channelUrlsInput().trim()"
                class="bg-[#800020] hover:bg-[#660019] text-white px-6 py-2 rounded text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                @if (isImportingChannels()) {
                  <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
                }
                Import All Movies
              </button>
              <button
                (click)="clearChannelResults()"
                class="text-gray-400 hover:text-white text-sm px-4 py-2 rounded border border-gray-700 transition"
              >
                Clear
              </button>
            </div>
          </div>

          <!-- Channel Import Results -->
          @if (channelImportResult()) {
            <div class="bg-[#120a0d] border border-[#5f1327]/40 rounded-lg p-4">
              <h3 class="text-white font-bold mb-3">Import Results</h3>
              
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div class="bg-green-900/20 border border-green-800 rounded p-3 text-center">
                  <div class="text-2xl font-bold text-green-400">{{ channelImportResult()!.imported.length }}</div>
                  <div class="text-xs text-green-300">Imported</div>
                </div>
                <div class="bg-yellow-900/20 border border-yellow-800 rounded p-3 text-center">
                  <div class="text-2xl font-bold text-yellow-400">{{ channelImportResult()!.skipped.length }}</div>
                  <div class="text-xs text-yellow-300">Skipped</div>
                </div>
                <div class="bg-red-900/20 border border-red-800 rounded p-3 text-center">
                  <div class="text-2xl font-bold text-red-400">{{ channelImportResult()!.failed.length }}</div>
                  <div class="text-xs text-red-300">Failed</div>
                </div>
                <div class="bg-blue-900/20 border border-blue-800 rounded p-3 text-center">
                  <div class="text-2xl font-bold text-blue-400">{{ channelImportResult()!.notFound.length }}</div>
                  <div class="text-xs text-blue-300">Not Found</div>
                </div>
              </div>

              @if (channelImportResult()!.failed.length > 0) {
                <div class="mt-3">
                  <p class="text-red-400 text-sm font-semibold mb-1">Failed imports:</p>
                  <p class="text-gray-400 text-xs">{{ getChannelFailedTitles() }}</p>
                </div>
              }

              @if (channelImportResult()!.dryRun) {
                <div class="mt-3 p-2 bg-blue-900/20 border border-blue-800 rounded">
                  <p class="text-blue-300 text-sm">This was a dry run. No movies were actually imported.</p>
                  <p class="text-blue-300 text-sm">Uncheck "Dry Run" and click "Import All Movies" to import for real.</p>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- ============ SEARCH BY TITLE TAB ============ -->
      @if (activeTab() === 'search') {
        <div class="mb-8">
          <label class="block text-xs font-semibold uppercase tracking-[0.2em] text-[#d6b87a] mb-2">
            Movie titles (one per line)
          </label>
          <textarea
            [(ngModel)]="titleInput"
            rows="6"
            placeholder="The Wedding Party&#10;King of Boys&#10;Lionheart&#10;Citation"
            class="w-full rounded-lg border border-[#5f1327] bg-[#1b1014] px-4 py-3 text-[#f7eee7] placeholder-[#a88a78] outline-none focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/50 font-mono text-sm"
          ></textarea>
          <div class="flex gap-3 mt-3">
            <button
              (click)="searchTitles()"
              [disabled]="isSearching() || !titleInput().trim()"
              class="bg-[#800020] hover:bg-[#660019] text-white px-5 py-2 rounded text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              @if (isSearching()) {
                <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
              }
              Search YouTube
            </button>
          </div>
        </div>

        <!-- Search results grouped by title -->
        @for (title of searchResultTitles(); track title) {
          <div class="mb-8">
            <h3 class="text-white font-bold mb-3 border-l-4 border-[#800020] pl-3">{{ title }}</h3>
            @if (searchResults()[title]?.length === 0) {
              <p class="text-gray-500 text-sm ml-6">No results found</p>
            }
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              @for (video of searchResults()[title]; track video.youtubeId) {
                <div class="bg-[#120a0d] border border-[#5f1327]/40 rounded-lg overflow-hidden flex flex-col">
                  <img [src]="video.thumbnail" class="w-full h-36 object-cover" [alt]="video.title">
                  <div class="p-3 flex-grow">
                    <h4 class="text-white font-bold text-xs line-clamp-2">{{ video.title }}</h4>
                    <p class="text-gray-400 text-xs mt-1">{{ video.channel }}</p>
                  </div>
                  <div class="p-3 pt-0 flex gap-2">
                    <button
                      (click)="selectForImport(video, title)"
                      [disabled]="isSelected(video.youtubeId)"
                      class="flex-1 text-xs py-1.5 rounded font-semibold transition"
                      [class]="isSelected(video.youtubeId)
                        ? 'bg-green-800/40 text-green-300 cursor-default'
                        : 'bg-green-700 hover:bg-green-600 text-white'"
                    >
                      {{ isSelected(video.youtubeId) ? 'Selected' : 'Select' }}
                    </button>
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <!-- Batch import bar -->
        @if (selectedVideos().length > 0) {
          <div class="fixed bottom-0 left-0 right-0 z-50 bg-[#120a0d]/95 border-t border-[#800020] backdrop-blur-sm p-4">
            <div class="max-w-5xl mx-auto flex items-center justify-between">
              <span class="text-[#d6b87a] font-semibold text-sm">
                {{ selectedVideos().length }} movie{{ selectedVideos().length > 1 ? 's' : '' }} selected
              </span>
              <div class="flex gap-3">
                <button
                  (click)="clearSelection()"
                  class="text-gray-400 hover:text-white text-sm px-4 py-2 rounded border border-gray-700 transition"
                >Clear</button>
                <button
                  (click)="batchImport()"
                  [disabled]="isImporting()"
                  class="bg-[#800020] hover:bg-[#660019] text-white px-6 py-2 rounded text-sm font-semibold disabled:opacity-50 transition"
                >
                  @if (isImporting()) {
                    <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
                  }
                  Import All
                </button>
              </div>
            </div>
          </div>
        }

        <!-- Import result feedback -->
        @if (importResult()) {
          <div class="mt-6 bg-[#120a0d] border border-[#5f1327]/40 rounded-lg p-4">
            <h3 class="text-white font-bold mb-2">Import Results</h3>
            @if (importResult()!.imported.length > 0) {
              <p class="text-green-400 text-sm">Imported: {{ importResult()!.imported.join(', ') }}</p>
            }
            @if (importResult()!.skipped.length > 0) {
              <p class="text-yellow-400 text-sm mt-1">Skipped (already exist): {{ importResult()!.skipped.join(', ') }}</p>
            }
            @if (importResult()!.failed.length > 0) {
              <p class="text-red-400 text-sm mt-1">Failed: {{ getFailedTitles() }}</p>
            }
          </div>
        }
      }

      <!-- ============ TRENDING SCAN TAB ============ -->
      @if (activeTab() === 'trending') {
        <div class="mb-6">
          <button
            (click)="scanYoutube()"
            [disabled]="isLoading()"
            class="bg-[#800020] hover:bg-[#660019] text-white px-5 py-2 rounded text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            @if (isLoading()) {
              <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
            }
            Scan YouTube (Nigeria)
          </button>
        </div>

        @if (ytResults().length > 0) {
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            @for (video of ytResults(); track video.youtubeId) {
              <div class="bg-[#120a0d] border border-[#5f1327]/40 rounded-lg overflow-hidden flex flex-col">
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
                    class="w-full bg-green-700 hover:bg-green-600 text-white text-xs py-2 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
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
      }

      <!-- ============ RSS TAB ============ -->
      @if (activeTab() === 'rss') {
        <div class="mb-6">
          <label class="block text-xs font-semibold uppercase tracking-[0.2em] text-[#d6b87a] mb-2">RSS Feed URL</label>
          <div class="flex gap-2">
            <input
              [(ngModel)]="rssUrl"
              type="url"
              placeholder="https://example.com/feed.rss"
              class="flex-1 rounded-lg border border-[#5f1327] bg-[#1b1014] px-4 py-3 text-[#f7eee7] placeholder-[#a88a78] outline-none focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/50 text-sm"
            >
            <button
              (click)="parseRssFeed()"
              [disabled]="isRssLoading() || !rssUrl()"
              class="bg-[#800020] hover:bg-[#660019] text-white px-5 py-3 rounded-lg text-sm font-semibold disabled:opacity-50 transition"
            >
              @if (isRssLoading()) {
                <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
              }
              Parse
            </button>
          </div>
        </div>

        @if (rssResults().length > 0) {
          <div class="grid grid-cols-1 gap-4">
            @for (item of rssResults(); track item.title) {
              <div class="bg-[#120a0d] border border-[#5f1327]/40 rounded-lg p-4 flex justify-between items-start">
                <div class="flex-1">
                  <h4 class="text-white font-bold text-sm">{{ item.title }}</h4>
                  <p class="text-gray-400 text-xs mt-1">
                    {{ item.pubDate | date:'mediumDate' }}
                  </p>
                  @if (item.magnet) {
                    <p class="text-green-400 text-xs mt-1">Magnet link available</p>
                  }
                </div>
                <div class="flex gap-2">
                  @if (item.magnet) {
                    <a
                      [href]="item.magnet"
                      target="_blank"
                      class="bg-green-700 text-white text-xs px-3 py-1 rounded hover:bg-green-600 transition"
                    >Magnet</a>
                  }
                  @if (item.link) {
                    <a
                      [href]="item.link"
                      target="_blank"
                      class="bg-[#5f1327] text-white text-xs px-3 py-1 rounded hover:bg-[#800020] transition"
                    >Link</a>
                  }
                </div>
              </div>
            }
          </div>
        }
      }

      <!-- Empty state -->
      @if (!isLoading() && !isSearching() && !isImportingChannels() && ytResults().length === 0 && rssResults().length === 0 && searchResultTitles().length === 0 && !channelImportResult()) {
        <div class="text-center py-20 text-gray-500">
          <p class="text-lg mb-2">Ready to import content!</p>
          <p class="text-sm">Click "Add Channels (Bulk)" for the easiest way to populate your site.</p>
        </div>
      }
    </div>
  `
})
export class ContentDiscoveryComponent {
  private http = inject(HttpClient);

  activeTab = signal<'channels' | 'search' | 'trending' | 'rss'>('channels');

  // Channels import state
  channelUrlsInput = signal('');
  isImportingChannels = signal(false);
  maxResultsPerChannel = signal(8);
  channelDryRun = signal(false);
  channelImportResult = signal<ChannelImportResult | null>(null);

  // Search by title state
  titleInput = signal('');
  searchResults = signal<SearchResults>({});
  searchResultTitles = signal<string[]>([]);
  isSearching = signal(false);
  selectedVideos = signal<{ video: YouTubeVideo; searchTitle: string }[]>([]);
  importResult = signal<{ imported: string[]; skipped: string[]; failed: { title: string; error: string }[] } | null>(null);

  // Trending state
  ytResults = signal<YouTubeVideo[]>([]);
  isLoading = signal(false);

  // RSS state
  rssResults = signal<RssItem[]>([]);
  isRssLoading = signal(false);
  rssUrl = signal('');

  // Import state
  isImporting = signal(false);

  // --- Channels import ---
  importChannels() {
    const raw = this.channelUrlsInput().trim();
    if (!raw) return;

    const urls = raw
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0);

    if (urls.length === 0) return;

    this.isImportingChannels.set(true);
    this.channelImportResult.set(null);

    this.http.post<{
      status: string;
      data: ChannelImportResult;
      message: string;
    }>('/api/v1/admin/import/youtube/channels', {
      channels: urls,
      maxResultsPerChannel: this.maxResultsPerChannel(),
      dryRun: this.channelDryRun(),
      genre: ['Nollywood'],
      isStreamOnly: true
    }).subscribe({
      next: (response) => {
        this.channelImportResult.set(response.data);
        this.isImportingChannels.set(false);
        if (!response.data.dryRun) {
          this.channelUrlsInput.set('');
        }
      },
      error: (error) => {
        console.error('Error importing channels:', error);
        alert('Failed to import channels. Check that YOUTUBE_API_KEY is set.');
        this.isImportingChannels.set(false);
      }
    });
  }

  clearChannelResults() {
    this.channelImportResult.set(null);
    this.channelUrlsInput.set('');
  }

  getChannelFailedTitles(): string {
    const result = this.channelImportResult();
    if (!result || result.failed.length === 0) return '';
    return result.failed.map((item) => item.title).join(', ');
  }

  // --- Search by title ---
  searchTitles() {
    const raw = this.titleInput().trim();
    if (!raw) return;

    const titles = raw
      .split('\n')
      .map(t => t.trim())
      .filter(Boolean);

    if (titles.length === 0) return;

    this.isSearching.set(true);
    this.importResult.set(null);
    this.selectedVideos.set([]);

    this.http.post<{ status: string; data: SearchResults }>('/api/v1/admin/discovery/youtube/search', { titles })
      .subscribe({
        next: (response) => {
          this.searchResults.set(response.data);
          this.searchResultTitles.set(Object.keys(response.data));
          this.isSearching.set(false);
        },
        error: (error) => {
          console.error('Error searching YouTube:', error);
          alert('Failed to search YouTube. Check that YOUTUBE_API_KEY is set.');
          this.isSearching.set(false);
        }
      });
  }

  selectForImport(video: YouTubeVideo, searchTitle: string) {
    const current = this.selectedVideos();
    if (current.some(s => s.video.youtubeId === video.youtubeId)) return;
    this.selectedVideos.set([...current, { video, searchTitle }]);
  }

  isSelected(youtubeId: string): boolean {
    return this.selectedVideos().some(s => s.video.youtubeId === youtubeId);
  }

  clearSelection() {
    this.selectedVideos.set([]);
  }

  batchImport() {
    const selected = this.selectedVideos();
    if (selected.length === 0) return;

    this.isImporting.set(true);

    const items = selected.map(s => ({
      title: s.searchTitle,
      youtubeId: s.video.youtubeId,
      description: s.video.description,
      year: new Date(s.video.publishedAt).getFullYear() || new Date().getFullYear(),
      thumbnailUrl: s.video.thumbnail || undefined,
      genre: ['Nollywood'],
      isStreamOnly: true,
    }));

    this.http.post<{
      status: string;
      data: { imported: string[]; skipped: string[]; failed: { title: string; error: string }[] };
      message: string;
    }>('/api/v1/admin/import/youtube/batch', { items })
      .subscribe({
        next: (response) => {
          this.importResult.set(response.data);
          this.selectedVideos.set([]);
          this.isImporting.set(false);
        },
        error: (error) => {
          console.error('Error batch importing:', error);
          alert('Failed to batch import. Please try again.');
          this.isImporting.set(false);
        }
      });
  }

  // --- Trending scan ---
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

  // --- RSS ---
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

  getFailedTitles(): string {
    const result = this.importResult();
    if (!result || result.failed.length === 0) return '';
    return result.failed.map((item) => item.title).join(', ');
  }
}
