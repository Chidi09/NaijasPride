import { Component, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { HttpClient, HttpParams } from "@angular/common/http";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { PaginatorComponent } from "../../../../shared/components/paginator/paginator.component";
import { forkJoin, of } from "rxjs";
import { catchError, map } from "rxjs/operators";

type LightNovelVolume = {
  id: string;
  title: string;
  slug: string;
  author: string;
  year: number;
  coverUrl: string | null;
  format: string;
  downloadUrl: string | null;
  fileSize: number | null;
  viewCount: number;
  publisher: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  volumeNumber: number | null;
};

type LightNovelSeries = {
  seriesKey: string;
  seriesTitle: string;
  totalVolumes: number;
  latestYear: number;
  coverUrl: string | null;
  volumes: LightNovelVolume[];
};

type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

type BookProgressResponse = {
  status: string;
  data?: {
    page?: number;
  } | null;
};

@Component({
  selector: "app-light-novels-library",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    PaginatorComponent,
  ],
  styles: [
    `
      .ln-card-overlay {
        opacity: 0;
        transition: opacity 0.25s ease;
      }
      .ln-card:hover .ln-card-overlay {
        opacity: 1;
      }
      .ln-card:hover .ln-cover-img {
        transform: scale(1.06);
      }
      .ln-cover-img {
        transition: transform 0.35s ease;
      }
      .ln-glow:hover {
        box-shadow:
          0 0 0 1.5px rgba(128, 0, 32, 0.6),
          0 8px 32px rgba(128, 0, 32, 0.18);
      }
    `,
  ],
  template: `
    <div class="min-h-screen bg-[#0a0a0a] books-theme">
      <!-- ── Hero ──────────────────────────────────────────────── -->
      <div
        class="relative overflow-hidden bg-[#0d0d0d] border-b border-white/[0.06]"
      >
        <div
          class="absolute inset-0 pointer-events-none"
          style="background:radial-gradient(ellipse 80% 60% at 10% 0%,rgba(128,0,32,0.13) 0%,transparent 65%)"
        ></div>
        <div
          class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-12 pb-10"
        >
          <!-- breadcrumb nav -->
          <div class="flex flex-wrap gap-2 mb-6">
            <a
              routerLink="/books"
              class="px-3 py-1 rounded-full bg-white/[0.07] text-gray-400 text-xs font-medium hover:bg-white/10 hover:text-white transition"
              >Hub</a
            >
            <a
              routerLink="/books/all"
              class="px-3 py-1 rounded-full bg-white/[0.07] text-gray-400 text-xs font-medium hover:bg-white/10 hover:text-white transition"
              >Books</a
            >
            <a
              routerLink="/books/comics"
              class="px-3 py-1 rounded-full bg-white/[0.07] text-gray-400 text-xs font-medium hover:bg-white/10 hover:text-white transition"
              >Comics</a
            >
            <a
              routerLink="/books/manga"
              class="px-3 py-1 rounded-full bg-white/[0.07] text-gray-400 text-xs font-medium hover:bg-white/10 hover:text-white transition"
              >Manga</a
            >
          </div>

          <p
            class="text-[11px] uppercase tracking-[0.28em] text-[#800020] font-semibold mb-2"
          >
            Library
          </p>
          <h1
            class="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-2"
          >
            Light Novels
          </h1>
          <p class="text-gray-500 text-sm max-w-md mb-7">
            Read by series, continue between volumes, no interruptions.
          </p>

          <!-- Search -->
          <div class="flex gap-2 max-w-lg">
            <div class="relative flex-1">
              <svg
                class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                />
              </svg>
              <input
                [(ngModel)]="searchQuery"
                (keyup.enter)="applySearch()"
                type="text"
                placeholder="Search series or title…"
                class="w-full h-11 rounded-xl bg-white/[0.07] border border-white/10 text-white text-sm pl-10 pr-4 placeholder:text-gray-600 focus:outline-none focus:border-[#800020] focus:bg-white/[0.09] transition"
              />
            </div>
            <button
              (click)="applySearch()"
              class="h-11 px-5 rounded-xl bg-[#800020] text-white text-sm font-semibold hover:bg-[#a0002a] active:bg-[#600018] transition shrink-0"
            >
              Search
            </button>
            @if (searchQuery.trim() || appliedQuery) {
              <button
                (click)="clearSearch()"
                class="h-11 px-4 rounded-xl border border-white/10 text-gray-400 text-sm hover:border-white/25 hover:text-white transition shrink-0"
              >
                Clear
              </button>
            }
          </div>
        </div>
      </div>

      <!-- ── Content ─────────────────────────────────────────── -->
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 sm:py-10">
        @if (appliedQuery) {
          <p class="text-gray-500 text-sm mb-6">
            Results for "<span class="text-white font-medium">{{
              appliedQuery
            }}</span
            >"
            <span class="text-gray-600">
              · {{ meta()?.total ?? series().length }} series</span
            >
          </p>
        }

        <!-- Loading skeletons -->
        @if (isLoading()) {
          <div
            class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5"
          >
            @for (i of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; track i) {
              <div class="animate-pulse">
                <div class="aspect-[2/3] rounded-xl bg-white/[0.06]"></div>
                <div class="mt-2.5 h-3 rounded-md bg-white/[0.06] w-4/5"></div>
                <div
                  class="mt-1.5 h-2.5 rounded-md bg-white/[0.04] w-1/2"
                ></div>
              </div>
            }
          </div>
        }

        <!-- Empty state -->
        @if (!isLoading() && series().length === 0) {
          <div class="py-28 text-center">
            <div
              class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/[0.05] mb-5"
            >
              <span
                class="material-symbols-outlined text-3xl"
                aria-hidden="true"
                >menu_book</span
              >
            </div>
            <p class="text-lg font-semibold text-white mb-1">No series found</p>
            <p class="text-gray-500 text-sm">
              Try a different search term or check back later.
            </p>
          </div>
        }

        <!-- Grid -->
        @if (!isLoading() && series().length > 0) {
          <div
            class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5"
          >
            @for (item of series(); track item.seriesKey) {
              <div class="flex flex-col">
                <!-- Poster card -->
                <div
                  class="ln-card ln-glow relative aspect-[2/3] rounded-xl overflow-hidden bg-[#181818] cursor-pointer"
                  (click)="toggleExpand(item.seriesKey)"
                >
                  @if (item.coverUrl) {
                    <img
                      [src]="item.coverUrl"
                      [alt]="item.seriesTitle"
                      class="ln-cover-img absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                    />
                  } @else {
                    <div
                      class="absolute inset-0 flex items-center justify-center select-none"
                    >
                      <span
                        class="material-symbols-outlined text-5xl"
                        aria-hidden="true"
                        >auto_stories</span
                      >
                    </div>
                  }

                  <!-- Permanent bottom fade -->
                  <div
                    class="absolute inset-x-0 bottom-0 h-2/5 pointer-events-none"
                    style="background:linear-gradient(to top,rgba(0,0,0,0.72) 0%,transparent 100%)"
                  ></div>

                  <!-- Hover overlay -->
                  <div
                    class="ln-card-overlay absolute inset-0 bg-black/50 flex flex-col justify-end p-3 gap-2"
                  >
                    <a
                      [routerLink]="[
                        '/books/novel',
                        item.volumes[0]?.slug,
                        'read',
                      ]"
                      class="block text-center py-1.5 rounded-lg bg-[#800020] text-white text-xs font-bold hover:bg-[#a0002a] transition"
                      (click)="$event.stopPropagation()"
                      >▶ Read</a
                    >
                    <button
                      type="button"
                      class="text-center py-1.5 rounded-lg bg-white/15 text-white text-xs font-semibold hover:bg-white/25 transition"
                      (click)="
                        $event.stopPropagation(); toggleExpand(item.seriesKey)
                      "
                    >
                      {{
                        isExpanded(item.seriesKey)
                          ? "Hide volumes"
                          : "All volumes"
                      }}
                    </button>
                  </div>

                  <!-- Volume badge -->
                  <div
                    class="absolute top-2 right-2 rounded-md bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-bold text-white/75 tabular-nums"
                  >
                    {{ item.totalVolumes }}v
                  </div>

                  <!-- Progress bar -->
                  @if (getSeriesProgress(item.volumes); as pct) {
                    <div
                      class="absolute inset-x-0 bottom-0 h-[3px] bg-black/40"
                    >
                      <div
                        class="h-full bg-[#800020]"
                        [style.width.%]="pct"
                      ></div>
                    </div>
                  }
                </div>

                <!-- Title row -->
                <div class="mt-2 px-0.5">
                  <h3
                    class="text-[13px] font-semibold text-white leading-snug line-clamp-2"
                  >
                    {{ item.seriesTitle }}
                  </h3>
                  <p class="mt-0.5 text-[11px] text-gray-600">
                    {{
                      seriesAuthor(item) !== "Author unavailable"
                        ? seriesAuthor(item)
                        : ""
                    }}
                    @if (seriesAuthor(item) !== "Author unavailable") {
                      ·
                    }
                    {{ item.totalVolumes }} vol{{
                      item.totalVolumes === 1 ? "" : "s"
                    }}
                    · {{ item.latestYear }}
                    @if (seriesViews(item) > 0) {
                      · {{ formatCompactNumber(seriesViews(item)) }} views
                    }
                  </p>
                </div>

                <!-- Expanded volume list -->
                @if (isExpanded(item.seriesKey)) {
                  <div
                    class="mt-2 rounded-xl bg-[#141414] border border-white/[0.07] overflow-hidden"
                  >
                    @for (volume of visibleVolumes(item); track volume.id) {
                      <div
                        class="relative border-b border-white/[0.05] last:border-0"
                      >
                        <div class="flex items-center gap-2 px-3 py-2.5">
                          <a
                            [routerLink]="['/books/novel', volume.slug]"
                            class="flex-1 min-w-0"
                            (click)="$event.stopPropagation()"
                          >
                            <span
                              class="block truncate text-[12px] text-gray-300 leading-tight"
                            >
                              @if (volume.volumeNumber !== null) {
                                <span class="text-[#c0304a] font-bold"
                                  >Vol {{ volume.volumeNumber }}</span
                                >
                                <span class="text-gray-600"> · </span>
                              }
                              {{ volume.title }}
                            </span>
                            <span class="text-[10px] text-gray-600">{{
                              volume.year
                            }}</span>
                          </a>
                          <a
                            [routerLink]="['/books/novel', volume.slug, 'read']"
                            class="shrink-0 px-2.5 py-1 rounded-lg bg-[#800020] text-[11px] font-bold text-white hover:bg-[#a0002a] transition"
                            (click)="$event.stopPropagation()"
                            >Read</a
                          >
                        </div>
                        @if (getBookProgress(volume.slug); as pct) {
                          <div
                            class="absolute inset-x-0 bottom-0 h-[2px] bg-black/30"
                          >
                            <div
                              class="h-full bg-[#800020]"
                              [style.width.%]="pct"
                            ></div>
                          </div>
                        }
                      </div>
                    }

                    @if (item.volumes.length > 3) {
                      <button
                        type="button"
                        class="w-full py-2.5 text-xs text-[#800020] hover:text-[#c03050] transition font-semibold"
                        (click)="toggleExpand(item.seriesKey)"
                      >
                        {{
                          isExpanded(item.seriesKey)
                            ? "↑ Show less"
                            : "↓ Show all " + item.volumes.length + " volumes"
                        }}
                      </button>
                    }
                  </div>
                }
              </div>
            }
          </div>

          @if (meta()) {
            <div class="mt-12 pb-4">
              <app-paginator
                [currentPage]="meta()!.page"
                [totalPages]="meta()!.totalPages"
                (pageChange)="onPageChange($event)"
              />
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class LightNovelsLibraryComponent {
  private http = inject(HttpClient);

  series = signal<LightNovelSeries[]>([]);
  meta = signal<PaginationMeta | null>(null);
  isLoading = signal(true);
  bookProgressBySlug = signal<Record<string, number>>({});
  expandedSeries = signal<Set<string>>(new Set());

  page = signal(1);
  searchQuery = "";
  appliedQuery = "";

  constructor() {
    this.loadSeries();
  }

  applySearch() {
    this.appliedQuery = this.searchQuery.trim();
    this.page.set(1);
    this.loadSeries();
  }

  clearSearch() {
    this.searchQuery = "";
    this.appliedQuery = "";
    this.page.set(1);
    this.loadSeries();
  }

  onPageChange(nextPage: number) {
    this.page.set(nextPage);
    this.loadSeries();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  private loadSeries() {
    this.isLoading.set(true);

    let params = new HttpParams()
      .set("page", String(this.page()))
      .set("limit", "10");

    if (this.appliedQuery) {
      params = params.set("q", this.appliedQuery);
    }

    this.http
      .get<{
        status: string;
        data: LightNovelSeries[];
        meta: PaginationMeta;
      }>("/api/v1/books/light-novels", { params })
      .subscribe({
        next: (response) => {
          this.series.set(response.data || []);
          const slugs = (response.data || []).flatMap((entry) =>
            entry.volumes.map((volume) => volume.slug),
          );
          this.loadBookProgress(slugs);
          this.meta.set(response.meta || null);
          this.isLoading.set(false);
        },
        error: (error) => {
          this.series.set([]);
          this.bookProgressBySlug.set({});
          this.meta.set(null);
          this.isLoading.set(false);
        },
      });
  }

  toggleExpand(seriesKey: string) {
    const current = new Set(this.expandedSeries());
    if (current.has(seriesKey)) {
      current.delete(seriesKey);
    } else {
      current.add(seriesKey);
    }
    this.expandedSeries.set(current);
  }

  private firstVolume(series: LightNovelSeries): LightNovelVolume | undefined {
    if (!series.volumes?.length) return undefined;
    return [...series.volumes].sort((a, b) => {
      const av = a.volumeNumber ?? Number.MAX_SAFE_INTEGER;
      const bv = b.volumeNumber ?? Number.MAX_SAFE_INTEGER;
      if (av !== bv) return av - bv;
      return a.title.localeCompare(b.title);
    })[0];
  }

  seriesAuthor(series: LightNovelSeries): string {
    const author = this.firstVolume(series)?.author?.trim();
    if (
      !author ||
      author.toLowerCase() === "unknown" ||
      author.toLowerCase() === "unknown author"
    ) {
      return "Author unavailable";
    }
    return author;
  }

  seriesViews(series: LightNovelSeries): number {
    return series.volumes.reduce(
      (sum, volume) => sum + (volume.viewCount || 0),
      0,
    );
  }

  formatCompactNumber(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return String(value);
  }

  seriesBlurb(series: LightNovelSeries): string {
    const raw = this.firstVolume(series)?.description?.trim() || "";
    if (!raw) return "";
    const cleaned = raw
      .replace(/(?:^|\n)\s*series\s*:[^\n]*/gi, "")
      .replace(/(?:^|\n)\s*volume\s*:[^\n]*/gi, "")
      .replace(/(?:^|\n)\s*source file\s*:[^\n]*/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned;
  }

  isExpanded(seriesKey: string): boolean {
    return this.expandedSeries().has(seriesKey);
  }

  visibleVolumes(item: LightNovelSeries): LightNovelVolume[] {
    if (this.isExpanded(item.seriesKey) || item.volumes.length <= 3) {
      return item.volumes;
    }
    return item.volumes.slice(0, 3);
  }

  getBookProgress(slug?: string): number | null {
    if (!slug) return null;
    const value = this.bookProgressBySlug()[slug];
    if (typeof value !== "number" || Number.isNaN(value) || value <= 0)
      return null;
    return Math.max(0, Math.min(100, value));
  }

  getSeriesProgress(volumes: LightNovelVolume[]): number | null {
    let max = 0;
    for (const volume of volumes) {
      const progress = this.getBookProgress(volume.slug) ?? 0;
      if (progress > max) {
        max = progress;
      }
    }
    return max > 0 ? max : null;
  }

  private loadBookProgress(slugs: string[]) {
    const uniqueSlugs = Array.from(new Set(slugs.filter(Boolean))).slice(0, 80);
    if (uniqueSlugs.length === 0) {
      this.bookProgressBySlug.set({});
      return;
    }

    const requests = uniqueSlugs.map((slug) =>
      this.http
        .get<BookProgressResponse>(
          `/api/v1/books/progress/${encodeURIComponent(slug)}`,
        )
        .pipe(
          map((response) => {
            const page = response?.data?.page ?? 0;
            return { slug, percentage: Math.max(0, Math.min(100, page)) };
          }),
          catchError(() => of({ slug, percentage: 0 })),
        ),
    );

    forkJoin(requests).subscribe((entries) => {
      const next: Record<string, number> = {};
      for (const entry of entries) {
        if (entry.percentage > 0) {
          next[entry.slug] = entry.percentage;
        }
      }
      this.bookProgressBySlug.set(next);
    });
  }
}
