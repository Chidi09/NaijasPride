import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import Hls from "hls.js";
import { timeout } from "rxjs";
import {
  AnimeApiService,
  AnilistMedia,
} from "../../services/anime-api.service";
import { PwaService } from "../../../../core/services/pwa.service";
import { SymbolIconComponent } from "../../../../shared/components/symbol-icon/symbol-icon.component";
import { TvFocusGroupDirective } from "../../../../shared/directives/tv-focus-group.directive";
import { StarIconComponent } from "../../../../shared/components/icons/star-icon.component";

@Component({
  selector: "app-anime-watch",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    SymbolIconComponent,
    TvFocusGroupDirective,
    StarIconComponent,
  ],
  template: `
    @if (useCinemaShell()) {
      <section
        appTvFocusGroup
        [tvAutoFocus]="true"
        class="min-h-screen bg-[#090609] px-6 py-6 text-[#f6efe8] md:px-10 xl:px-14"
      >
        <header
          class="mb-6 flex items-center justify-between gap-4 rounded-[2rem] border border-white/10 bg-white/[0.04] px-5 py-4 backdrop-blur-xl"
        >
          <a
            [routerLink]="['/anime', animeId()]"
            class="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-white/[0.08] hover:text-white"
          >
            <app-symbol-icon name="arrow_back" [size]="22"></app-symbol-icon>
            Back to Anime
          </a>
          <div class="min-w-0 text-right">
            <p class="text-[11px] uppercase tracking-[0.22em] text-[#d0a97a]">
              Anime Watch
            </p>
            <h1 class="truncate text-2xl font-black text-white">
              {{ title() }}
            </h1>
          </div>
        </header>

        @if (loading()) {
          <div class="py-12 text-center text-white/60">Loading stream...</div>
        } @else if (error()) {
          <div class="py-12 text-center text-red-300">{{ error() }}</div>
        } @else {
          <div class="grid gap-6 xl:grid-cols-[1.2fr,0.8fr] xl:items-start">
            <div class="space-y-4">
              <section
                class="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/30"
              >
                <div
                  class="absolute inset-0 bg-cover bg-center opacity-30"
                  [style.background-image]="'url(' + heroImage() + ')'"
                ></div>
                <div
                  class="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/10"
                ></div>
                <div class="relative z-10 p-6 md:p-8">
                  <div
                    class="mb-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/55"
                  >
                    <span
                      class="rounded-full border border-[#d0a97a]/35 bg-[#d0a97a]/10 px-3 py-1 text-[#ecd8b7]"
                      >Episode {{ episodeNumber() }}</span
                    >
                    <span>{{ scoreText() }}</span>
                    <span>{{ genreText() }}</span>
                  </div>
                  <h2
                    class="max-w-3xl text-3xl font-black text-white md:text-5xl"
                  >
                    {{ title() }}
                  </h2>
                  <p class="mt-3 max-w-2xl text-sm leading-7 text-white/65">
                    {{ synopsisText() }}
                  </p>
                </div>
              </section>

              <section
                class="rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 md:p-5"
              >
                <div class="mb-3 flex flex-wrap items-center gap-2">
                  @for (source of sourceButtons(); track source.url) {
                    <button
                      type="button"
                      class="rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]"
                      [class]="
                        activeSourceUrl() === source.url
                          ? 'bg-[#800020] text-white'
                          : 'bg-white/10 text-white/70 hover:bg-white/20'
                      "
                      (click)="selectSource(source.url, source.index)"
                    >
                      {{ source.label }}
                    </button>
                  }

                  @if (selectedSource()?.url) {
                    <a
                      [href]="
                        selectedSource()?.originalUrl || selectedSource()?.url
                      "
                      target="_blank"
                      rel="noopener noreferrer"
                      class="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                    >
                      Open Source
                    </a>
                  }
                </div>

                @if (playbackNotice()) {
                  <div
                    class="mb-3 rounded-xl border border-yellow-500/30 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-100"
                  >
                    {{ playbackNotice() }}
                  </div>
                }

                <div
                  class="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black"
                >
                  @if (selectedSourceIsEmbed()) {
                    <iframe
                      class="aspect-video w-full bg-black"
                      [src]="selectedEmbedUrl()"
                      allow="autoplay; fullscreen; picture-in-picture"
                      allowfullscreen
                    ></iframe>
                  } @else {
                    <video
                      #videoEl
                      controls
                      playsinline
                      class="aspect-video w-full bg-black"
                    ></video>
                  }
                </div>
              </section>
            </div>

            <aside class="space-y-4">
              <div
                class="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6"
              >
                <p
                  class="text-[11px] uppercase tracking-[0.22em] text-[#d0a97a]"
                >
                  Series Information
                </p>
                <div class="mt-4 space-y-3 text-sm">
                  <div
                    class="flex items-center justify-between border-b border-white/10 pb-2"
                  >
                    <span class="text-white/55">Aired</span
                    ><span class="text-white">{{ airedText() }}</span>
                  </div>
                  <div
                    class="flex items-center justify-between border-b border-white/10 pb-2"
                  >
                    <span class="text-white/55">Status</span
                    ><span class="text-white">{{ statusText() }}</span>
                  </div>
                  <div
                    class="flex items-center justify-between border-b border-white/10 pb-2"
                  >
                    <span class="text-white/55">Episodes</span
                    ><span class="text-white">{{ totalEpisodesText() }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-white/55">Rating</span
                    ><span class="text-white">{{ scoreText() }}</span>
                  </div>
                </div>
              </div>

              <div
                class="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6"
              >
                <div class="mb-4 flex items-center justify-between">
                  <h3 class="text-lg font-bold text-white">Episodes</h3>
                  <span
                    class="text-xs uppercase tracking-[0.18em] text-white/45"
                    >{{ episodes().length }} total</span
                  >
                </div>
                @if (episodeRanges().length > 0) {
                  <div class="mb-3 flex flex-wrap gap-1.5">
                    @for (range of episodeRanges(); track range.index) {
                      <button
                        type="button"
                        (click)="setEpisodePage(range.index)"
                        class="rounded-lg px-2.5 py-1 text-xs font-semibold transition"
                        [class]="
                          episodePage() === range.index
                            ? 'bg-[#800020] text-white'
                            : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                        "
                      >
                        {{ range.label }}
                      </button>
                    }
                  </div>
                }
                <div class="max-h-[28rem] overflow-y-auto pr-1">
                  <div class="grid grid-cols-5 gap-1.5">
                    @for (ep of paginatedEpisodes(); track ep.id) {
                      <a
                        [routerLink]="['/anime', animeId(), 'watch', ep.number]"
                        class="flex h-10 items-center justify-center rounded-lg text-sm font-semibold transition"
                        [class]="
                          ep.number === episodeNumber()
                            ? 'bg-[#800020] text-white ring-1 ring-[#800020]/60'
                            : 'bg-white/[0.06] text-white/70 hover:bg-[#800020]/30 hover:text-white'
                        "
                      >
                        {{ ep.number }}
                      </a>
                    }
                  </div>
                </div>
              </div>
            </aside>
          </div>
        }
      </section>
    } @else {
      <section class="mx-auto w-full max-w-7xl pb-16">
        <a
          [routerLink]="['/anime', animeId()]"
          class="mb-3 mt-5 inline-block px-4 text-sm text-white/60 hover:text-white md:px-6"
          >← Back to Anime</a
        >

        @if (loading()) {
          <div class="py-12 text-center text-white/60">Loading stream...</div>
        } @else if (error()) {
          <div class="py-12 text-center text-red-300">{{ error() }}</div>
        } @else {
          <section
            class="relative min-h-[360px] overflow-hidden rounded-2xl border border-white/10 md:min-h-[440px]"
          >
            <div
              class="absolute inset-0 bg-cover bg-center"
              [style.background-image]="'url(' + heroImage() + ')'"
            ></div>
            <div
              class="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/20"
            ></div>
            <div
              class="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent"
            ></div>

            <div
              class="relative z-10 flex h-full flex-col justify-end p-6 md:p-10"
            >
              <div class="mb-3 flex flex-wrap items-center gap-3 text-xs">
                <span
                  class="rounded bg-[#800020] px-2 py-1 font-bold uppercase tracking-wider text-white"
                  >Featured</span
                >
                <span
                  class="font-semibold text-white/80 flex items-center gap-1"
                >
                  <app-star-icon
                    [size]="14"
                    [filled]="true"
                    fillColor="#fbbf24"
                    strokeColor="#fbbf24"
                  />
                  {{ scoreText() }}
                </span>
                <span class="text-white/60"
                  >{{ genreText() }} • {{ statusText() }}</span
                >
              </div>
              <h1 class="max-w-4xl text-3xl font-black text-white md:text-5xl">
                {{ title() }}
              </h1>
              <div class="mt-5 flex flex-wrap gap-3">
                <button
                  class="rounded-xl bg-[#800020] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#9f0030]"
                  type="button"
                >
                  Watch Now
                </button>
                <button
                  class="rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/20"
                  type="button"
                >
                  Add to Watchlist
                </button>
                <button
                  class="rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-bold text-white hover:bg-white/20"
                  type="button"
                >
                  Share
                </button>
              </div>
            </div>
          </section>

          <section
            class="mt-5 rounded-2xl border border-white/10 bg-black/40 p-4 md:p-5"
          >
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <div
                class="inline-flex rounded-full border border-white/15 overflow-hidden"
              >
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-semibold transition-colors"
                  [class]="
                    audioType() === 'sub'
                      ? 'bg-[#800020] text-white'
                      : 'bg-black/40 text-white/60 hover:text-white'
                  "
                  (click)="onAudioTypeChange('sub')"
                >
                  SUB
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-semibold transition-colors"
                  [class]="
                    audioType() === 'dub'
                      ? 'bg-[#800020] text-white'
                      : 'bg-black/40 text-white/60 hover:text-white'
                  "
                  (click)="onAudioTypeChange('dub')"
                >
                  DUB
                </button>
              </div>

              <button
                type="button"
                class="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white hover:bg-white/10"
                (click)="showAdvanced.set(!showAdvanced())"
              >
                {{ showAdvanced() ? "Hide advanced" : "Advanced" }}
              </button>

              @if (selectedSource()?.url) {
                <a
                  [href]="
                    selectedSource()?.originalUrl || selectedSource()?.url
                  "
                  target="_blank"
                  rel="noopener noreferrer"
                  class="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white hover:bg-white/10"
                >
                  Open source
                </a>
              }

              @if (showAdvanced()) {
                <select
                  class="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white"
                  [value]="provider()"
                  (change)="onProviderChange($event)"
                >
                  @for (p of providers(); track p) {
                    <option [value]="p">{{ p }}</option>
                  }
                </select>

                <select
                  class="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white"
                  [value]="server()"
                  (change)="onServerChange($event)"
                >
                  <option value="">auto-server</option>
                  @for (s of serverOptions(); track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>

                @if (qualityOptions().length > 1) {
                  <select
                    class="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white"
                    [value]="selectedQualityLevel()"
                    (change)="onQualityChange($event)"
                  >
                    @for (quality of qualityOptions(); track quality.value) {
                      <option [value]="quality.value">
                        {{ quality.label }}
                      </option>
                    }
                  </select>
                }
              }

              @for (source of sourceButtons(); track source.url) {
                <button
                  type="button"
                  class="rounded-full px-3 py-1 text-xs"
                  [class]="
                    activeSourceUrl() === source.url
                      ? 'bg-[#800020] text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  "
                  (click)="selectSource(source.url, source.index)"
                >
                  {{ source.label }}
                </button>
              }
            </div>

            @if (playbackNotice()) {
              <div
                class="mb-3 rounded-lg border border-yellow-500/30 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-100"
              >
                {{ playbackNotice() }}
              </div>
            }

            <div
              class="overflow-hidden rounded-xl border border-white/10 bg-black"
            >
              @if (selectedSourceIsEmbed()) {
                <iframe
                  class="aspect-video w-full bg-black"
                  [src]="selectedEmbedUrl()"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowfullscreen
                ></iframe>
              } @else {
                <video
                  #videoEl
                  controls
                  playsinline
                  class="aspect-video w-full bg-black"
                ></video>
              }
            </div>
          </section>

          <section
            class="mt-8 grid grid-cols-1 gap-8 px-4 md:px-6 lg:grid-cols-3 lg:gap-10"
          >
            <div class="space-y-8 lg:col-span-2">
              <div>
                <h3 class="mb-3 text-lg font-bold text-[#d46]">Synopsis</h3>
                <p class="text-white/75">{{ synopsisText() }}</p>
              </div>

              <div>
                <div class="mb-4 flex items-center justify-between">
                  <h3 class="text-lg font-bold text-white">Episodes</h3>
                  <span class="text-xs text-white/50"
                    >{{ episodes().length }} Episodes Available</span
                  >
                </div>

                @if (episodeRanges().length > 0) {
                  <div class="mb-4 flex flex-wrap gap-2">
                    @for (range of episodeRanges(); track range.index) {
                      <button
                        type="button"
                        (click)="setEpisodePage(range.index)"
                        class="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                        [class]="
                          episodePage() === range.index
                            ? 'bg-[#800020] text-white'
                            : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                        "
                      >
                        {{ range.label }}
                      </button>
                    }
                  </div>
                }

                <div
                  class="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10"
                >
                  @for (ep of paginatedEpisodes(); track ep.id) {
                    <a
                      [routerLink]="['/anime', animeId(), 'watch', ep.number]"
                      class="flex h-11 items-center justify-center rounded-lg text-sm font-semibold transition"
                      [class]="
                        ep.number === episodeNumber()
                          ? 'bg-[#800020] text-white ring-1 ring-[#800020]/60'
                          : 'bg-white/[0.06] text-white/70 hover:bg-[#800020]/30 hover:text-white'
                      "
                    >
                      {{ ep.number }}
                    </a>
                  }
                </div>
              </div>
            </div>

            <div class="space-y-6">
              <div
                class="rounded-2xl border border-[#800020]/25 bg-[#2a1b15]/70 p-5"
              >
                <h4 class="mb-3 text-base font-bold text-white">
                  Series Information
                </h4>
                <div class="space-y-3 text-sm">
                  <div
                    class="flex items-center justify-between border-b border-white/10 pb-2"
                  >
                    <span class="text-white/60">Aired</span
                    ><span class="text-white">{{ airedText() }}</span>
                  </div>
                  <div
                    class="flex items-center justify-between border-b border-white/10 pb-2"
                  >
                    <span class="text-white/60">Status</span
                    ><span class="text-[#d46]">{{ statusText() }}</span>
                  </div>
                  <div
                    class="flex items-center justify-between border-b border-white/10 pb-2"
                  >
                    <span class="text-white/60">Episodes</span
                    ><span class="text-white">{{ totalEpisodesText() }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-white/60">Rating</span
                    ><span class="text-white">{{ scoreText() }}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        }
      </section>
    }
  `,
})
export class AnimeWatchComponent implements AfterViewInit, OnDestroy {
  @ViewChild("videoEl") videoRef?: ElementRef<HTMLVideoElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(AnimeApiService);
  private sanitizer = inject(DomSanitizer);
  protected pwaService = inject(PwaService);

  private hls: Hls | null = null;
  private mediaRecoveryAttempted = false;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private lastSavedProgress = 0;
  private embedStartTime = 0;

  animeId = signal(0);
  episodeNumber = signal(1);
  title = signal("Anime");
  animeData = signal<AnilistMedia | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  playbackNotice = signal<string | null>(null);
  episodes = signal<
    Array<{ id: string; number: number; title?: string; image?: string }>
  >([]);
  sources = signal<
    Array<{
      url: string;
      originalUrl?: string;
      quality?: string;
      isM3U8?: boolean;
      isEmbed?: boolean;
    }>
  >([]);
  watchHeaders = signal<Record<string, string>>({});
  qualityOptions = signal<Array<{ value: string; label: string }>>([
    { value: "-1", label: "Auto" },
  ]);
  selectedQualityLevel = signal(-1);
  activeSourceUrl = signal<string | null>(null);
  readonly providers = signal<string[]>([
    "auto",
    "embed",
    "gogoanime-by",
    "gogoanime",
    "zoro",
    "animepahe",
  ]);
  readonly serverOptions = signal<string[]>([
    "vidstreaming",
    "gogocdn",
    "streamsb",
  ]);
  provider = signal("auto");
  server = signal("");
  audioType = signal<"sub" | "dub">("sub");
  showAdvanced = signal(false);
  episodePage = signal(0);
  readonly EPISODES_PER_PAGE = 30;

  episodeRanges = computed(() => {
    const eps = this.episodes();
    if (eps.length <= this.EPISODES_PER_PAGE) return [];
    const ranges: Array<{ label: string; index: number }> = [];
    for (let i = 0; i < eps.length; i += this.EPISODES_PER_PAGE) {
      const start = i + 1;
      const end = Math.min(i + this.EPISODES_PER_PAGE, eps.length);
      ranges.push({
        label: `${start}-${end}`,
        index: Math.floor(i / this.EPISODES_PER_PAGE),
      });
    }
    return ranges;
  });

  paginatedEpisodes = computed(() => {
    const eps = this.episodes();
    if (eps.length <= this.EPISODES_PER_PAGE) return eps;
    const start = this.episodePage() * this.EPISODES_PER_PAGE;
    return eps.slice(start, start + this.EPISODES_PER_PAGE);
  });

  selectedSource = computed(
    () =>
      this.sources().find((entry) => entry.url === this.activeSourceUrl()) ||
      null,
  );
  selectedSourceIndex = computed(() =>
    this.sources().findIndex((entry) => entry.url === this.activeSourceUrl()),
  );
  selectedSourceIsEmbed = computed(() => !!this.selectedSource()?.isEmbed);
  selectedEmbedUrl = computed<SafeResourceUrl | null>(() => {
    const source = this.selectedSource();
    if (!source?.url || !source.isEmbed) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(source.url);
  });
  sourceButtons = computed(() =>
    this.sources().map((source, index) => ({
      ...source,
      label: this.labelSource(source, index),
      index,
    })),
  );
  heroImage = computed(
    () =>
      this.animeData()?.bannerImage ||
      this.animeData()?.coverImage?.extraLarge ||
      this.animeData()?.coverImage?.large ||
      "/assets/images/poster-placeholder.svg",
  );
  posterImage = computed(
    () =>
      this.animeData()?.coverImage?.extraLarge ||
      this.animeData()?.coverImage?.large ||
      "/assets/images/poster-placeholder.svg",
  );
  synopsisText = computed(() => {
    const raw = this.animeData()?.description || "";
    const stripped = String(raw)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return stripped || "Synopsis unavailable right now.";
  });
  genreText = computed(() => {
    const genres: string[] = this.animeData()?.genres || [];
    return genres.slice(0, 2).join(", ") || "Anime";
  });
  scoreText = computed(() => {
    const score = this.animeData()?.averageScore;
    return typeof score === "number" ? `${score}%` : "N/A";
  });
  statusText = computed(() =>
    String(this.animeData()?.status || "Unknown").replace(/_/g, " "),
  );
  airedText = computed(() => {
    const start = this.animeData()?.startDate;
    if (!start?.year) return "Unknown";
    const end = this.animeData()?.endDate;
    return end?.year
      ? `${start.year} - ${end.year}`
      : `${start.year} - Present`;
  });
  totalEpisodesText = computed(
    () => this.animeData()?.episodes || this.episodes().length || "?",
  );

  useCinemaShell(): boolean {
    if (this.pwaService.isTV()) return true;
    if (typeof window === "undefined") return false;
    return (
      (this.pwaService.isAppMode() && window.innerWidth >= 1100) ||
      window.innerWidth >= 1400
    );
  }

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const animeId = Number(params.get("id") || 0);
      const episodeNumber = Number(params.get("episodeNumber") || 1);
      if (!animeId || !episodeNumber) return;
      this.animeId.set(animeId);
      this.episodeNumber.set(episodeNumber);
      // Auto-select the correct episode range page
      this.episodePage.set(
        Math.floor((episodeNumber - 1) / this.EPISODES_PER_PAGE),
      );
    });

    this.route.queryParamMap.subscribe((query) => {
      const provider = (query.get("provider") || "auto").trim();
      const server = (query.get("server") || "").trim();
      const type = (query.get("type") || "").trim();
      this.provider.set(provider || "auto");
      this.server.set(server);
      if (type === "sub" || type === "dub") this.audioType.set(type);
      if (this.animeId() && this.episodeNumber()) {
        this.load();
      }
    });
  }

  ngAfterViewInit(): void {
    const source = this.selectedSource();
    if (!source || source.isEmbed) return;
    this.attachSource(source.url, !!source.isM3U8);
  }

  ngOnDestroy(): void {
    this.saveCurrentProgress();
    this.stopProgressTracking();
    this.destroyPlayer();
  }

  setEpisodePage(page: number): void {
    this.episodePage.set(page);
  }

  selectSource(url: string, index?: number): void {
    this.activeSourceUrl.set(url);
    this.playbackNotice.set(null);

    const source = this.selectedSource();
    if (!source) return;

    if (source.isEmbed) {
      this.destroyPlayer();
      this.startEmbedProgressTracking();
      return;
    }

    this.attachSource(source.url, !!source.isM3U8);
  }

  onProviderChange(event: Event): void {
    const value =
      (event.target as HTMLSelectElement | null)?.value?.trim() || "auto";
    this.provider.set(value);
    this.updateQueryParams({ provider: value, server: this.server() || null });
  }

  onServerChange(event: Event): void {
    const value =
      (event.target as HTMLSelectElement | null)?.value?.trim() || "";
    this.server.set(value);
    this.updateQueryParams({
      provider: this.provider(),
      server: value || null,
    });
  }

  onAudioTypeChange(type: "sub" | "dub"): void {
    if (this.audioType() === type) return;
    this.audioType.set(type);
    this.updateQueryParams({
      provider: this.provider(),
      server: this.server() || null,
      type,
    });
  }

  onQualityChange(event: Event): void {
    const value = Number(
      (event.target as HTMLSelectElement | null)?.value ?? -1,
    );
    this.selectedQualityLevel.set(Number.isFinite(value) ? value : -1);
    if (this.hls) {
      this.hls.currentLevel = this.selectedQualityLevel();
    }
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.playbackNotice.set(null);

    this.api.getAnime(this.animeId()).subscribe({
      next: (res) => {
        const anime = res?.data;
        this.animeData.set(anime || null);
        this.title.set(
          anime?.title?.english ||
            anime?.title?.romaji ||
            anime?.title?.native ||
            "Anime",
        );
        // If episodes are still empty after bridge failed, generate from metadata
        if (this.episodes().length === 0 && anime?.episodes) {
          this.generateFallbackEpisodes();
        }
      },
    });

    this.api.getEpisodes(this.animeId(), this.provider()).subscribe({
      next: (res) => {
        const bridgeEps = res?.data?.episodes || [];
        if (bridgeEps.length > 0) {
          this.episodes.set(bridgeEps);
        } else {
          // Generate placeholder episodes from AniList metadata
          this.generateFallbackEpisodes();
        }
      },
      error: () => this.generateFallbackEpisodes(),
    });

    this.api
      .getWatchSources(
        this.animeId(),
        this.episodeNumber(),
        this.provider(),
        this.server() || undefined,
        this.audioType(),
      )
      .pipe(timeout(20_000))
      .subscribe({
        next: (res) => {
          const headers = (res?.data?.headers || {}) as Record<string, string>;
          this.watchHeaders.set(headers);
          const referer = this.pickReferer(headers);

          const sources = (res?.data?.sources || [])
            .filter((entry) => !!entry?.url)
            .map((entry) => {
              const originalUrl = String(entry.url);
              const sourceReferer =
                typeof entry.referer === "string" && entry.referer.trim()
                  ? entry.referer.trim()
                  : referer;

              // Don't proxy embed URLs - return them directly for iframe
              if (entry.isEmbed) {
                return {
                  url: originalUrl,
                  originalUrl,
                  quality: entry.quality,
                  isM3U8: false,
                  isEmbed: true,
                };
              }

              return {
                url: this.proxyStreamUrl(originalUrl, sourceReferer),
                originalUrl,
                quality: entry.quality,
                isM3U8: entry.isM3U8,
                isEmbed: false,
              };
            });

          this.sources.set(sources);
          const first = sources[0];
          this.activeSourceUrl.set(first?.url || null);
          this.loading.set(false);
          if (first) {
            this.selectSource(first.url, 0);
          } else {
            this.error.set("No playable source available for this episode.");
          }
        },
        error: () => {
          this.sources.set([]);
          this.loading.set(false);
          this.error.set("Failed to load watch sources.");
        },
      });
  }

  private updateQueryParams(queryParams: {
    provider: string;
    server: string | null;
    type?: string;
  }): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  private proxyStreamUrl(targetUrl: string, referer?: string): string {
    const params = new URLSearchParams({ url: targetUrl });
    if (referer) params.set("referer", referer);
    return `/api/v1/anime/proxy/stream?${params.toString()}`;
  }

  private pickReferer(headers: Record<string, string>): string | undefined {
    const refererEntry = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === "referer",
    );
    const referer = refererEntry?.[1]?.trim();
    if (referer) return referer;
    return undefined;
  }

  private tryNextSource(message: string): void {
    const currentIndex = this.selectedSourceIndex();
    const nextIndex = currentIndex >= 0 ? currentIndex + 1 : -1;
    const next = nextIndex >= 0 ? this.sources()[nextIndex] : null;
    if (!next) {
      this.playbackNotice.set(
        "This source may be blocked here. Use Open source or switch provider in Advanced.",
      );
      return;
    }

    this.playbackNotice.set(message);
    this.selectSource(next.url, nextIndex);
  }

  private labelSource(
    source: { quality?: string; isM3U8?: boolean; isEmbed?: boolean },
    index: number,
  ): string {
    const quality = (source.quality || "").trim();
    if (source.isEmbed) return quality || `Server ${index + 1}`;
    if (/^\d{3,4}p$/i.test(quality)) return quality.toUpperCase();
    if (/\bm3u8\b/i.test(quality)) return `HLS ${index + 1}`;
    if (/\b(auto|default)\b/i.test(quality)) return `Auto ${index + 1}`;
    if (!quality) return `Server ${index + 1}`;
    return quality.replace(/[-_]/g, " ").slice(0, 18);
  }

  private attachSource(url: string, isM3U8: boolean): void {
    const video = this.videoRef?.nativeElement;
    if (!video) return;

    this.destroyPlayer();
    this.qualityOptions.set([{ value: "-1", label: "Auto" }]);
    this.selectedQualityLevel.set(-1);
    this.mediaRecoveryAttempted = false;

    if (isM3U8 && Hls.isSupported()) {
      this.hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        manifestLoadingTimeOut: 15000,
        levelLoadingTimeOut: 15000,
        fragLoadingTimeOut: 20000,
      });

      this.hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const options = [{ value: "-1", label: "Auto" }];
        data.levels.forEach((level, index) => {
          const height = level.height ? `${level.height}p` : null;
          const bitrate = level.bitrate
            ? `${Math.round(level.bitrate / 1000)}kbps`
            : null;
          const label =
            [height, bitrate].filter(Boolean).join(" • ") ||
            `Level ${index + 1}`;
          options.push({ value: String(index), label });
        });
        this.qualityOptions.set(options);
        this.selectedQualityLevel.set(-1);
        void video.play().catch(() => undefined);
      });

      this.hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        this.selectedQualityLevel.set(data.level);
      });

      this.hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          this.playbackNotice.set(
            "Network hiccup detected. Retrying stream...",
          );
          this.hls?.startLoad();
          return;
        }

        if (
          data.type === Hls.ErrorTypes.MEDIA_ERROR &&
          !this.mediaRecoveryAttempted
        ) {
          this.mediaRecoveryAttempted = true;
          this.playbackNotice.set(
            "Playback error detected. Recovering media...",
          );
          this.hls?.recoverMediaError();
          return;
        }

        this.playbackNotice.set(
          "Playback failed on this source. Trying next source...",
        );
        this.tryNextSource("Trying next source...");
      });

      this.hls.loadSource(url);
      this.hls.attachMedia(video);
      this.startProgressTracking();
      return;
    }

    video.src = url;
    void video.play().catch(() => undefined);
    this.startProgressTracking();
  }

  private startProgressTracking(): void {
    this.stopProgressTracking();
    this.progressInterval = setInterval(
      () => this.saveCurrentProgress(),
      15_000,
    );
  }

  private stopProgressTracking(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private saveCurrentProgress(): void {
    // For embeds, use time-on-page tracking instead
    if (this.selectedSourceIsEmbed() && this.embedStartTime > 0) {
      this.saveEmbedProgress();
      return;
    }

    const video = this.videoRef?.nativeElement;
    if (!video || !this.animeId() || !this.episodeNumber()) return;
    const progress = Math.floor(video.currentTime);
    const duration = Math.floor(video.duration || 0);
    if (progress <= 5 || duration <= 0) return;
    if (Math.abs(progress - this.lastSavedProgress) < 10) return;
    this.lastSavedProgress = progress;

    this.api
      .saveProgress({
        anilistId: this.animeId(),
        episodeNumber: this.episodeNumber(),
        title: this.title(),
        imageUrl: this.posterImage(),
        progress,
        duration,
      })
      .subscribe();
  }

  private generateFallbackEpisodes(): void {
    const total = Math.max(0, Number(this.animeData()?.episodes || 0));
    if (!total) {
      this.episodes.set([]);
      return;
    }
    const fallback = Array.from({ length: total }, (_, i) => ({
      id: `meta-${i + 1}`,
      number: i + 1,
      title: undefined as string | undefined,
      image: undefined as string | undefined,
    }));
    this.episodes.set(fallback);
  }

  private startEmbedProgressTracking(): void {
    this.stopProgressTracking();
    this.embedStartTime = Date.now();
    // Save initial "started watching" entry
    if (this.animeId() && this.episodeNumber()) {
      this.api
        .saveProgress({
          anilistId: this.animeId(),
          episodeNumber: this.episodeNumber(),
          title: this.title(),
          imageUrl: this.posterImage(),
          progress: 1,
          duration: 1440, // ~24 min typical episode
        })
        .subscribe();
    }
    // Update progress every 30 seconds based on time on page
    this.progressInterval = setInterval(() => this.saveEmbedProgress(), 30_000);
  }

  private saveEmbedProgress(): void {
    if (!this.animeId() || !this.episodeNumber() || !this.embedStartTime)
      return;
    const elapsed = Math.floor((Date.now() - this.embedStartTime) / 1000);
    if (elapsed < 10) return;
    if (Math.abs(elapsed - this.lastSavedProgress) < 20) return;
    this.lastSavedProgress = elapsed;
    const estimatedDuration = 1440; // ~24 min
    this.api
      .saveProgress({
        anilistId: this.animeId(),
        episodeNumber: this.episodeNumber(),
        title: this.title(),
        imageUrl: this.posterImage(),
        progress: Math.min(elapsed, estimatedDuration),
        duration: estimatedDuration,
      })
      .subscribe();
  }

  private destroyPlayer(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    const video = this.videoRef?.nativeElement;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }
}
