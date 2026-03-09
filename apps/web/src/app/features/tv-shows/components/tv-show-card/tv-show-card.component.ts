import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TvShowSummary } from '@naijaspride/types';

@Component({
  selector: 'app-tv-show-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <a
      class="group block overflow-hidden rounded-xl border border-white/10 bg-black/30 transition hover:border-white/30"
      [routerLink]="['/tv-shows', show.slug]"
    >
      <div class="aspect-[2/3] overflow-hidden bg-zinc-900">
        <img
          class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          [src]="show.posterUrl || show.thumbnailUrl || '/assets/images/poster-placeholder.svg'"
          [alt]="show.title"
          loading="lazy"
        />
      </div>
      <div class="p-3">
        <h3 class="line-clamp-2 text-sm font-semibold text-white">{{ show.title }}</h3>
        <p class="mt-1 text-xs text-white/60">{{ show.year }} • {{ show.seasonCount }} seasons • {{ show.episodeCount }} episodes</p>
      </div>
    </a>
  `,
})
export class TvShowCardComponent {
  @Input({ required: true }) show!: TvShowSummary;
}
