import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MusicApiService } from '../../services/music-api.service';
import { MusicCardComponent } from '../../components/music-card/music-card.component';
import { MusicVideoSummary, MusicGenre, MusicRegion } from '@naijaspride/types';

const GENRES = Object.values(MusicGenre);
const REGIONS = Object.values(MusicRegion);

@Component({
  selector: 'app-music-browse',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, MusicCardComponent],
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      --music-bg: #f6f1eb;
      --music-surface: #ffffff;
      --music-surface-strong: #ece3db;
      --music-text: #1f1715;
      --music-text-muted: #6b594f;
      --music-border: #d8c9bf;
      --music-border-strong: #baa89c;
      --music-contrast: #111111;
      background: var(--music-bg);
      color: var(--music-text);
      font-family: 'Space Grotesk', system-ui, sans-serif;
    }

    :host-context(.dark) {
      --music-bg: #050505;
      --music-surface: #1f1f1f;
      --music-surface-strong: #121212;
      --music-text: #e6e0d4;
      --music-text-muted: #bcae9e;
      --music-border: #2a2a2a;
      --music-border-strong: #3a3a3a;
      --music-contrast: #f5efe5;
    }

    .serif-text { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; }
  `],
  template: `
    <div class="min-h-screen bg-[var(--music-bg)] text-[var(--music-text)] pb-28">
      <!-- Header -->
      <div class="max-w-7xl mx-auto px-4 pt-10 pb-6">
        <h1 class="serif-text text-4xl md:text-5xl mb-6">Browse Music Videos</h1>

        <!-- Search bar -->
        <div class="relative max-w-xl">
          <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="search"
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearch($event)"
            placeholder="Search by title or artist..."
            class="w-full pl-12 pr-4 py-3 rounded-xl bg-[var(--music-surface)] text-[var(--music-text)] placeholder-[var(--music-text-muted)] border border-[var(--music-border)]
                   focus:outline-none focus:border-[#800020] transition-colors"
          >
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap gap-3 mt-4">
          <!-- Genre pills -->
          <div class="flex flex-wrap gap-2">
            <button
              (click)="setGenre(null)"
              class="px-3 py-1.5 rounded-full text-xs font-medium transition-all border"
              [style.backgroundColor]="!selectedGenre() ? '#800020' : 'var(--music-surface)'"
              [style.color]="!selectedGenre() ? '#ffffff' : 'var(--music-text-muted)'"
              [style.borderColor]="!selectedGenre() ? '#800020' : 'var(--music-border)'"
            >All Genres</button>
            @for (genre of genres; track genre) {
              <button
                (click)="setGenre(genre)"
                class="px-3 py-1.5 rounded-full text-xs font-medium transition-all border"
                [style.backgroundColor]="selectedGenre() === genre ? '#800020' : 'var(--music-surface)'"
                [style.color]="selectedGenre() === genre ? '#ffffff' : 'var(--music-text-muted)'"
                [style.borderColor]="selectedGenre() === genre ? '#800020' : 'var(--music-border)'"
              >{{ genre }}</button>
            }
          </div>
        </div>

        <!-- Region tabs -->
        <div class="flex gap-2 mt-3 border-b border-[var(--music-border)] pb-1">
          <button
            (click)="setRegion(null)"
            class="px-4 py-2 text-sm font-medium transition-all border-b-2"
            [class.border-[#800020]]="!selectedRegion()"
            [style.color]="!selectedRegion() ? 'var(--music-text)' : 'var(--music-text-muted)'"
            [class.border-transparent]="selectedRegion()"
          >All Regions</button>
          @for (region of regions; track region) {
            <button
              (click)="setRegion(region)"
              class="px-4 py-2 text-sm font-medium transition-all border-b-2"
              [class.border-[#800020]]="selectedRegion() === region"
              [style.color]="selectedRegion() === region ? 'var(--music-text)' : 'var(--music-text-muted)'"
              [class.border-transparent]="selectedRegion() !== region"
            >{{ region }}</button>
          }
        </div>
      </div>

      <!-- Results -->
      <div class="max-w-7xl mx-auto px-4">
        @if (loading()) {
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            @for (i of [1,2,3,4,5,6,7,8,9,10,11,12]; track i) {
              <div class="aspect-square bg-[var(--music-surface)] animate-pulse rounded-lg"></div>
            }
          </div>
        }

        @if (!loading() && videos().length === 0) {
          <div class="py-24 text-center">
              <svg class="w-16 h-16 text-[var(--music-text-muted)] opacity-60 mx-auto mb-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
              <p class="text-[var(--music-text-muted)] text-lg">No music videos found</p>
              <p class="text-[var(--music-text-muted)] text-sm mt-1">Try a different search or filter</p>
            </div>
          }

          @if (!loading() && videos().length > 0) {
            <div>
              <p class="text-[var(--music-text-muted)] text-sm mb-4">{{ total() }} videos found</p>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                @for (video of videos(); track video.id) {
                  <app-music-card [video]="video" />
                }
              </div>

            <!-- Pagination -->
            @if (totalPages() > 1) {
              <div class="flex justify-center gap-2 mt-10">
                @if (currentPage() > 1) {
                  <button
                    (click)="goToPage(currentPage() - 1)"
                    class="px-4 py-2 rounded-lg bg-[var(--music-surface)] border border-[var(--music-border)] text-[var(--music-text)] hover:border-[#800020] transition-colors"
                  >Previous</button>
                }
                <span class="px-4 py-2 text-[var(--music-text-muted)] text-sm">Page {{ currentPage() }} of {{ totalPages() }}</span>
                @if (currentPage() < totalPages()) {
                  <button
                    (click)="goToPage(currentPage() + 1)"
                    class="px-4 py-2 rounded-lg bg-[var(--music-surface)] border border-[var(--music-border)] text-[var(--music-text)] hover:border-[#800020] transition-colors"
                  >Next</button>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `
})
export class MusicBrowseComponent implements OnInit, OnDestroy {
  private musicApi = inject(MusicApiService);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();
  private search$ = new Subject<string>();

  videos = signal<MusicVideoSummary[]>([]);
  loading = signal(true);
  total = signal(0);
  currentPage = signal(1);
  totalPages = signal(1);
  selectedGenre = signal<string | null>(null);
  selectedRegion = signal<string | null>(null);
  searchQuery = '';

  genres = GENRES;
  regions = REGIONS;

  ngOnInit(): void {
    // Debounced search
    this.search$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.currentPage.set(1);
      this.load();
    });

    // Initial load (check queryparams)
    const params = this.route.snapshot.queryParamMap;
    if (params.get('genre')) this.selectedGenre.set(params.get('genre'));
    if (params.get('region')) this.selectedRegion.set(params.get('region'));
    if (params.get('q')) this.searchQuery = params.get('q') ?? '';
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearch(value: string): void {
    this.search$.next(value);
  }

  setGenre(genre: string | null): void {
    this.selectedGenre.set(genre);
    this.currentPage.set(1);
    this.load();
  }

  setRegion(region: string | null): void {
    this.selectedRegion.set(region);
    this.currentPage.set(1);
    this.load();
  }

  goToPage(page: number): void {
    this.currentPage.set(page);
    this.load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private load(): void {
    this.loading.set(true);
    this.musicApi.search({
      q: this.searchQuery || undefined,
      genre: this.selectedGenre() ?? undefined,
      region: this.selectedRegion() ?? undefined,
      page: this.currentPage(),
      limit: 24,
    }).subscribe({
      next: (res) => {
        this.videos.set(res.videos);
        this.total.set(res.total);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }
}
