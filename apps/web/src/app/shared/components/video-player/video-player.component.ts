import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-video-player',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl group">
      
      @if (youtubeId) {
        <iframe 
          [src]="safeYoutubeUrl" 
          class="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen>
        </iframe>
      }

      @if (videoUrl && !youtubeId) {
        <video 
          [src]="videoUrl" 
          class="w-full h-full object-contain"
          controls
          controlsList="nodownload"
        ></video>
      }

      <div class="absolute top-4 right-4 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded opacity-50 hover:opacity-100 transition-opacity pointer-events-none">
        NAIJASPRIDE STREAM
      </div>
    </div>
  `
})
export class VideoPlayerComponent implements OnChanges {
  @Input() youtubeId?: string | null;
  @Input() videoUrl?: string | null;

  private sanitizer = inject(DomSanitizer);
  safeYoutubeUrl?: SafeResourceUrl;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['youtubeId'] && this.youtubeId) {
      // Enable modestbranding to remove some YT logos
      const url = `https://www.youtube.com/embed/${this.youtubeId}?modestbranding=1&rel=0&showinfo=0&color=white`;
      this.safeYoutubeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }
  }
}
