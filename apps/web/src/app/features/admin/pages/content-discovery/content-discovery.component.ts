import { Component, inject, signal, computed } from '@angular/core';
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
  isImported?: boolean;
}

interface Channel {
  id: string;
  name: string;
  channelId: string;
  url: string;
  isActive: boolean;
  totalVideos: number;
  importedCount: number;
  lastSyncedAt: string | null;
  stats: {
    totalVideos: number;
    importedCount: number;
    remainingCount: number;
  };
}

interface ChannelVideosResult {
  videos: YouTubeVideo[];
  nextPageToken: string | null;
  totalResults: number;
}

interface BatchImportProgress {
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
  currentBatch: number;
  totalBatches: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  errors: string[];
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
          (click)="activeTab.set('my-channels')"
          [class]="activeTab() === 'my-channels'
            ? 'bg-[#800020] text-white px-4 py-2 rounded text-sm font-semibold'
            : 'bg-transparent text-gray-400 hover:text-white px-4 py-2 rounded text-sm border border-gray-700'"
        >My Channels</button>
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

      <!-- ============ MY CHANNELS TAB ============ -->
      @if (activeTab() === 'my-channels') {
        <div class="space-y-6">
          <!-- Add New Channel -->
          <div class="bg-[#1b1014] border border-[#5f1327] rounded-lg p-4">
            <h3 class="text-[#d6b87a] font-bold mb-3">Add New Channel</h3>
            <div class="flex gap-3">
              <input
                type="url"
                [ngModel]="newChannelUrl()"
                (ngModelChange)="newChannelUrl.set($event)"
                placeholder="https://www.youtube.com/@channelname"
                class="flex-1 rounded-lg border border-[#5f1327] bg-[#0d0d0d] px-4 py-2 text-white placeholder-gray-500 outline-none focus:border-[#800020]"
              >
              <button
                (click)="addChannel()"
                [disabled]="isAddingChannel() || !newChannelUrl().trim()"
                class="bg-[#800020] hover:bg-[#660019] text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
              >
                @if (isAddingChannel()) {
                  <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
                }
                Add Channel
              </button>
            </div>
            @if (channelAddError()) {
              <p class="text-red-400 text-sm mt-2">{{ channelAddError() }}</p>
            }
          </div>

          <!-- Backfill from existing movies -->
          <div class="bg-[#1b1014] border border-[#5f1327]/60 rounded-lg p-4">
            <div class="flex items-start justify-between gap-4 mb-3">
              <div>
                <h3 class="text-[#d6b87a] font-bold mb-1">Recover Channels from Existing Movies</h3>
                <p class="text-gray-400 text-sm">If you already have YouTube movies imported, this will look up their channels and register them here automatically.</p>
              </div>
              <button
                (click)="backfillChannels()"
                [disabled]="isBackfilling()"
                class="shrink-0 bg-[#3a1020] hover:bg-[#4a1428] border border-[#800020] text-[#d6b87a] px-4 py-2 rounded text-sm font-semibold disabled:opacity-50 transition whitespace-nowrap"
              >
                @if (isBackfilling()) {
                  <span class="inline-block w-4 h-4 border-2 border-[#d6b87a]/30 border-t-[#d6b87a] rounded-full animate-spin mr-2"></span>
                  Scanning...
                } @else {
                  Scan Existing Movies
                }
              </button>
            </div>
            @if (backfillProgress(); as bp) {
              <div class="space-y-2">
                @if (bp.status === 'running' || bp.status === 'pending') {
                  <div class="flex justify-between text-xs text-gray-400">
                    <span>Scanning movies...</span>
                    <span>{{ bp.processed }} / {{ bp.total }}</span>
                  </div>
                  <div class="w-full bg-[#0d0d0d] rounded-full h-2">
                    <div
                      class="bg-[#d6b87a] h-2 rounded-full transition-all"
                      [style.width.%]="bp.total > 0 ? (bp.processed / bp.total) * 100 : 0"
                    ></div>
                  </div>
                }
                @if (bp.status === 'completed') {
                  <p class="text-green-400 text-sm">
                    Done &mdash; {{ bp.channelsCreated }} channel(s) registered, {{ bp.moviesTagged }} movie(s) tagged
                  </p>
                }
                @if (bp.status === 'failed') {
                  <p class="text-red-400 text-sm">Backfill failed</p>
                }
                @if (bp.errors.length > 0) {
                  <details class="text-xs">
                    <summary class="text-yellow-400 cursor-pointer">{{ bp.errors.length }} warning(s)</summary>
                    <div class="mt-1 text-gray-500 max-h-20 overflow-y-auto">
                      @for (err of bp.errors.slice(0, 5); track err) {
                        <p>{{ err }}</p>
                      }
                    </div>
                  </details>
                }
              </div>
            }
          </div>

          <!-- Channel List -->
          @if (channels().length === 0) {
            <div class="text-center py-12 text-gray-500">
              <p class="text-lg mb-2">No channels configured yet</p>
              <p class="text-sm">Add a YouTube channel above, or click "Scan Existing Movies" to recover channels from your imported movies</p>
            </div>
          } @else {
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              @for (channel of channels(); track channel.id) {
                <div class="bg-[#120a0d] border border-[#5f1327]/40 rounded-lg p-4 hover:border-[#800020]/60 transition">
                  <div class="flex items-start justify-between mb-3">
                    <div>
                      <h3 class="text-white font-bold">{{ channel.name }}</h3>
                      <a [href]="channel.url" target="_blank" class="text-xs text-[#d6b87a] hover:underline">{{ channel.channelId }}</a>
                    </div>
                    <div class="flex gap-2">
                      <button
                        (click)="viewChannelVideos(channel)"
                        class="text-xs px-3 py-1.5 rounded bg-[#1b1014] text-gray-300 hover:text-white hover:bg-[#2d1a21] transition"
                      >
                        View Videos
                      </button>
                      <button
                        (click)="deleteChannel(channel.id)"
                        [disabled]="isDeletingChannel(channel.id)"
                        class="text-xs px-3 py-1.5 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 transition"
                      >
                        @if (isDeletingChannel(channel.id)) {
                          <span class="inline-block w-3 h-3 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin"></span>
                        } @else {
                          Delete
                        }
                      </button>
                    </div>
                  </div>

                  <!-- Stats -->
                  <div class="grid grid-cols-3 gap-2 mb-3">
                    <div class="bg-[#0d0d0d] rounded p-2 text-center">
                      <div class="text-lg font-bold text-white">{{ channel.stats.totalVideos }}</div>
                      <div class="text-[10px] text-gray-500 uppercase">Total</div>
                    </div>
                    <div class="bg-[#0d0d0d] rounded p-2 text-center">
                      <div class="text-lg font-bold text-green-400">{{ channel.stats.importedCount }}</div>
                      <div class="text-[10px] text-gray-500 uppercase">Imported</div>
                    </div>
                    <div class="bg-[#0d0d0d] rounded p-2 text-center">
                      <div class="text-lg font-bold text-[#d6b87a]">{{ channel.stats.remainingCount }}</div>
                      <div class="text-[10px] text-gray-500 uppercase">Remaining</div>
                    </div>
                  </div>

                  <!-- Last Synced -->
                  @if (channel.lastSyncedAt) {
                    <p class="text-xs text-gray-500 mb-3">
                      Last synced: {{ channel.lastSyncedAt | date:'medium' }}
                    </p>
                  }

                  <!-- Import Button -->
                  @if (channel.stats.remainingCount > 0) {
                    <button
                      (click)="startBatchImport(channel.channelId)"
                      [disabled]="isBatchImporting(channel.channelId)"
                      class="w-full bg-[#800020] hover:bg-[#660019] text-white py-2 rounded text-sm font-semibold disabled:opacity-50 transition"
                    >
                      @if (isBatchImporting(channel.channelId)) {
                        <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
                        Importing...
                      } @else {
                        Import All Remaining ({{ channel.stats.remainingCount }} videos)
                      }
                    </button>
                  }

                  <!-- Progress Bar -->
                  @if (batchImportProgress(channel.channelId); as progress) {
                    <div class="mt-3 space-y-2">
                      <div class="flex justify-between text-xs text-gray-400">
                        <span>Batch {{ progress.currentBatch }} of {{ progress.totalBatches }}</span>
                        <span>{{ progress.processed }} / {{ progress.total }}</span>
                      </div>
                      <div class="w-full bg-[#0d0d0d] rounded-full h-2">
                        <div 
                          class="bg-[#d6b87a] h-2 rounded-full transition-all"
                          [style.width.%]="(progress.processed / progress.total) * 100"
                        ></div>
                      </div>
                      <div class="flex gap-4 text-xs">
                        <span class="text-green-400">{{ progress.imported }} imported</span>
                        <span class="text-yellow-400">{{ progress.skipped }} skipped</span>
                        <span class="text-red-400">{{ progress.failed }} failed</span>
                      </div>
                      @if (progress.errors.length > 0) {
                        <details class="text-xs">
                          <summary class="text-red-400 cursor-pointer">{{ progress.errors.length }} errors</summary>
                          <div class="mt-1 text-gray-500 max-h-20 overflow-y-auto">
                            @for (error of progress.errors.slice(0, 5); track error) {
                              <p>{{ error }}</p>
                            }
                          </div>
                        </details>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }

          <!-- Batch Import All Channels -->
          @if (channels().length > 0 && totalRemaining() > 0) {
            <div class="bg-[#1b1014] border border-[#800020] rounded-lg p-4">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-white font-bold">Bulk Import All Channels</h3>
                  <p class="text-gray-400 text-sm">{{ totalRemaining() }} videos remaining across all channels</p>
                </div>
                <button
                  (click)="importAllChannels()"
                  [disabled]="isImportingAll()"
                  class="bg-[#800020] hover:bg-[#660019] text-white px-6 py-2 rounded text-sm font-semibold disabled:opacity-50 transition"
                >
                  @if (isImportingAll()) {
                    <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
                    Importing...
                  } @else {
                    Import All
                  }
                </button>
              </div>
            </div>
          }
        </div>
      }

      <!-- ============ CHANNEL DETAIL MODAL ============ -->
      @if (selectedChannel(); as channel) {
        <div class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div class="bg-[#120a0d] border border-[#5f1327] rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <!-- Header -->
            <div class="p-4 border-b border-[#5f1327] flex items-center justify-between">
              <div>
                <h3 class="text-white font-bold text-lg">{{ channel.name }}</h3>
                <p class="text-gray-400 text-sm">{{ channelVideos().length }} videos loaded</p>
              </div>
              <div class="flex items-center gap-3">
                @if (selectedChannelRemaining() > 0) {
                  <button
                    (click)="importSelectedChannelVideos()"
                    [disabled]="isImportingSelected()"
                    class="bg-[#800020] hover:bg-[#660019] text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
                  >
                    @if (isImportingSelected()) {
                      <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
                    }
                    Import {{ selectedChannelRemaining() }} Remaining
                  </button>
                }
                <button
                  (click)="closeChannelDetail()"
                  class="text-gray-400 hover:text-white text-xl"
                >
                  &times;
                </button>
              </div>
            </div>

            <!-- Filter Tabs -->
            <div class="flex gap-2 p-4 border-b border-[#5f1327] bg-[#0d0d0d]">
              <button
                (click)="videoFilter.set('all')"
                [class]="videoFilter() === 'all' ? 'text-white border-b-2 border-[#800020]' : 'text-gray-400 hover:text-white'"
                class="px-3 py-1 text-sm transition"
              >
                All ({{ channelVideos().length }})
              </button>
              <button
                (click)="videoFilter.set('not-imported')"
                [class]="videoFilter() === 'not-imported' ? 'text-white border-b-2 border-[#800020]' : 'text-gray-400 hover:text-white'"
                class="px-3 py-1 text-sm transition"
              >
                Not Imported ({{ selectedChannelRemaining() }})
              </button>
              <button
                (click)="videoFilter.set('imported')"
                [class]="videoFilter() === 'imported' ? 'text-white border-b-2 border-[#800020]' : 'text-gray-400 hover:text-white'"
                class="px-3 py-1 text-sm transition"
              >
                Imported ({{ importedChannelVideosCount() }})
              </button>
            </div>

            <!-- Video Grid -->
            <div class="flex-1 overflow-y-auto p-4">
              @if (isLoadingChannelVideos()) {
                <div class="text-center py-12">
                  <span class="inline-block w-8 h-8 border-2 border-[#800020] border-t-transparent rounded-full animate-spin"></span>
                  <p class="text-gray-400 mt-2">Loading videos...</p>
                </div>
              } @else if (filteredChannelVideos().length === 0) {
                <div class="text-center py-12 text-gray-500">
                  <p>No videos to display</p>
                </div>
              } @else {
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  @for (video of filteredChannelVideos(); track video.youtubeId) {
                    <div class="bg-[#1b1014] border rounded-lg overflow-hidden flex flex-col"
                         [class.border-green-800]="video.isImported"
                         [class.border-[#5f1327]]="!video.isImported">
                      <div class="relative">
                        <img [src]="video.thumbnail" class="w-full h-32 object-cover" [alt]="video.title">
                        @if (video.isImported) {
                          <div class="absolute top-2 right-2 bg-green-600 text-white text-xs px-2 py-1 rounded">
                            ✓ Imported
                          </div>
                        }
                      </div>
                      <div class="p-3 flex-grow">
                        <h4 class="text-white text-sm font-bold line-clamp-2">{{ video.title }}</h4>
                        <p class="text-gray-500 text-xs mt-1">
                          {{ video.publishedAt | date:'mediumDate' }}
                        </p>
                      </div>
                      <div class="p-3 pt-0">
                        @if (!video.isImported) {
                          <button
                            (click)="importSingleVideo(video)"
                            [disabled]="isImportingVideo(video.youtubeId)"
                            class="w-full bg-green-700 hover:bg-green-600 text-white text-xs py-2 rounded font-semibold disabled:opacity-50 transition"
                          >
                            @if (isImportingVideo(video.youtubeId)) {
                              <span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1"></span>
                            }
                            Import
                          </button>
                        } @else {
                          <button
                            disabled
                            class="w-full bg-green-900/50 text-green-400 text-xs py-2 rounded cursor-default"
                          >
                            ✓ Already Imported
                          </button>
                        }
                      </div>
                    </div>
                  }
                </div>

                <!-- Load More -->
                @if (channelNextPageToken()) {
                  <div class="text-center mt-4">
                    <button
                      (click)="loadMoreChannelVideos()"
                      [disabled]="isLoadingMoreVideos()"
                      class="bg-[#5f1327] hover:bg-[#800020] text-white px-6 py-2 rounded text-sm disabled:opacity-50"
                    >
                      @if (isLoadingMoreVideos()) {
                        <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
                      }
                      Load More Videos
                    </button>
                  </div>
                }
              }
            </div>
          </div>
        </div>
      }

      <!-- ============ ADD CHANNELS TAB (BULK IMPORT) ============ -->
      @if (activeTab() === 'channels') {
        <!-- ... existing channels tab content ... -->
      }

      <!-- ============ SEARCH BY TITLE TAB ============ -->
      @if (activeTab() === 'search') {
        <!-- ... existing search tab content ... -->
      }

      <!-- ============ TRENDING SCAN TAB ============ -->
      @if (activeTab() === 'trending') {
        <!-- ... existing trending tab content ... -->
      }

      <!-- ============ RSS TAB ============ -->
      @if (activeTab() === 'rss') {
        <!-- ... existing rss tab content ... -->
      }
    </div>
  `
})
export class ContentDiscoveryComponent {
  private http = inject(HttpClient);

  activeTab = signal<'my-channels' | 'channels' | 'search' | 'trending' | 'rss'>('my-channels');

  // Channels state
  channels = signal<Channel[]>([]);
  newChannelUrl = signal('');
  isAddingChannel = signal(false);
  channelAddError = signal<string | null>(null);
  deletingChannelIds = signal<Set<string>>(new Set());

  // Batch import state
  batchImportingChannels = signal<Set<string>>(new Set());
  importProgressMap = signal<Map<string, BatchImportProgress>>(new Map());
  progressPollingIntervals = new Map<string, number>();
  isImportingAll = signal(false);

  // Backfill state
  isBackfilling = signal(false);
  backfillJobId = signal<string | null>(null);
  backfillProgress = signal<{ processed: number; total: number; channelsCreated: number; moviesTagged: number; status: string; errors: string[] } | null>(null);
  private backfillPollInterval: number | null = null;

  // Channel detail state
  selectedChannel = signal<Channel | null>(null);
  channelVideos = signal<YouTubeVideo[]>([]);
  videoFilter = signal<'all' | 'imported' | 'not-imported'>('all');
  isLoadingChannelVideos = signal(false);
  isLoadingMoreVideos = signal(false);
  channelNextPageToken = signal<string | null>(null);
  importingVideoIds = signal<Set<string>>(new Set());
  isImportingSelected = signal(false);

  // Computed values
  totalRemaining = computed(() => 
    this.channels().reduce((sum, ch) => sum + ch.stats.remainingCount, 0)
  );

  filteredChannelVideos = computed(() => {
    const filter = this.videoFilter();
    const videos = this.channelVideos();
    
    switch (filter) {
      case 'imported':
        return videos.filter(v => v.isImported);
      case 'not-imported':
        return videos.filter(v => !v.isImported);
      default:
        return videos;
    }
  });

  selectedChannelRemaining = computed(() => {
    return this.channelVideos().filter(v => !v.isImported).length;
  });

  importedChannelVideosCount = computed(() => {
    return this.channelVideos().filter((video) => !!video.isImported).length;
  });

  constructor() {
    this.loadChannels();
  }

  // ===== Channel Management =====

  loadChannels() {
    this.http.get<{ status: string; data: Channel[] }>('/api/v1/admin/youtube/channels')
      .subscribe({
        next: (response) => {
          this.channels.set(response.data);
        },
        error: (error) => {
          console.error('Error loading channels:', error);
        }
      });
  }

  addChannel() {
    const url = this.newChannelUrl().trim();
    if (!url) return;

    this.isAddingChannel.set(true);
    this.channelAddError.set(null);

    this.http.post<{ status: string; data: Channel }>('/api/v1/admin/youtube/channels', { url })
      .subscribe({
        next: (response) => {
          this.channels.update(channels => [response.data, ...channels]);
          this.newChannelUrl.set('');
          this.isAddingChannel.set(false);
        },
        error: (error) => {
          this.channelAddError.set(error.error?.message || 'Failed to add channel');
          this.isAddingChannel.set(false);
        }
      });
  }

  deleteChannel(id: string) {
    this.deletingChannelIds.update(ids => {
      ids.add(id);
      return new Set(ids);
    });

    this.http.delete<{ status: string }>(`/api/v1/admin/youtube/channels/${id}`)
      .subscribe({
        next: () => {
          this.channels.update(channels => channels.filter(c => c.id !== id));
          this.deletingChannelIds.update(ids => {
            ids.delete(id);
            return new Set(ids);
          });
        },
        error: (error) => {
          console.error('Error deleting channel:', error);
          alert('Failed to delete channel');
          this.deletingChannelIds.update(ids => {
            ids.delete(id);
            return new Set(ids);
          });
        }
      });
  }

  isDeletingChannel(id: string): boolean {
    return this.deletingChannelIds().has(id);
  }

  // ===== Batch Import =====

  startBatchImport(channelId: string) {
    this.batchImportingChannels.update(ids => {
      ids.add(channelId);
      return new Set(ids);
    });

    this.http.post<{ status: string; data: { progressId: string } }>(
      `/api/v1/admin/youtube/channels/${channelId}/import-remaining`,
      { batchSize: 10 }
    ).subscribe({
      next: (response) => {
        const progressId = response.data.progressId;
        this.startProgressPolling(channelId, progressId);
      },
      error: (error) => {
        console.error('Error starting batch import:', error);
        alert('Failed to start batch import');
        this.batchImportingChannels.update(ids => {
          ids.delete(channelId);
          return new Set(ids);
        });
      }
    });
  }

  startProgressPolling(channelId: string, progressId: string) {
    const intervalId = window.setInterval(() => {
      this.http.get<{ status: string; data: BatchImportProgress }>(
        `/api/v1/admin/youtube/import-progress/${progressId}`
      ).subscribe({
        next: (response) => {
          const progress = response.data;
          
          this.importProgressMap.update(map => {
            map.set(channelId, progress);
            return new Map(map);
          });

          if (progress.status === 'completed' || progress.status === 'failed') {
            window.clearInterval(intervalId);
            this.progressPollingIntervals.delete(channelId);
            
            this.batchImportingChannels.update(ids => {
              ids.delete(channelId);
              return new Set(ids);
            });

            // Refresh channels to update stats
            this.loadChannels();
          }
        },
        error: (error) => {
          console.error('Error polling progress:', error);
          window.clearInterval(intervalId);
          this.progressPollingIntervals.delete(channelId);
        }
      });
    }, 2000);

    this.progressPollingIntervals.set(channelId, intervalId);
  }

  batchImportProgress(channelId: string): BatchImportProgress | null {
    return this.importProgressMap().get(channelId) || null;
  }

  isBatchImporting(channelId: string): boolean {
    return this.batchImportingChannels().has(channelId);
  }

  async importAllChannels() {
    this.isImportingAll.set(true);
    
    for (const channel of this.channels()) {
      if (channel.stats.remainingCount > 0) {
        await new Promise<void>((resolve) => {
          this.startBatchImport(channel.channelId);
          
          // Wait for this channel to complete before moving to next
          const checkInterval = window.setInterval(() => {
            if (!this.isBatchImporting(channel.channelId)) {
              window.clearInterval(checkInterval);
              resolve();
            }
          }, 1000);
        });
      }
    }

    this.isImportingAll.set(false);
  }

  // ===== Channel Detail View =====

  viewChannelVideos(channel: Channel) {
    this.selectedChannel.set(channel);
    this.channelVideos.set([]);
    this.channelNextPageToken.set(null);
    this.videoFilter.set('all');
    this.loadChannelVideos(channel.channelId);
  }

  loadChannelVideos(channelId: string, pageToken?: string) {
    if (!pageToken) {
      this.isLoadingChannelVideos.set(true);
    } else {
      this.isLoadingMoreVideos.set(true);
    }

    const params: { pageToken?: string; maxResults: number } = { maxResults: 50 };
    if (pageToken) {
      params.pageToken = pageToken;
    }

    this.http.get<{ status: string; data: ChannelVideosResult }>(
      `/api/v1/admin/youtube/channels/${channelId}/videos`,
      { params }
    ).subscribe({
      next: (response) => {
        if (pageToken) {
          this.channelVideos.update(videos => [...videos, ...response.data.videos]);
        } else {
          this.channelVideos.set(response.data.videos);
        }
        this.channelNextPageToken.set(response.data.nextPageToken);
        this.isLoadingChannelVideos.set(false);
        this.isLoadingMoreVideos.set(false);
      },
      error: (error) => {
        console.error('Error loading channel videos:', error);
        this.isLoadingChannelVideos.set(false);
        this.isLoadingMoreVideos.set(false);
      }
    });
  }

  loadMoreChannelVideos() {
    const token = this.channelNextPageToken();
    const channel = this.selectedChannel();
    if (token && channel) {
      this.loadChannelVideos(channel.channelId, token);
    }
  }

  closeChannelDetail() {
    this.selectedChannel.set(null);
    this.channelVideos.set([]);
    this.videoFilter.set('all');
  }

  importSingleVideo(video: YouTubeVideo) {
    this.importingVideoIds.update(ids => {
      ids.add(video.youtubeId);
      return new Set(ids);
    });

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
        this.channelVideos.update(videos => 
          videos.map(v => v.youtubeId === video.youtubeId ? { ...v, isImported: true } : v)
        );
        this.importingVideoIds.update(ids => {
          ids.delete(video.youtubeId);
          return new Set(ids);
        });
      },
      error: (error) => {
        console.error('Error importing video:', error);
        alert('Failed to import video');
        this.importingVideoIds.update(ids => {
          ids.delete(video.youtubeId);
          return new Set(ids);
        });
      }
    });
  }

  isImportingVideo(youtubeId: string): boolean {
    return this.importingVideoIds().has(youtubeId);
  }

  importSelectedChannelVideos() {
    const channel = this.selectedChannel();
    if (!channel) return;

    this.isImportingSelected.set(true);
    this.startBatchImport(channel.channelId);
    
    // Poll until complete
    const checkInterval = window.setInterval(() => {
      if (!this.isBatchImporting(channel.channelId)) {
        window.clearInterval(checkInterval);
        this.isImportingSelected.set(false);
        // Refresh videos
        this.loadChannelVideos(channel.channelId);
      }
    }, 1000);
  }

  // ===== Backfill Channels from Existing Movies =====

  backfillChannels() {
    this.isBackfilling.set(true);
    this.backfillProgress.set(null);
    this.backfillJobId.set(null);

    this.http.post<{ status: string; data: { jobId: string } }>(
      '/api/v1/admin/youtube/channels/backfill',
      {}
    ).subscribe({
      next: (response) => {
        const jobId = response.data.jobId;
        this.backfillJobId.set(jobId);
        this.startBackfillPolling(jobId);
      },
      error: (error) => {
        console.error('Backfill failed to start:', error);
        this.backfillProgress.set({ processed: 0, total: 0, channelsCreated: 0, moviesTagged: 0, status: 'failed', errors: [error.error?.message || 'Failed to start backfill'] });
        this.isBackfilling.set(false);
      }
    });
  }

  private startBackfillPolling(jobId: string) {
    if (this.backfillPollInterval !== null) {
      window.clearInterval(this.backfillPollInterval);
    }

    this.backfillPollInterval = window.setInterval(() => {
      this.http.get<{ status: string; data: { processed: number; total: number; channelsCreated: number; moviesTagged: number; status: string; errors: string[] } }>(
        `/api/v1/admin/youtube/channels/backfill/${jobId}`
      ).subscribe({
        next: (response) => {
          this.backfillProgress.set(response.data);

          if (response.data.status === 'completed' || response.data.status === 'failed') {
            window.clearInterval(this.backfillPollInterval!);
            this.backfillPollInterval = null;
            this.isBackfilling.set(false);
            // Reload channels list to show newly discovered ones
            this.loadChannels();
          }
        },
        error: (error) => {
          console.error('Backfill polling error:', error);
          window.clearInterval(this.backfillPollInterval!);
          this.backfillPollInterval = null;
          this.isBackfilling.set(false);
        }
      });
    }, 2000);
  }
}
