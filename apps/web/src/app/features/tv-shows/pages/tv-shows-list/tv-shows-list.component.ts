import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TvShowsQueryService } from '../../services/tv-shows-query.service';
import { TvShowCardComponent } from '../../components/tv-show-card/tv-show-card.component';

@Component({
  selector: 'app-tv-shows-list',
  standalone: true,
  imports: [CommonModule, FormsModule, TvShowCardComponent],
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
      <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">TV Shows</h1>
          <p class="text-sm text-white/60">Trending, popular and top-rated shows, auto-synced from TMDB.</p>
        </div>

        <label class="w-full max-w-sm">
          <span class="mb-1 block text-xs text-white/60">Search</span>
          <input
            type="text"
            class="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[#800020]/40 focus:ring"
            placeholder="Search shows..."
            [ngModel]="q()"
            (ngModelChange)="q.set($event || '')"
          />
        </label>
      </div>

      @if (query.isLoading()) {
        <div class="py-16 text-center text-white/70">Loading TV shows...</div>
      } @else if (query.isError()) {
        <div class="py-16 text-center text-red-300">Failed to load TV shows.</div>
      } @else {
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          @for (show of query.data()?.data || []; track show.id) {
            <app-tv-show-card [show]="show"></app-tv-show-card>
          }
        </div>
      }
    </section>
  `,
})
export class TvShowsListComponent {
  private tvQuery = inject(TvShowsQueryService);
  q = signal('');

  private params = computed(() => ({
    q: this.q().trim() || undefined,
    page: 1,
    limit: 30,
    sortBy: 'trending' as const,
  }));

  query = this.tvQuery.getShowsQuery(this.params);
}
