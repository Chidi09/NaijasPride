import { Component, inject, signal, computed, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { WrappedService, WrappedData, CardUrls } from '../../services/wrapped.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-wrapped-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-[#0a0a0a] text-[#f9f9f2]">
      
      <!-- Header -->
      <header class="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-[#0a0a0a] to-transparent px-6 py-4">
        <div class="max-w-md mx-auto flex items-center justify-between">
          <button 
            (click)="goBack()" 
            class="flex items-center gap-2 text-sm font-medium text-[#a88a78] hover:text-[#d6b87a] transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
            </svg>
            Back
          </button>
          
          <div class="flex items-center gap-3">
            <span class="font-['Cinzel'] text-lg font-bold text-[#d6b87a]">{{ periodLabel() }}</span>
            
            @if (!isPublic()) {
              <button 
                (click)="shareWrapped()"
                class="p-2 rounded-full bg-[#d6b87a]/10 hover:bg-[#d6b87a]/20 text-[#d6b87a] transition-colors"
                title="Share"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path>
                </svg>
              </button>
            }
          </div>
        </div>
      </header>

      <!-- Loading State -->
      @if (loading()) {
        <div class="min-h-screen flex items-center justify-center">
          <div class="text-center space-y-4">
            <div class="w-16 h-16 border-4 border-[#d6b87a]/20 border-t-[#d6b87a] rounded-full animate-spin mx-auto"></div>
            <p class="text-[#a88a78] font-medium">Loading your Wrapped...</p>
          </div>
        </div>
      }

      <!-- Error State -->
      @if (error()) {
        <div class="min-h-screen flex items-center justify-center px-6">
          <div class="text-center max-w-sm space-y-6">
            <div><span class="material-symbols-outlined text-6xl" aria-hidden="true">inbox</span></div>
            <h1 class="font-['Cinzel'] text-2xl font-bold">Wrapped Not Ready</h1>
            <p class="text-[#a88a78]">{{ error() }}</p>
            
            @if (!isPublic()) {
              <button 
                (click)="generateNow()"
                class="px-6 py-3 bg-[#800020] hover:bg-[#660019] text-white rounded-full font-medium transition-colors"
              >
                Generate Now
              </button>
            }
          </div>
        </div>
      }

      <!-- Carousel -->
      @if (wrappedData() && !loading() && !error()) {
        <div class="min-h-screen flex items-center justify-center py-20">
          
          <!-- Card Counter -->
          <div class="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-[#120a0d]/90 backdrop-blur-sm rounded-full px-6 py-3 border border-[#5f1327]">
            <p class="text-sm text-[#a88a78]">
              <span class="text-[#d6b87a] font-bold">{{ currentCardIndex() + 1 }}</span> 
              / 
              {{ cards().length }}
            </p>
          </div>

          <!-- Carousel Container -->
          <div 
            #carousel
            class="w-full max-w-md mx-auto overflow-x-auto snap-x snap-mandatory scrollbar-hide"
            style="scroll-behavior: smooth; -webkit-overflow-scrolling: touch;"
            (scroll)="onScroll($event)"
          >
            <div class="flex gap-4 px-6">
              @for (card of cards(); track card.type) {
                <div 
                  class="snap-center shrink-0 w-[calc(100vw-3rem)] max-w-[360px] aspect-[9/16] rounded-2xl overflow-hidden shadow-2xl"
                  [class.ring-2]="currentCardIndex() === $index"
                  [class.ring-[#d6b87a]]="currentCardIndex() === $index"
                >
                  <img 
                    [src]="card.url" 
                    [alt]="card.label"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              }
            </div>
          </div>

          <!-- Swipe Hint -->
          @if (showSwipeHint()) {
            <div class="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 animate-bounce">
              <p class="text-sm text-[#a88a78] bg-[#120a0d]/80 px-4 py-2 rounded-full">
                <span class="material-symbols-outlined align-middle mr-1" aria-hidden="true">swipe_up</span>Swipe to explore
              </p>
            </div>
          }

        </div>
      }

      <!-- Share Modal -->
      @if (showShareModal()) {
        <div 
          class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          (click)="showShareModal.set(false)"
        >
          <div 
            class="bg-[#120a0d] border border-[#5f1327] rounded-2xl p-6 max-w-sm w-full space-y-6"
            (click)="$event.stopPropagation()"
          >
            <h2 class="font-['Cinzel'] text-xl font-bold text-center">Share Your Wrapped</h2>
            
            <div class="space-y-3">
              <button 
                (click)="downloadCurrentCard()"
                class="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[#d6b87a]/10 hover:bg-[#d6b87a]/20 border border-[#d6b87a]/30 rounded-xl transition-colors"
              >
                <svg class="w-5 h-5 text-[#d6b87a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                </svg>
                <span>Download Card</span>
              </button>
              
              <button 
                (click)="nativeShare()"
                class="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[#800020] hover:bg-[#660019] rounded-xl transition-colors"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path>
                </svg>
                <span>Share</span>
              </button>
            </div>
            
            <button 
              (click)="showShareModal.set(false)"
              class="w-full py-3 text-[#a88a78] hover:text-[#f9f9f2] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    .scrollbar-hide::-webkit-scrollbar {
      display: none;
    }
    .scrollbar-hide {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
  `]
})
export class WrappedDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private wrappedService = inject(WrappedService);
  private toast = inject(ToastService);

  @ViewChild('carousel') carousel!: ElementRef<HTMLDivElement>;

  // State signals
  loading = signal(true);
  error = signal<string | null>(null);
  wrappedData = signal<WrappedData | null>(null);
  currentCardIndex = signal(0);
  showShareModal = signal(false);
  showSwipeHint = signal(true);
  isPublic = signal(false);

  // Computed values
  period = computed(() => this.route.snapshot.params['period']);
  periodLabel = computed(() => {
    const p = this.period();
    if (p.endsWith('-annual')) {
      return p.replace('-annual', '');
    }
    const [year, month] = p.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleString('en-NG', { month: 'short', year: 'numeric' });
  });

  cards = computed(() => {
    const data = this.wrappedData()?.cardUrls;
    if (!data) return [];
    
    const cardList: { type: string; url: string; label: string }[] = [];
    if (data.hero) cardList.push({ type: 'hero', url: data.hero, label: 'Overview' });
    if (data.topMovie) cardList.push({ type: 'topMovie', url: data.topMovie, label: 'Top Movie' });
    if (data.topMusic) cardList.push({ type: 'topMusic', url: data.topMusic, label: 'Top Music' });
    if (data.topBook) cardList.push({ type: 'topBook', url: data.topBook, label: 'Top Book' });
    if (data.genres) cardList.push({ type: 'genres', url: data.genres, label: 'Genres' });
    if (data.summary) cardList.push({ type: 'summary', url: data.summary, label: 'Summary' });
    
    return cardList;
  });

  ngOnInit(): void {
    this.loadWrapped();
    
    // Hide swipe hint after 4 seconds
    setTimeout(() => this.showSwipeHint.set(false), 4000);
  }

  private loadWrapped(): void {
    const period = this.period();
    const publicUserId = this.route.snapshot.queryParams['userId'];
    
    this.isPublic.set(!!publicUserId);
    this.loading.set(true);
    this.error.set(null);

    const request$ = publicUserId
      ? this.wrappedService.getPublicWrapped(publicUserId, period)
      : this.wrappedService.getMyWrapped(period);

    request$.subscribe({
      next: (data) => {
        this.loading.set(false);
        if (data) {
          this.wrappedData.set(data);
        } else {
          this.error.set(publicUserId 
            ? 'This wrapped is no longer available.' 
            : `Your ${this.periodLabel()} Wrapped isn't ready yet. Check back on the 1st!`
          );
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Failed to load wrapped. Please try again.');
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/profile']);
  }

  onScroll(event: Event): void {
    const container = event.target as HTMLDivElement;
    const scrollLeft = container.scrollLeft;
    const cardWidth = container.clientWidth - 48; // Accounting for padding
    const index = Math.round(scrollLeft / (cardWidth + 16)); // +16 for gap
    this.currentCardIndex.set(Math.max(0, Math.min(index, this.cards().length - 1)));
  }

  shareWrapped(): void {
    this.showShareModal.set(true);
  }

  async downloadCurrentCard(): Promise<void> {
    const card = this.cards()[this.currentCardIndex()];
    if (!card) return;

    try {
      const response = await fetch(card.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `naijaspride-wrapped-${this.period()}-${card.type}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      this.showShareModal.set(false);
      this.toast.success('Card downloaded!');
    } catch {
      this.toast.error('Failed to download. Try again.');
    }
  }

  async nativeShare(): Promise<void> {
    const card = this.cards()[this.currentCardIndex()];
    if (!card) return;

    const shareData = {
      title: `My ${this.periodLabel()} NaijasPride Wrapped`,
      text: 'Check out my entertainment stats on NaijasPride!',
      url: `${window.location.origin}/wrapped/${this.period()}`,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        this.toast.success('Link copied to clipboard!');
      }
      this.showShareModal.set(false);
    } catch {
      // User cancelled share
    }
  }

  generateNow(): void {
    this.loading.set(true);
    this.wrappedService.regenerateWrapped(this.period()).subscribe({
      next: (data) => {
        this.loading.set(false);
        if (data) {
          this.wrappedData.set(data);
          this.error.set(null);
          this.toast.success('Your Wrapped has been generated!');
        } else {
          this.error.set('Not enough activity to generate a Wrapped yet. Watch some movies!');
        }
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set('Failed to generate. Please try again later.');
        console.error('Generate failed:', err);
      }
    });
  }
}
