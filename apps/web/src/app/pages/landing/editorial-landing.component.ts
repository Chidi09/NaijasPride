import { CommonModule } from "@angular/common";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  AfterViewInit,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import {
  MovieSummary,
  BookSummary,
  MusicVideoSummary,
} from "@naijaspride/types";
import { BeforeInstallPromptEvent } from "../../core/services/pwa.service";
import { FirebaseMessagingService } from "../../core/services/firebase-messaging.service";
import { firstValueFrom } from "rxjs";

type LandingPhase = "glitch" | "dissolve" | "archive";
type InstallPlatform = "ios" | "android" | "desktop" | "other";
type InstallGuideTarget = "mobile" | "desktop" | "tv";

interface InstallGuide {
  title: string;
  steps: string[];
}

interface ArchiveSection {
  id: string;
  number: string;
  type: string;
  title: string;
  titleAccent: string;
  description: string;
  image: string;
  align: "left" | "right";
  link: string;
  features: { label: string; value: string }[];
}

@Component({
  selector: "app-editorial-landing",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div
      class="relative min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-x-hidden"
      style="font-family: 'Plus Jakarta Sans', sans-serif;"
    >
      <!-- PHASE 1-3: Opening Animation (Glitch → Dissolve → Hero) -->
      @if (phase() !== "archive") {
        <section
          class="fixed inset-0 z-40 flex flex-col justify-center items-center bg-black"
          [class.opacity-0]="phase() === 'dissolve'"
          [class.transition-opacity]="phase() === 'dissolve'"
          [class.duration-700]="phase() === 'dissolve'"
        >
          <!-- Skip Button -->
          @if (phase() === "glitch") {
            <button
              (click)="skipAnimation()"
              class="absolute top-8 right-8 text-[10px] tracking-[0.3em] text-white/50 hover:text-white transition-colors uppercase"
            >
              Skip Intro
            </button>
          }

          <!-- Brand Reveal -->
          <div class="text-center">
            <h1
              class="font-serif text-[12vw] md:text-[10vw] leading-[0.85] tracking-tight"
            >
              @for (char of brandChars; track $index) {
                <span
                  class="inline-block transition-all duration-300 ease-out"
                  [class.text-[#8a1c1c]]="$index < burgundyCount"
                  [class.text-white]="$index >= burgundyCount"
                  [class.opacity-0]="$index >= revealedChars()"
                  [class.translate-y-2]="$index >= revealedChars()"
                  [class.opacity-100]="$index < revealedChars()"
                  [class.translate-y-0]="$index < revealedChars()"
                  [class.text-[0.72em]]="char === 's'"
                  [class.align-super]="char === 's'"
                >
                  {{ char }}
                </span>
              }
            </h1>

            @if (revealedChars() >= brandName.length) {
              <p
                class="mt-6 text-[10px] md:text-xs tracking-[0.5em] text-[#8a1c1c] font-bold animate-fade-in"
              >
                COMICS • MOVIES • MUSIC
              </p>
            }
          </div>

          <!-- Location Pills -->
          @if (revealedChars() >= brandName.length && phase() === "glitch") {
            <div
              class="absolute bottom-24 flex gap-8 text-[10px] tracking-widest text-white/60"
            >
              <div class="flex items-center gap-2">
                <div
                  class="w-1.5 h-1.5 bg-[#8a1c1c] rounded-full animate-pulse"
                ></div>
                <span>LAGOS</span>
              </div>
              <span class="opacity-30">•</span>
              <span>LONDON</span>
              <span class="opacity-30">•</span>
              <span>NEW YORK</span>
            </div>
          }
        </section>
      }

      <!-- PHASE 4: Editorial Archive Content -->
      @if (phase() === "archive") {
        <div class="animate-fade-in-slow">
          <!-- Hero Section -->
          <section
            class="h-screen relative flex flex-col justify-center items-center overflow-hidden"
          >
            <div class="absolute inset-0 z-0 bg-[var(--bg-primary)]"></div>
            <div
              class="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,rgba(138,28,28,0.18),transparent_58%)]"
            ></div>

            <div class="relative z-10 text-center px-4">
              <h1
                class="font-display text-[10vw] md:text-[4.8vw] leading-none tracking-[0.2em] md:tracking-[0.32em] pr-[0.2em] md:pr-[0.32em] whitespace-nowrap"
              >
                <span class="text-[#8a1c1c] uppercase">NAIJA</span>
                <span class="text-[#8a1c1c] lowercase text-[0.72em] align-super"
                  >s</span
                >
                <span class="text-white bg-black px-1.5 py-0.5 ml-1 rounded-sm"
                  >PRIDE</span
                >
              </h1>
              <p
                class="mt-8 text-[10px] md:text-xs tracking-[0.35em] text-[var(--text-secondary)] font-bold uppercase"
              >
                COMICS • MOVIES • MUSIC
              </p>
            </div>
          </section>

          <!-- Archive Sections -->
          @for (section of archiveSections(); track section.id) {
            <section
              class="min-h-screen relative flex items-center py-24 border-b border-[var(--border-color)] overflow-hidden"
              [class.scroll-triggered]="scrollProgress() > 0.1 * ($index + 1)"
            >
              <div class="absolute inset-0 z-0">
                <div
                  class="absolute top-0 w-1/2 h-full"
                  [class.left-0]="section.align === 'right'"
                  [class.right-0]="section.align === 'left'"
                  [class.bg-gradient-to-r]="section.align === 'right'"
                  [class.bg-gradient-to-l]="section.align === 'left'"
                  style="background: linear-gradient(to right, rgba(56, 4, 4, 0.05), transparent);"
                ></div>
              </div>

              <div
                class="container mx-auto px-6 md:px-12 relative z-10 flex flex-col md:flex-row gap-16 md:gap-24 items-center"
                [class.md:flex-row-reverse]="section.align === 'right'"
              >
                <!-- Visual Side -->
                <div
                  class="w-full md:w-1/2 group cursor-pointer relative"
                  [routerLink]="[section.link]"
                >
                  <div
                    class="relative aspect-[3/4] bg-[var(--bg-elevated)] overflow-hidden"
                    [class.clip-diag-right]="section.align === 'left'"
                    [class.clip-diag-left]="section.align === 'right'"
                  >
                    <img
                      [src]="section.image"
                      [alt]="section.title"
                      width="1200"
                      height="1600"
                      loading="lazy"
                      decoding="async"
                      fetchpriority="low"
                      referrerpolicy="no-referrer"
                      class="w-full h-full object-cover group-hover:scale-105 transition-all duration-700 ease-out"
                    />

                    <div
                      class="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors duration-500"
                    ></div>

                    <!-- Overlay Details -->
                    <div
                      class="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex justify-between items-end"
                    >
                      <span
                        class="text-[10px] tracking-widest text-[#8a1c1c] font-bold"
                        >START EXPLORING</span
                      >
                      <div
                        class="w-10 h-10 bg-[#8a1c1c] flex items-center justify-center text-black"
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <path d="M7 17L17 7M17 7H7M17 7V17" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <!-- Floating Label -->
                  <div
                    class="absolute -top-6 bg-white/80 dark:bg-[rgba(10,10,10,0.6)] backdrop-blur-sm border border-black/10 dark:border-white/5 px-6 py-3 border-l-2 border-[#8a1c1c] z-20"
                    [class.-left-6]="section.align === 'right'"
                    [class.-right-6]="section.align === 'left'"
                  >
                    <span
                      class="text-xs font-bold tracking-[0.3em] text-[var(--text-primary)]"
                      >{{ section.type }}</span
                    >
                  </div>
                </div>

                <!-- Text Side -->
                <div class="w-full md:w-1/2 space-y-8">
                  <div class="flex flex-col">
                    <span
                      class="font-display text-8xl text-[var(--border-color)] font-bold leading-none mb-4 select-none"
                      style="-webkit-text-stroke: 1px rgba(100, 100, 100, 0.3); color: transparent;"
                    >
                      {{ section.number }}
                    </span>

                    <h2
                      class="font-serif text-4xl md:text-6xl lg:text-7xl text-[var(--text-primary)] leading-[0.9] uppercase"
                    >
                      {{ section.title }} <br />
                      <span
                        class="italic text-[#8a1c1c] opacity-80 normal-case"
                        >{{ section.titleAccent }}</span
                      >
                    </h2>
                  </div>

                  <p
                    class="font-sans text-sm md:text-base text-[var(--text-secondary)] opacity-80 leading-relaxed max-w-md border-l border-[var(--border-color)] pl-6"
                  >
                    {{ section.description }}
                  </p>

                  <!-- Tech Specs Grid -->
                  <div
                    class="grid grid-cols-2 gap-y-4 gap-x-8 py-6 border-t border-[var(--border-color)] w-full max-w-md"
                  >
                    @for (feature of section.features; track feature.label) {
                      <div class="flex flex-col">
                        <span
                          class="text-[8px] tracking-widest text-[#8a1c1c] opacity-80 mb-1"
                          >{{ feature.label }}</span
                        >
                        <span
                          class="font-sans text-xs tracking-wider text-[var(--text-primary)]"
                          >{{ feature.value }}</span
                        >
                      </div>
                    }
                  </div>

                  <a [routerLink]="[section.link]" class="inline-block">
                    <button
                      class="flex items-center gap-4 text-xs tracking-[0.2em] text-[var(--text-primary)] hover:text-[#8a1c1c] transition-colors group"
                    >
                      ENTER SECTION
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="group-hover:translate-x-2 transition-transform"
                      >
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </button>
                  </a>
                </div>
              </div>
            </section>
          }

          <!-- Device Showcase Section -->
          <section
            class="py-32 px-6 md:px-12 bg-[var(--bg-primary)] border-b border-[var(--border-color)]"
          >
            <div class="max-w-7xl mx-auto">
              <div class="mb-24 text-center">
                <span
                  class="text-[10px] tracking-[0.4em] text-[#8a1c1c] font-bold block mb-4"
                  >COMPATIBILITY</span
                >
                <h2
                  class="font-serif text-4xl md:text-6xl text-[var(--text-primary)] mb-6"
                >
                  AVAILABLE EVERYWHERE
                </h2>
                <p
                  class="font-sans text-sm text-[var(--text-secondary)] max-w-xl mx-auto"
                >
                  Your library travels with you. Seamless synchronization across
                  all your devices.
                </p>
                <p
                  class="font-sans text-xs text-[var(--text-secondary)] max-w-2xl mx-auto mt-4"
                >
                  Install NaijasPride as an app for a faster launch and a
                  full-screen experience.
                </p>
              </div>

              <div
                class="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10 max-w-5xl mx-auto"
              >
                <!-- Mobile -->
                <div
                  class="flex flex-col items-center gap-4 border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-xl p-4"
                >
                  <div
                    class="w-full h-[320px] border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-xl flex items-center justify-center relative overflow-hidden hover:border-[#8a1c1c] transition-colors"
                  >
                    <img
                      src="assets/images/mobile-phone.png"
                      alt="Mobile app"
                      class="w-full h-full object-contain p-6"
                      loading="lazy"
                    />
                  </div>
                  <span
                    class="text-[10px] tracking-[0.2em] text-[var(--text-secondary)]"
                    >MOBILE</span
                  >
                  <p
                    class="text-xs text-[var(--text-secondary)] text-center leading-relaxed"
                  >
                    iOS: Share → Add to Home Screen. Android: Menu → Install
                    App.
                  </p>
                  <button
                    (click)="installPwa('mobile')"
                    class="w-full py-2 border border-[var(--border-color)] text-[10px] tracking-[0.18em] uppercase hover:border-[#8a1c1c] hover:text-[#8a1c1c] transition-colors"
                  >
                    Install / See Steps
                  </button>
                  <a
                    href="https://media.naijaspride.com/downloads/naijaspride-android-latest.apk"
                    download
                    class="w-full py-2 text-center bg-[#8a1c1c] text-white text-[10px] tracking-[0.18em] uppercase hover:bg-[#6f1616] transition-colors"
                  >
                    Download Android App
                  </a>
                </div>

                <!-- Desktop -->
                <div
                  class="flex flex-col items-center gap-4 border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-xl p-4"
                >
                  <div
                    class="w-full h-[320px] border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-xl flex items-center justify-center relative overflow-hidden hover:border-[#8a1c1c] transition-colors"
                  >
                    <img
                      src="assets/images/laptop-device.png"
                      alt="Desktop app"
                      class="w-full h-full object-contain p-6"
                      loading="lazy"
                    />
                  </div>
                  <span
                    class="text-[10px] tracking-[0.2em] text-[var(--text-secondary)]"
                    >DESKTOP</span
                  >
                  <p
                    class="text-xs text-[var(--text-secondary)] text-center leading-relaxed"
                  >
                    Chrome/Edge: click the install icon in the address bar or
                    use the browser menu.
                  </p>
                  <button
                    (click)="installPwa('desktop')"
                    class="w-full py-2 border border-[var(--border-color)] text-[10px] tracking-[0.18em] uppercase hover:border-[#8a1c1c] hover:text-[#8a1c1c] transition-colors"
                  >
                    Install / See Steps
                  </button>
                </div>

                <!-- TV -->
                <div
                  class="flex flex-col items-center gap-4 border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-xl p-4"
                >
                  <div
                    class="w-full h-[320px] border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-xl flex items-center justify-center relative overflow-hidden hover:border-[#8a1c1c] transition-colors"
                  >
                    <img
                      src="assets/images/tv-device.png"
                      alt="TV app"
                      width="1200"
                      height="800"
                      class="w-full h-full object-contain p-6"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <span
                    class="text-[10px] tracking-[0.2em] text-[var(--text-secondary)]"
                    >TV</span
                  >
                  <p
                    class="text-xs text-[var(--text-secondary)] text-center leading-relaxed"
                  >
                    Open naijaspride.com in your TV browser, or cast from
                    mobile/desktop.
                  </p>
                  <button
                    (click)="openInstallGuide('tv')"
                    class="w-full py-2 border border-[var(--border-color)] text-[10px] tracking-[0.18em] uppercase hover:border-[#8a1c1c] hover:text-[#8a1c1c] transition-colors"
                  >
                    TV Setup Steps
                  </button>
                </div>
              </div>

              @if (installGuide(); as guide) {
                <div
                  class="max-w-3xl mx-auto mt-10 border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5 md:p-6"
                >
                  <div class="flex items-start justify-between gap-4 mb-4">
                    <h3 class="font-serif text-2xl text-[var(--text-primary)]">
                      {{ guide.title }}
                    </h3>
                    <button
                      (click)="installGuide.set(null)"
                      class="text-[10px] tracking-[0.2em] text-[var(--text-secondary)] hover:text-[var(--text-primary)] uppercase"
                    >
                      Close
                    </button>
                  </div>
                  <ol
                    class="space-y-2 text-sm text-[var(--text-secondary)] list-decimal pl-5"
                  >
                    @for (step of guide.steps; track $index) {
                      <li>{{ step }}</li>
                    }
                  </ol>
                </div>
              }

              <div
                class="max-w-3xl mx-auto mt-6 border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
              >
                <div>
                  <h3 class="font-serif text-xl text-[var(--text-primary)]">
                    Notifications
                  </h3>
                  <p class="text-sm text-[var(--text-secondary)]">
                    Enable push notifications for new drops and release alerts.
                  </p>
                </div>
                <button
                  (click)="enablePushNotifications()"
                  class="px-4 py-2 border border-[var(--border-color)] text-[10px] tracking-[0.18em] uppercase hover:border-[#8a1c1c] hover:text-[#8a1c1c] transition-colors"
                >
                  Enable Notifications
                </button>
              </div>

              @if (pushStatus()) {
                <p
                  class="max-w-3xl mx-auto mt-3 text-xs text-[var(--text-secondary)]"
                >
                  {{ pushStatus() }}
                </p>
              }
            </div>
          </section>

          <!-- Pricing Section -->
          <section
            class="py-32 px-6 md:px-12 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]"
          >
            <div
              class="max-w-7xl mx-auto flex flex-col md:flex-row gap-16 items-start"
            >
              <div class="md:w-1/3">
                <span
                  class="text-[10px] tracking-[0.4em] text-[#8a1c1c] font-bold block mb-4"
                  >MEMBERSHIP</span
                >
                <h2
                  class="font-serif text-4xl md:text-5xl text-[var(--text-primary)] leading-tight mb-6 uppercase"
                >
                  UNLOCK THE <br />
                  <span class="italic opacity-50 normal-case"
                    >Full Archive</span
                  >
                </h2>
                <p
                  class="font-sans text-sm text-[var(--text-secondary)] leading-relaxed mb-8"
                >
                  Get full access to movies, books, comics, and music videos
                  with one account.
                </p>
              </div>

              <div
                class="md:w-2/3 grid grid-cols-1 md:grid-cols-2 gap-8 w-full"
              >
                <!-- Free Tier -->
                <div
                  class="border border-[var(--border-color)] p-8 bg-[var(--bg-primary)] hover:border-[var(--text-primary)] transition-colors group"
                >
                  <div class="mb-8">
                    <span class="text-xs tracking-widest opacity-60"
                      >GUEST</span
                    >
                    <h3 class="font-serif text-4xl mt-2">Free</h3>
                    <p class="text-[10px] tracking-widest mt-2 opacity-40">
                      AD-SUPPORTED ACCESS
                    </p>
                  </div>
                  <ul class="space-y-4 mb-8">
                    @for (
                      item of [
                        "Preview Catalog Access",
                        "Ad-Supported Streaming",
                        "Basic Library Features",
                      ];
                      track $index
                    ) {
                      <li
                        class="flex items-center gap-3 text-xs text-[var(--text-secondary)]"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {{ item }}
                      </li>
                    }
                  </ul>
                  <button
                    [routerLink]="['/register']"
                    class="w-full py-4 border border-[var(--border-color)] text-[10px] tracking-[0.2em] uppercase hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    Start Free
                  </button>
                </div>

                <!-- Premium Tier -->
                <div
                  class="border border-[#8a1c1c] p-8 bg-[var(--bg-elevated)] relative overflow-hidden"
                >
                  <div class="absolute top-0 right-0 bg-[#8a1c1c] px-3 py-1">
                    <span
                      class="text-[8px] tracking-widest text-black font-bold"
                      >RECOMMENDED</span
                    >
                  </div>
                  <div class="mb-8">
                    <span class="text-xs tracking-widest text-[#8a1c1c]"
                      >MEMBER</span
                    >
                    <h3
                      class="font-serif text-4xl mt-2 text-[var(--text-primary)]"
                    >
                      ₦1,000<span class="text-sm opacity-50">/mo</span>
                    </h3>
                    <p class="text-[10px] tracking-widest mt-2 opacity-60">
                      FULL ACCESS
                    </p>
                  </div>
                  <ul class="space-y-4 mb-8">
                    @for (
                      item of [
                        "Full Catalog Access",
                        "Higher Quality Streaming",
                        "Creator Support Benefits",
                        "Ad-Free Experience",
                      ];
                      track $index
                    ) {
                      <li
                        class="flex items-center gap-3 text-xs text-[var(--text-primary)]"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          class="text-[#8a1c1c]"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {{ item }}
                      </li>
                    }
                  </ul>
                  <button
                    [routerLink]="['/premium']"
                    class="w-full py-4 bg-[#8a1c1c] text-black font-bold text-[10px] tracking-[0.2em] uppercase hover:bg-[var(--text-primary)] transition-colors"
                  >
                    Join Now
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .font-display {
        font-family: "Cinzel", serif;
      }

      .font-serif {
        font-family: "Cormorant Garamond", serif;
      }

      .font-sans {
        font-family: "Plus Jakarta Sans", sans-serif;
      }

      .clip-diag-right {
        clip-path: polygon(10% 0, 100% 0, 100% 100%, 0 100%, 0 10%);
      }

      .clip-diag-left {
        clip-path: polygon(0 0, 90% 0, 100% 10%, 100% 100%, 0 100%);
      }

      @keyframes fade-in {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes fade-in-slow {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes scroll-line {
        0% {
          transform: translateY(-100%);
        }
        100% {
          transform: translateY(100%);
        }
      }

      .animate-fade-in {
        animation: fade-in 0.8s ease-out forwards;
      }

      .animate-fade-in-slow {
        animation: fade-in-slow 1.2s ease-out forwards;
      }

      .animate-scroll-line {
        animation: scroll-line 1.5s linear infinite;
      }

      /* Scroll reveal animations */
      .scroll-triggered {
        animation: fade-in 0.8s ease-out forwards;
      }
    `,
  ],
})
export class EditorialLandingComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  private http = inject(HttpClient);
  private firebaseMessaging = inject(FirebaseMessagingService);
  private readonly onScroll = this.handleScroll.bind(this);

  // Animation state
  phase = signal<LandingPhase>("glitch");
  readonly brandName = "NAIJAsPRIDE";
  readonly burgundyCount = 6;
  revealedChars = signal(0);
  private timers: ReturnType<typeof setTimeout>[] = [];
  scrollProgress = signal(0);

  // Data
  movies = signal<MovieSummary[]>([]);
  books = signal<BookSummary[]>([]);
  music = signal<MusicVideoSummary[]>([]);
  booksFallbackCover = signal<string | null>(null);

  // PWA Install
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  pwaInstallable = signal(false);
  platform = signal<InstallPlatform>("other");
  installGuide = signal<InstallGuide | null>(null);
  pushStatus = signal<string | null>(null);

  // Computed
  brandChars = this.brandName.split("");

  archiveSections = computed<ArchiveSection[]>(() => [
    {
      id: "books",
      number: "01",
      type: "READ",
      title: "COMICS &",
      titleAccent: "Manga",
      description:
        "Read comics, manga, and books from one library. Pick up where you stopped and keep your progress synced across devices.",
      image:
        this.books().find((book) => !!book.coverUrl)?.coverUrl ||
        this.booksFallbackCover() ||
        "assets/images/things-fall-apart.jpg",
      align: "left",
      link: "/books",
      features: [
        { label: "FORMATS", value: "Web Reader, EPUB, PDF" },
        { label: "DISCOVERY", value: "Books, Comics, Manga" },
        { label: "UPDATES", value: "New Titles Weekly" },
      ],
    },
    {
      id: "movies",
      number: "02",
      type: "WATCH",
      title: "MOVIES &",
      titleAccent: "TV",
      description:
        "Stream movies and series with watch progress, continue-watching, and subtitle support built into the player.",
      image:
        this.movies().find(
          (movie) =>
            !!(movie.backdropUrl || movie.posterUrl || movie.thumbnailUrl),
        )?.backdropUrl ||
        this.movies().find(
          (movie) =>
            !!(movie.backdropUrl || movie.posterUrl || movie.thumbnailUrl),
        )?.posterUrl ||
        this.movies().find(
          (movie) =>
            !!(movie.backdropUrl || movie.posterUrl || movie.thumbnailUrl),
        )?.thumbnailUrl ||
        "assets/images/og-image.png",
      align: "right",
      link: "/movies",
      features: [
        { label: "PLAYBACK", value: "Adaptive Streaming" },
        { label: "SUBTITLES", value: "Built-in Subtitle Support" },
        { label: "TRACKING", value: "Continue Watching" },
      ],
    },
    {
      id: "music",
      number: "03",
      type: "LISTEN",
      title: "MUSIC &",
      titleAccent: "Videos",
      description:
        "Explore artist pages, trending tracks, and new music videos in a player that stays with you across the app.",
      image:
        this.music().find(
          (video) => !!(video.hdThumbnailUrl || video.thumbnailUrl),
        )?.hdThumbnailUrl ||
        this.music().find(
          (video) => !!(video.hdThumbnailUrl || video.thumbnailUrl),
        )?.thumbnailUrl ||
        "assets/images/og-image.png",
      align: "left",
      link: "/music",
      features: [
        { label: "DISCOVERY", value: "Trending + New Releases" },
        { label: "MEDIA", value: "Music Video Catalog" },
        { label: "ARTISTS", value: "Dedicated Artist Pages" },
      ],
    },
  ]);

  currentDate =
    new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      timeZone: "Africa/Lagos",
    }) + " WAT";

  ngOnInit() {
    // Check reduced motion preference
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      this.revealedChars.set(this.brandName.length);
      this.phase.set("archive");
    } else {
      this.startSequence();
    }

    // Load data
    this.loadData();

    // Setup PWA install listener
    if (typeof window !== "undefined") {
      this.platform.set(this.detectPlatform());

      window.addEventListener("beforeinstallprompt", (e) => {
        // Prevent the mini-infobar from appearing on mobile
        e.preventDefault();
        // Store the event for later use
        this.deferredPrompt = e as BeforeInstallPromptEvent;
        // Show install button
        this.pwaInstallable.set(true);
      });

      // Listen for app installed event
      window.addEventListener("appinstalled", () => {
        this.pwaInstallable.set(false);
        this.deferredPrompt = null;
      });
    }
  }

  ngAfterViewInit() {
    // Setup scroll listener for archive phase
    if (typeof window !== "undefined") {
      window.addEventListener("scroll", this.onScroll, { passive: true });
    }
  }

  ngOnDestroy() {
    this.timers.forEach(clearTimeout);
    if (typeof window !== "undefined") {
      window.removeEventListener("scroll", this.onScroll);
    }
  }

  private startSequence() {
    const charDelay = 120;
    const holdTime = 350;
    const dissolveTime = 450;

    // Phase 1: Reveal characters
    for (let i = 0; i < this.brandName.length; i++) {
      const t = setTimeout(() => {
        this.revealedChars.set(i + 1);
      }, i * charDelay);
      this.timers.push(t);
    }

    // Phase 2: Dissolve
    const dissolveStart = this.brandName.length * charDelay + holdTime;
    const t2 = setTimeout(() => {
      this.phase.set("dissolve");
    }, dissolveStart);
    this.timers.push(t2);

    // Phase 3: Archive content
    const archiveStart = dissolveStart + dissolveTime;
    const t4 = setTimeout(() => {
      this.phase.set("archive");
    }, archiveStart);
    this.timers.push(t4);
  }

  skipAnimation() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.revealedChars.set(this.brandName.length);
    this.phase.set("archive");
  }

  private loadData() {
    // Load movies
    this.http
      .get<{ success?: boolean; data?: MovieSummary[] }>("/api/v1/movies", {
        params: { limit: "6", sortBy: "latest" },
      })
      .subscribe({
        next: (res) => {
          const movies = Array.isArray(res.data) ? res.data : [];
          this.movies.set(movies);
        },
        error: () => this.movies.set([]),
      });

    // Load books
    this.http
      .get<{ success?: boolean; data?: BookSummary[] }>("/api/v1/books", {
        params: { limit: "6", sortBy: "latest" },
      })
      .subscribe({
        next: (res) => {
          const books = Array.isArray(res.data) ? res.data : [];
          this.books.set(books);
        },
        error: () => this.books.set([]),
      });

    // Fallback cover for books section when uploaded book covers are missing.
    this.http
      .get<{
        status?: string;
        data?: { trending?: Array<{ coverUrl: string | null }> };
      }>("/api/v1/books/manga/source/readcomicsonline/discover?limit=1")
      .subscribe({
        next: (res) => {
          const cover = res.data?.trending?.[0]?.coverUrl || null;
          this.booksFallbackCover.set(cover);
        },
        error: () => this.booksFallbackCover.set(null),
      });

    // Load music
    this.http
      .get<{
        success?: boolean;
        data?: {
          trending?: MusicVideoSummary[];
          newReleases?: MusicVideoSummary[];
          replayLoop?: MusicVideoSummary[];
          genreTakeover?: { videos?: MusicVideoSummary[] } | null;
        };
      }>("/api/v1/music/featured")
      .subscribe({
        next: (res) => {
          const sections = res.data || {};
          const merged = [
            ...(sections.trending || []),
            ...(sections.newReleases || []),
            ...(sections.replayLoop || []),
            ...(sections.genreTakeover?.videos || []),
          ];

          const uniqueById = Array.from(
            new Map(merged.map((item) => [item.id, item])).values(),
          );
          this.music.set(uniqueById);
        },
        error: () => this.music.set([]),
      });
  }

  private handleScroll() {
    const scrollTop = window.scrollY;
    const docHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? scrollTop / docHeight : 0;
    this.scrollProgress.set(progress);
  }

  async installPwa(target: InstallGuideTarget = "mobile") {
    if (!this.deferredPrompt) {
      this.openInstallGuide(target);
      return;
    }

    // Show the install prompt
    this.deferredPrompt.prompt();

    // Wait for the user to respond
    const { outcome } = await this.deferredPrompt.userChoice;

    if (outcome === "accepted") {
      this.installGuide.set({
        title: "Installed Successfully",
        steps: [
          "NaijasPride has been added to your device. Open it from your app list or home screen.",
        ],
      });
    } else {
      this.openInstallGuide(target);
    }

    // Clear the deferred prompt
    this.deferredPrompt = null;
    this.pwaInstallable.set(false);
  }

  private detectPlatform(): InstallPlatform {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    const isDesktop = !isIOS && !isAndroid;

    if (isIOS) return "ios";
    if (isAndroid) return "android";
    if (isDesktop) return "desktop";
    return "other";
  }

  openInstallGuide(target: InstallGuideTarget) {
    if (target === "tv") {
      this.installGuide.set({
        title: "Watch on TV",
        steps: [
          "Open your TV browser and go to naijaspride.com.",
          "Or cast from Chrome on desktop/mobile to your smart TV.",
          "Sign in with the same account to keep your library and progress synced.",
        ],
      });
      return;
    }

    if (target === "desktop") {
      this.installGuide.set({
        title: "Install on Desktop",
        steps: [
          "Open NaijasPride in Chrome or Edge.",
          "Click the install icon in the address bar.",
          'If no icon appears, open the browser menu and choose "Install App".',
        ],
      });
      return;
    }

    if (this.platform() === "ios") {
      this.installGuide.set({
        title: "Install on iPhone / iPad",
        steps: [
          "Open NaijasPride in Safari.",
          "Tap the Share button.",
          'Choose "Add to Home Screen", then tap "Add".',
        ],
      });
      return;
    }

    if (this.platform() === "android") {
      this.installGuide.set({
        title: "Install on Android",
        steps: [
          "Open NaijasPride in Chrome.",
          "Tap the 3-dot menu.",
          'Choose "Install App" or "Add to Home Screen".',
        ],
      });
      return;
    }

    this.installGuide.set({
      title: "Install NaijasPride",
      steps: [
        "Open NaijasPride in a supported browser (Chrome, Edge, or Safari).",
        'Look for "Install App" or "Add to Home Screen" in your browser menu.',
        "Pin the app for faster access and full-screen playback.",
      ],
    });
  }

  async enablePushNotifications() {
    try {
      const token = await this.firebaseMessaging.requestPermissionAndGetToken();
      if (token) {
        try {
          await firstValueFrom(
            this.http.post("/api/v1/profile/push-tokens", {
              token,
              platform: this.platform(),
              deviceLabel:
                this.platform() === "desktop"
                  ? "Desktop Browser"
                  : "Mobile Browser",
            }),
          );
          this.pushStatus.set(
            "Notifications enabled and linked to your account.",
          );
        } catch (error) {
          if (error instanceof HttpErrorResponse && error.status === 401) {
            this.pushStatus.set(
              "Notifications are enabled, but sign in to link this device to your account.",
            );
            return;
          }
          this.pushStatus.set(
            "Notifications enabled locally, but we could not sync this device right now.",
          );
        }
        return;
      }

      if (this.firebaseMessaging.notificationPermission() === "denied") {
        this.pushStatus.set(
          "Notifications are blocked in your browser settings. Allow notifications and try again.",
        );
        return;
      }

      this.pushStatus.set(
        "Notifications were not enabled yet. Please try again on a supported browser.",
      );
    } catch {
      this.pushStatus.set(
        "Could not enable notifications on this browser right now.",
      );
    }
  }
}
