import {
  AfterViewInit,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
  ElementRef,
  inject,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { WatchApiService } from '../../../features/watch/services/watch-api.service';
import { AnonymousWatchService } from '../../../core/services/anonymous-watch.service';
import { AuthStateService } from '../../../core/auth/auth-state.service';
import { BrandLogoComponent } from '../brand-logo/brand-logo.component';
import { MovieSummary } from '@naijaspride/types';
import { HttpClient } from '@angular/common/http';

interface SubtitleInfo {
  language: string;
  url: string;
  name: string;
}

interface VideoPlayerConfig {
  movieId?: string;
  showSkipButtons?: boolean;
  autoResume?: boolean;
  saveProgress?: boolean;
}

interface QualityLevel {
  height: number;
  width: number;
  bitrate: number;
  level: number;
  label: string;
}

type YouTubeWindow = Window & {
  YT?: {
    Player?: new (container: Element, options: unknown) => unknown;
  };
  __npYoutubeApiPromise?: Promise<void>;
  onYouTubeIframeAPIReady?: (() => void) | null;
};

@Component({
  selector: 'app-video-player',
  standalone: true,
  imports: [CommonModule, BrandLogoComponent],
  template: `
    <div class="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl group"
         tabindex="0"
         (keydown)="onKeydown($event)"
         #playerContainer>
      
      @if (youtubeId) {
        <div class="relative w-full h-full">
          <div #youtubeContainer class="w-full h-full"></div>
        </div>
      }

      @if (videoUrl && !youtubeId) {
        <div class="relative w-full h-full">
           <video 
              #videoPlayer
              [attr.src]="nativeVideoSrc" 
              class="w-full h-full object-contain"
              controls
              controlsList="nodownload"
              aria-label="Video player"
              (timeupdate)="onTimeUpdate()"
              (loadedmetadata)="onMetadataLoaded()"
              (play)="onPlay()"
              (pause)="onPause()"
              (waiting)="onBufferingStart()"
              (playing)="onBufferingEnd()"
              (canplay)="onBufferingEnd()">
             
             <!-- Subtitle Track -->
             @if (subtitleTrackUrl) {
               <track 
                 kind="subtitles" 
                 [src]="subtitleTrackUrl" 
                 srclang="en" 
                 label="Subtitles"
                 [default]="showSubtitles">
             }
           </video>
           
           <!-- Quality Selector Overlay (HLS only) -->
           @if (showQualitySelector && qualityLevels.length > 1) {
             <div class="absolute top-4 left-4 z-20">
               <div class="relative group/quality">
                 <button 
                   (click)="toggleQualityMenu()"
                   aria-label="Video quality"
                   class="bg-black/70 hover:bg-black/90 text-white px-3 py-1.5 rounded backdrop-blur-sm transition-colors text-sm font-medium flex items-center gap-2">
                   <span>{{ selectedQualityLabel }}</span>
                   <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                   </svg>
                 </button>
                 
                 @if (qualityMenuOpen) {
                   <div class="absolute top-full left-0 mt-1 bg-black/90 rounded-lg overflow-hidden min-w-[140px] shadow-xl">
                     @for (level of qualityLevels; track level.level) {
                       <button
                         (click)="setQualityLevel(level.level)"
                         class="w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors"
                         [class.text-white]="currentLevel !== level.level"
                         [class.text-red-400]="currentLevel === level.level"
                         [class.font-medium]="currentLevel === level.level">
                         {{ level.label }}
                         @if (currentLevel === level.level) {
                           <span class="ml-2">✓</span>
                         }
                       </button>
                     }
                     <div class="border-t border-white/10"></div>
                     <button
                       (click)="setAutoQuality()"
                       class="w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors"
                       [class.text-white]="!autoQualityEnabled"
                       [class.text-red-400]="autoQualityEnabled"
                       [class.font-medium]="autoQualityEnabled">
                       Auto
                       @if (autoQualityEnabled) {
                         <span class="ml-2">✓</span>
                       }
                     </button>
                   </div>
                 }
               </div>
             </div>
           }
           
           <!-- Skip Buttons Overlay -->
           @if (config.showSkipButtons && showControls) {
             <div class="absolute inset-0 flex items-center justify-between px-8 pointer-events-none">
               <!-- Rewind Button -->
               <button 
                 (click)="skip(-10)"
                 aria-label="Rewind 10 seconds"
                 class="pointer-events-auto bg-black/60 hover:bg-black/80 text-white p-4 rounded-full transition-all transform hover:scale-110 backdrop-blur-sm group/skip">
                 <div class="flex flex-col items-center">
                   <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                           d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"/>
                   </svg>
                   <span class="text-xs mt-1 opacity-0 group-hover/skip:opacity-100 transition-opacity">-10s</span>
                 </div>
               </button>

               <!-- Forward Button -->
               <button 
                 (click)="skip(30)"
                 aria-label="Skip forward 30 seconds"
                 class="pointer-events-auto bg-black/60 hover:bg-black/80 text-white p-4 rounded-full transition-all transform hover:scale-110 backdrop-blur-sm group/skip">
                 <div class="flex flex-col items-center">
                   <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                           d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z"/>
                   </svg>
                   <span class="text-xs mt-1 opacity-0 group-hover/skip:opacity-100 transition-opacity">+30s</span>
                 </div>
               </button>
             </div>
           }

            <!-- Buffering Spinner -->
            @if (isBuffering) {
              <div class="absolute inset-0 flex items-center justify-center bg-black/30 z-20 pointer-events-none">
                <div class="animate-spin rounded-full h-16 w-16 border-4 border-white/30 border-t-white"></div>
              </div>
            }

            <!-- Fullscreen Button -->
            @if (showControls) {
              <div class="absolute bottom-20 left-4 z-10">
                <button 
                  (click)="toggleFullscreen()"
                  aria-label="Toggle fullscreen"
                  class="bg-black/60 hover:bg-black/80 text-white p-2 rounded backdrop-blur-sm transition-colors">
                  @if (isFullscreen) {
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                            d="M6 18L18 6M6 6l12 12M4 10V4h6M20 14v6h-6M20 10V4h-6M4 14v6h6"></path>
                    </svg>
                  } @else {
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
                    </svg>
                  }
                </button>
              </div>
            }

            <!-- CC Button & Subtitle Upload -->
            @if (showControls) {
              <div class="absolute bottom-20 right-4 z-10">
                <div class="relative group/cc">
                  <button 
                    (click)="toggleSubtitles()"
                    aria-label="Toggle subtitles"
                    class="bg-black/60 hover:bg-black/80 text-white p-2 rounded backdrop-blur-sm transition-colors"
                    [class.text-red-500]="showSubtitles && subtitleTrackUrl">
                    <span class="font-bold border-2 border-current rounded px-1 text-xs">CC</span>
                  </button>
                  
                  <div class="absolute bottom-12 right-0 bg-black/90 p-2 rounded hidden group-hover/cc:block min-w-[220px]">
                    <!-- Search Subtitles Button -->
                    <button
                      (click)="searchOpenSubtitles()"
                      [disabled]="searchingSubtitles"
                      class="cursor-pointer text-xs text-white hover:bg-white/10 block p-2 w-full text-left">
                      @if (searchingSubtitles) {
                        <span class="flex items-center gap-2">
                          <span class="animate-spin h-3 w-3 border-2 border-white/30 border-t-white rounded-full"></span>
                          Searching...
                        </span>
                      } @else {
                        Search OpenSubtitles
                      }
                    </button>
                    
                    <div class="border-t border-white/10 my-1"></div>
                    
                    <!-- Available Subtitles -->
                    @if (availableSubtitles.length > 0) {
                      <div class="mb-2">
                        <p class="text-xs text-gray-400 px-2 py-1">Available Subtitles:</p>
                        @for (sub of availableSubtitles; track sub.url) {
                          <button
                            (click)="loadSubtitle(sub)"
                            class="text-xs text-gray-300 hover:text-white hover:bg-white/10 block p-2 w-full text-left">
                            {{ sub.language }} - {{ sub.name }}
                          </button>
                        }
                      </div>
                      <div class="border-t border-white/10 my-1"></div>
                    }
                    
                    <label class="cursor-pointer text-xs text-gray-300 hover:text-white block p-2">
                      Upload Subtitle (.vtt, .srt)
                      <input
                        type="file"
                        accept=".vtt,.srt"
                        (change)="onSubtitleSelected($event)"
                        class="hidden"
                        aria-label="Upload subtitle file"
                      >
                    </label>
                    @if (subtitleTrackUrl) {
                      <button 
                        (click)="clearSubtitles()"
                        class="text-xs text-red-400 hover:text-red-300 block p-2 w-full text-left">
                        Clear Subtitles
                      </button>
                    }
                  </div>
                </div>
              </div>
            }

        </div>
      }

      <!-- Resume Dialog (works for both MP4 and YouTube) -->
      @if (showResumeDialog && savedProgress > 0) {
        <div class="absolute inset-0 flex items-center justify-center bg-black/70 z-50">
          <div class="bg-gray-900 p-6 rounded-lg max-w-md text-center">
            <h3 class="text-white text-xl font-bold mb-2">Resume Watching?</h3>
            <p class="text-gray-400 mb-4">
              You left off at {{ formatTime(savedProgress) }}. Would you like to resume?
            </p>
            <div class="flex gap-4 justify-center">
              <button 
                (click)="resumeFromSaved()"
                class="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-full font-medium transition-colors">
                Resume
              </button>
              <button 
                (click)="startFromBeginning()"
                class="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-full font-medium transition-colors">
                Start Over
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Brand Watermark -->
      <div class="absolute top-4 right-4 bg-black/45 text-white text-[10px] font-bold px-2 py-1 rounded-md opacity-60 hover:opacity-100 transition-opacity pointer-events-none flex items-center gap-1.5 backdrop-blur-sm border border-white/10">
        <app-brand-logo variant="mark" alt="NaijasPride" className="h-4 w-auto object-contain" />
        <span>STREAM</span>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class VideoPlayerComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() youtubeId?: string | null;
  @Input() videoUrl?: string | null;
  @Input() movieId?: string;
  @Input() movie?: MovieSummary; // For anonymous progress tracking
  @Input() config: VideoPlayerConfig = {
    showSkipButtons: true,
    autoResume: true,
    saveProgress: true
  };
  @Output() playerReady = new EventEmitter<void>();

  @ViewChild('videoPlayer') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('youtubeContainer') youtubeContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('playerContainer') playerContainer!: ElementRef<HTMLDivElement>;

  private watchApi = inject(WatchApiService);
  private anonymousWatch = inject(AnonymousWatchService);
  private authState = inject(AuthStateService);
  private http = inject(HttpClient);
  private destroy$ = new Subject<void>();
  private progressUpdate = new Subject<number>();

  private youtubePlayer: any | null = null;
  private youtubePollTimer?: ReturnType<typeof setInterval>;
  private youtubeInitInFlight = false;

  private hls: any | null = null;
  private hlsInitSeq = 0;

  showControls = true;
  showResumeDialog = false;
  savedProgress = 0;
  duration = 0;
  isPlaying = false;
  isBuffering = false;
  isFullscreen = false;
  
  // Subtitle state
  subtitleTrackUrl: string | null = null;
  showSubtitles = true;
  availableSubtitles: SubtitleInfo[] = [];
  searchingSubtitles = false;

  // Quality selector state
  showQualitySelector = false;
  qualityLevels: QualityLevel[] = [];
  currentLevel = -1;
  autoQualityEnabled = true;
  qualityMenuOpen = false;

  private get isAuthenticated(): boolean {
    return this.authState.isAuthenticated();
  }

  ngOnInit() {
    this.progressUpdate.pipe(
      debounceTime(5000),
      takeUntil(this.destroy$)
    ).subscribe(progress => {
      this.saveProgress(progress);
    });

    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
  }

  private onFullscreenChange = () => {
    this.isFullscreen = !!document.fullscreenElement;
  };

  onKeydown(event: KeyboardEvent) {
    if (this.showResumeDialog) {
      return; // Don't process keys while resume dialog is shown
    }

    switch (event.key) {
      case ' ':
      case 'Spacebar':
        event.preventDefault();
        this.togglePlayPause();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.skip(-10);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.skip(30);
        break;
      case 'f':
      case 'F':
        event.preventDefault();
        this.toggleFullscreen();
        break;
      case 'm':
      case 'M':
        event.preventDefault();
        this.toggleMute();
        break;
    }
  }

  togglePlayPause() {
    if (this.youtubeId && this.youtubePlayer) {
      try {
        const state = this.youtubePlayer.getPlayerState?.();
        if (state === 1) {
          this.youtubePlayer.pauseVideo?.();
        } else {
          this.youtubePlayer.playVideo?.();
        }
      } catch {
        // ignore
      }
      return;
    }

    const video = this.videoRef?.nativeElement;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }

  toggleMute() {
    const video = this.videoRef?.nativeElement;
    if (!video) return;
    video.muted = !video.muted;
  }

  toggleFullscreen() {
    const container = this.playerContainer?.nativeElement;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.().catch(() => {
        // Fallback for browsers that don't support fullscreen
      });
    } else {
      document.exitFullscreen?.();
    }
  }

  onBufferingStart() {
    this.isBuffering = true;
  }

  onBufferingEnd() {
    this.isBuffering = false;
  }

  searchOpenSubtitles() {
    if (!this.movieId || this.searchingSubtitles) return;
    
    this.searchingSubtitles = true;
    this.http.get<{ success: boolean; data?: SubtitleInfo[] }>(`/api/v1/movies/${this.movieId}/subtitles`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.searchingSubtitles = false;
          if (response.success && response.data) {
            this.availableSubtitles = response.data;
            if (this.availableSubtitles.length === 0) {
              // Show a toast or message - for now just log
              console.log('No subtitles found for this movie');
            }
          }
        },
        error: (err) => {
          this.searchingSubtitles = false;
          console.error('Failed to search subtitles:', err);
        }
      });
  }

  loadSubtitle(subtitle: SubtitleInfo) {
    // Revoke old URL if exists
    if (this.subtitleTrackUrl) {
      URL.revokeObjectURL(this.subtitleTrackUrl);
    }
    
    this.subtitleTrackUrl = subtitle.url;
    this.showSubtitles = true;
    
    // Force show subtitles on the video
    setTimeout(() => {
      if (this.videoRef?.nativeElement) {
        const video = this.videoRef.nativeElement;
        const tracks = video.textTracks;
        if (tracks.length > 0) {
          tracks[0].mode = 'showing';
        }
      }
    }, 100);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['youtubeId']) {
      // YouTube needs JS API for progress tracking and resume.
      this.setupYouTubePlayer();
      if (this.youtubeId) {
        this.destroyHls();
      }
    }

    if (changes['videoUrl']) {
      void this.setupHlsIfNeeded();
    }

    if (changes['movieId'] && this.movieId && this.config.autoResume) {
      this.loadSavedProgress();
    }
  }

  ngAfterViewInit(): void {
    this.setupYouTubePlayer();
    void this.setupHlsIfNeeded();
  }

  ngOnDestroy() {
    this.destroyHls();
    this.stopYouTubePolling();
    if (this.videoRef?.nativeElement && this.config.saveProgress && this.movieId) {
      const currentTime = this.videoRef.nativeElement.currentTime;
      if (currentTime > 0) {
        this.saveProgress(Math.floor(currentTime));
      }
    }

    if (this.youtubePlayer && this.config.saveProgress && this.movieId) {
      try {
        const current = Math.floor(Number(this.youtubePlayer.getCurrentTime?.() || 0));
        if (current > 0) {
          this.saveProgress(current);
        }
      } catch {
        // ignore
      }
    }

    try {
      this.youtubePlayer?.destroy?.();
    } catch {
      // ignore
    }
    this.youtubePlayer = null;

    this.destroy$.next();
    this.destroy$.complete();
    
    // Clean up event listeners
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    
    // Clean up subtitle object URL
    if (this.subtitleTrackUrl) {
      URL.revokeObjectURL(this.subtitleTrackUrl);
    }

    // Clean up quality menu click listener
    this.closeQualityMenu();
  }

  get nativeVideoSrc(): string | null {
    if (this.youtubeId) return null;
    const url = (this.videoUrl || '').trim();
    if (!url) return null;
    if (!this.isHlsUrl(url)) return url;
    return this.canPlayHlsNatively() ? url : null;
  }

  get selectedQualityLabel(): string {
    if (this.autoQualityEnabled) return 'Auto';
    const level = this.qualityLevels.find(l => l.level === this.currentLevel);
    return level?.label || 'Auto';
  }

  private isHlsUrl(url: string): boolean {
    const raw = (url || '').trim();
    if (!raw) return false;

    const withoutHash = raw.split('#')[0] || raw;
    try {
      const parsed = new URL(withoutHash, 'http://localhost');
      const key = parsed.searchParams.get('key');
      const target = (key || parsed.pathname || '').toLowerCase();
      return target.endsWith('.m3u8');
    } catch {
      const clean = (withoutHash.split('?')[0] || '').toLowerCase();
      return clean.endsWith('.m3u8');
    }
  }

  private canPlayHlsNatively(): boolean {
    try {
      const video = document.createElement('video');
      const a = video.canPlayType('application/vnd.apple.mpegurl');
      const b = video.canPlayType('application/x-mpegURL');
      return !!(a || b);
    } catch {
      return false;
    }
  }

  private async setupHlsIfNeeded(): Promise<void> {
    if (this.youtubeId) return;
    const url = (this.videoUrl || '').trim();
    if (!url) {
      this.destroyHls();
      return;
    }

    if (!this.isHlsUrl(url)) {
      this.destroyHls();
      return;
    }

    // Show quality selector for HLS
    this.showQualitySelector = true;

    if (this.canPlayHlsNatively()) {
      // Safari can play HLS directly via src.
      this.destroyHls();
      return;
    }

    const video = this.videoRef?.nativeElement;
    if (!video) {
      return;
    }

    this.destroyHls();
    const seq = ++this.hlsInitSeq;

    try {
      const { default: Hls } = await import('hls.js');
      if (seq !== this.hlsInitSeq) return;
      if (!Hls?.isSupported?.()) {
        console.warn('[VideoPlayer] HLS.js not supported in this browser');
        return;
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        // Start with auto quality
        startLevel: -1,
      });
      this.hls = hls;
      this.autoQualityEnabled = true;

      // Listen for quality levels becoming available
      hls.on(Hls.Events.MANIFEST_PARSED, (_event: any, data: any) => {
        if (data?.levels) {
          this.qualityLevels = data.levels.map((level: any, index: number) => ({
            level: index,
            height: level.height,
            width: level.width,
            bitrate: level.bitrate,
            label: this.getQualityLabel(level.height, level.bitrate),
          }));
          console.log('[VideoPlayer] Quality levels available:', this.qualityLevels.length);
        }
      });

      // Listen for level switches
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event: any, data: any) => {
        this.currentLevel = data.level;
        console.log('[VideoPlayer] Quality changed to level:', data.level);
      });

      hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
        if (!data) return;
        if (data.fatal) {
          console.error('[VideoPlayer] HLS fatal error:', data.type, data.details);
          try {
            hls.destroy();
          } catch {
            // ignore
          }
          if (this.hls === hls) {
            this.hls = null;
          }
        }
      });

      hls.attachMedia(video);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        try {
          hls.loadSource(url);
        } catch {
          // ignore
        }
      });
    } catch (error) {
      console.error('[VideoPlayer] Failed to load HLS.js', error);
    }
  }

  private getQualityLabel(height: number, bitrate: number): string {
    if (height >= 2160) return '4K';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    return `${height}p`;
  }

  toggleQualityMenu() {
    this.qualityMenuOpen = !this.qualityMenuOpen;
    if (this.qualityMenuOpen) {
      // Close menu when clicking outside
      setTimeout(() => {
        document.addEventListener('click', this.handleOutsideClick);
      }, 0);
    }
  }

  closeQualityMenu() {
    this.qualityMenuOpen = false;
    document.removeEventListener('click', this.handleOutsideClick);
  }

  private handleOutsideClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (!target.closest('.group\\/quality')) {
      this.closeQualityMenu();
    }
  };

  setQualityLevel(level: number) {
    if (this.hls) {
      this.hls.currentLevel = level;
      this.autoQualityEnabled = false;
      console.log('[VideoPlayer] Manual quality set to level:', level);
    }
    this.closeQualityMenu();
  }

  setAutoQuality() {
    if (this.hls) {
      this.hls.currentLevel = -1; // -1 = auto
      this.autoQualityEnabled = true;
      console.log('[VideoPlayer] Auto quality enabled');
    }
    this.closeQualityMenu();
  }

  private destroyHls(): void {
    this.hlsInitSeq++;
    if (!this.hls) return;
    try {
      this.hls.destroy();
    } catch {
      // ignore
    }
    this.hls = null;
    this.qualityLevels = [];
    this.currentLevel = -1;
    this.autoQualityEnabled = true;
    this.showQualitySelector = false;
    this.closeQualityMenu();
  }

  // Subtitle Methods
  onSubtitleSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      // Revoke old URL if exists
      if (this.subtitleTrackUrl) {
        URL.revokeObjectURL(this.subtitleTrackUrl);
      }
      
      const url = URL.createObjectURL(file);
      this.subtitleTrackUrl = url;
      this.showSubtitles = true;
      
      // Force show subtitles on the video
      setTimeout(() => {
        if (this.videoRef?.nativeElement) {
          const video = this.videoRef.nativeElement;
          const tracks = video.textTracks;
          if (tracks.length > 0) {
            tracks[0].mode = 'showing';
          }
        }
      }, 100);
    }
  }

  toggleSubtitles() {
    if (!this.subtitleTrackUrl) return;
    
    this.showSubtitles = !this.showSubtitles;
    
    if (this.videoRef?.nativeElement) {
      const video = this.videoRef.nativeElement;
      const tracks = video.textTracks;
      if (tracks.length > 0) {
        tracks[0].mode = this.showSubtitles ? 'showing' : 'hidden';
      }
    }
  }

  clearSubtitles() {
    if (this.subtitleTrackUrl) {
      URL.revokeObjectURL(this.subtitleTrackUrl);
      this.subtitleTrackUrl = null;
      this.showSubtitles = false;
    }
  }

  // Progress & Resume Methods
  private loadSavedProgress() {
    if (!this.movieId || !this.config.autoResume) return;
    
    if (this.isAuthenticated) {
      // Use API for authenticated users
      this.watchApi.getProgress(this.movieId).pipe(
        takeUntil(this.destroy$)
      ).subscribe(response => {
        if (response.data && response.data.progress > 30) {
          this.savedProgress = response.data.progress;
          this.showResumeDialog = true;
        }
      });
    } else {
      // Use localStorage for anonymous users
      const progress = this.anonymousWatch.getProgress(this.movieId);
      if (progress && progress.lastPosition > 30) {
        this.savedProgress = progress.lastPosition;
        this.showResumeDialog = true;
      }
    }
  }

  resumeFromSaved() {
    if (this.youtubeId && this.youtubePlayer) {
      try {
        this.youtubePlayer.seekTo?.(this.savedProgress, true);
        this.youtubePlayer.playVideo?.();
      } catch {
        // ignore
      }
    } else if (this.videoRef?.nativeElement) {
      this.videoRef.nativeElement.currentTime = this.savedProgress;
      this.videoRef.nativeElement.play();
    }
    this.showResumeDialog = false;
    this.playerReady.emit();
  }

  startFromBeginning() {
    this.showResumeDialog = false;
    if (this.youtubeId && this.youtubePlayer) {
      try {
        this.youtubePlayer.seekTo?.(0, true);
        this.youtubePlayer.playVideo?.();
      } catch {
        // ignore
      }
    } else if (this.videoRef?.nativeElement) {
      this.videoRef.nativeElement.currentTime = 0;
      this.videoRef.nativeElement.play();
    }
    this.playerReady.emit();
  }

  skip(seconds: number) {
    if (this.youtubeId && this.youtubePlayer) {
      try {
        const current = Number(this.youtubePlayer.getCurrentTime?.() || 0);
        const duration = Number(this.youtubePlayer.getDuration?.() || 0);
        const next = Math.max(0, Math.min(current + seconds, duration || current + seconds));
        this.youtubePlayer.seekTo?.(next, true);
      } catch {
        // ignore
      }
      return;
    }

    if (!this.videoRef?.nativeElement) return;
    const video = this.videoRef.nativeElement;
    const newTime = Math.max(0, Math.min(video.currentTime + seconds, video.duration || 0));
    video.currentTime = newTime;
  }

  onTimeUpdate() {
    if (!this.videoRef?.nativeElement || !this.config.saveProgress) return;
    
    const video = this.videoRef.nativeElement;
    const currentTime = Math.floor(video.currentTime);
    this.progressUpdate.next(currentTime);
  }

  onMetadataLoaded() {
    if (this.videoRef?.nativeElement) {
      this.duration = this.videoRef.nativeElement.duration;
    }
  }

  onPlay() {
    this.isPlaying = true;
  }

  onPause() {
    this.isPlaying = false;
    if (this.videoRef?.nativeElement && this.config.saveProgress) {
      this.saveProgress(Math.floor(this.videoRef.nativeElement.currentTime));
    }
  }

  private async setupYouTubePlayer() {
    if (!this.youtubeId) {
      return;
    }
    if (this.youtubeInitInFlight) {
      return;
    }

    // Wait for view to render.
    if (!this.youtubeContainer?.nativeElement) {
      return;
    }

    this.youtubeInitInFlight = true;
    try {
      await this.loadYouTubeIFrameApi();
      // Destroy previous player if any.
      try {
        this.youtubePlayer?.destroy?.();
      } catch {
        // ignore
      }
      this.youtubePlayer = null;

      const container = this.youtubeContainer.nativeElement;
      container.innerHTML = '';

      const win = window as YouTubeWindow;
      const YT = win.YT;
      if (!YT?.Player) {
        return;
      }

      this.youtubePlayer = new YT.Player(container, {
        videoId: this.youtubeId,
        playerVars: {
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
        events: {
          onReady: () => {
            try {
              this.duration = Math.floor(Number(this.youtubePlayer.getDuration?.() || 0));
            } catch {
              this.duration = 0;
            }
            this.playerReady.emit();
          },
          onStateChange: (event: any) => {
            // YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
            const state = event?.data;
            if (state === 1) {
              this.isPlaying = true;
              this.startYouTubePolling();
            } else if (state === 2) {
              this.isPlaying = false;
              this.stopYouTubePolling();
              try {
                const current = Math.floor(Number(this.youtubePlayer.getCurrentTime?.() || 0));
                if (current > 0) {
                  this.saveProgress(current);
                }
              } catch {
                // ignore
              }
            } else if (state === 0) {
              this.isPlaying = false;
              this.stopYouTubePolling();
              try {
                const current = Math.floor(Number(this.youtubePlayer.getCurrentTime?.() || 0));
                if (current > 0) {
                  this.saveProgress(current);
                }
              } catch {
                // ignore
              }
            }
          },
        },
      });
    } finally {
      this.youtubeInitInFlight = false;
    }
  }

  private startYouTubePolling() {
    if (this.youtubePollTimer) {
      return;
    }
    this.youtubePollTimer = setInterval(() => {
      if (!this.youtubePlayer || !this.config.saveProgress) {
        return;
      }
      try {
        const current = Math.floor(Number(this.youtubePlayer.getCurrentTime?.() || 0));
        const duration = Math.floor(Number(this.youtubePlayer.getDuration?.() || 0));
        if (duration > 0) {
          this.duration = duration;
        }
        if (current >= 0) {
          this.progressUpdate.next(current);
        }
      } catch {
        // ignore
      }
    }, 1000);
  }

  private stopYouTubePolling() {
    if (this.youtubePollTimer) {
      clearInterval(this.youtubePollTimer);
      this.youtubePollTimer = undefined;
    }
  }

  private loadYouTubeIFrameApi(): Promise<void> {
    const win = window as YouTubeWindow;
    if (win.YT?.Player) {
      return Promise.resolve();
    }

    if (win.__npYoutubeApiPromise) {
      return win.__npYoutubeApiPromise as Promise<void>;
    }

    win.__npYoutubeApiPromise = new Promise<void>((resolve) => {
      const existing = document.querySelector('script[data-np-youtube-iframe-api="1"]') as HTMLScriptElement | null;
      if (existing) {
        // If script already exists, wait for callback.
        const prev = win.onYouTubeIframeAPIReady;
        win.onYouTubeIframeAPIReady = () => {
          prev?.();
          resolve();
        };
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.defer = true;
      script.dataset['npYoutubeIframeApi'] = '1';
      const prev = win.onYouTubeIframeAPIReady;
      win.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      document.head.appendChild(script);
    });

    return win.__npYoutubeApiPromise as Promise<void>;
  }

  private saveProgress(progress: number) {
    if (!this.movieId || !this.config.saveProgress) return;
    
    if (this.isAuthenticated) {
      // Save to API for authenticated users
      this.watchApi.saveProgress(this.movieId, progress, Math.floor(this.duration)).subscribe({
        error: (err) => console.error('Failed to save progress:', err)
      });
    } else if (this.movie) {
      // Save to localStorage for anonymous users
      const percentage = this.duration > 0 ? (progress / this.duration) * 100 : 0;
      const completed = percentage >= 95;
      this.anonymousWatch.saveProgress(this.movie, percentage, progress, Math.floor(this.duration), completed);
    }
  }

  formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}
