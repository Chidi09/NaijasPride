import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild, ElementRef, inject, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { WatchApiService } from '../../../features/watch/services/watch-api.service';
import { BrandLogoComponent } from '../brand-logo/brand-logo.component';

interface VideoPlayerConfig {
  movieId?: string;
  showSkipButtons?: boolean;
  autoResume?: boolean;
  saveProgress?: boolean;
}

@Component({
  selector: 'app-video-player',
  standalone: true,
  imports: [CommonModule, BrandLogoComponent],
  template: `
    <div class="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl group">
      
      @if (youtubeId) {
        <iframe 
          [src]="safeYoutubeUrl" 
          title="NaijasPride video stream"
          class="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen>
        </iframe>
      }

      @if (videoUrl && !youtubeId) {
        <div class="relative w-full h-full">
          <video 
            #videoPlayer
            [src]="videoUrl" 
            class="w-full h-full object-contain"
            controls
            controlsList="nodownload"
            aria-label="Video player"
            (timeupdate)="onTimeUpdate()"
            (loadedmetadata)="onMetadataLoaded()"
            (play)="onPlay()"
            (pause)="onPause()">
            
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
                
                <div class="absolute bottom-12 right-0 bg-black/90 p-2 rounded hidden group-hover/cc:block min-w-[180px]">
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

          <!-- Resume Dialog -->
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
        </div>
      }

      <!-- Brand Watermark -->
      <div class="absolute top-4 right-4 bg-black/45 text-white text-[10px] font-bold px-2 py-1 rounded-md opacity-60 hover:opacity-100 transition-opacity pointer-events-none flex items-center gap-1.5 backdrop-blur-sm border border-white/10">
        <app-brand-logo variant="mark" alt="NaijasPride" className="h-4 w-4 object-contain" />
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
export class VideoPlayerComponent implements OnInit, OnChanges, OnDestroy {
  @Input() youtubeId?: string | null;
  @Input() videoUrl?: string | null;
  @Input() movieId?: string;
  @Input() config: VideoPlayerConfig = {
    showSkipButtons: true,
    autoResume: true,
    saveProgress: true
  };
  @Output() playerReady = new EventEmitter<void>();

  @ViewChild('videoPlayer') videoRef!: ElementRef<HTMLVideoElement>;

  private sanitizer = inject(DomSanitizer);
  private watchApi = inject(WatchApiService);
  private destroy$ = new Subject<void>();
  private progressUpdate = new Subject<number>();
  
  safeYoutubeUrl?: SafeResourceUrl;
  showControls = true;
  showResumeDialog = false;
  savedProgress = 0;
  duration = 0;
  isPlaying = false;
  
  // Subtitle state
  subtitleTrackUrl: string | null = null;
  showSubtitles = true;

  ngOnInit() {
    this.progressUpdate.pipe(
      debounceTime(5000),
      takeUntil(this.destroy$)
    ).subscribe(progress => {
      this.saveProgress(progress);
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['youtubeId'] && this.youtubeId) {
      const url = `https://www.youtube.com/embed/${this.youtubeId}?modestbranding=1&rel=0&showinfo=0&color=white`;
      this.safeYoutubeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }

    if (changes['movieId'] && this.movieId && this.config.autoResume) {
      this.loadSavedProgress();
    }
  }

  ngOnDestroy() {
    if (this.videoRef?.nativeElement && this.config.saveProgress && this.movieId) {
      const currentTime = this.videoRef.nativeElement.currentTime;
      if (currentTime > 0) {
        this.saveProgress(Math.floor(currentTime));
      }
    }
    this.destroy$.next();
    this.destroy$.complete();
    
    // Clean up subtitle object URL
    if (this.subtitleTrackUrl) {
      URL.revokeObjectURL(this.subtitleTrackUrl);
    }
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
    
    this.watchApi.getProgress(this.movieId).pipe(
      takeUntil(this.destroy$)
    ).subscribe(response => {
      if (response.data && response.data.progress > 30) {
        this.savedProgress = response.data.progress;
        this.showResumeDialog = true;
      }
    });
  }

  resumeFromSaved() {
    if (this.videoRef?.nativeElement) {
      this.videoRef.nativeElement.currentTime = this.savedProgress;
      this.videoRef.nativeElement.play();
    }
    this.showResumeDialog = false;
    this.playerReady.emit();
  }

  startFromBeginning() {
    this.showResumeDialog = false;
    if (this.videoRef?.nativeElement) {
      this.videoRef.nativeElement.currentTime = 0;
      this.videoRef.nativeElement.play();
    }
    this.playerReady.emit();
  }

  skip(seconds: number) {
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

  private saveProgress(progress: number) {
    if (!this.movieId || !this.config.saveProgress) return;
    
    this.watchApi.saveProgress(this.movieId, progress, Math.floor(this.duration)).subscribe({
      error: (err) => console.error('Failed to save progress:', err)
    });
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
