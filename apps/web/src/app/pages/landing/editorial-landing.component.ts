import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, OnDestroy, inject, signal, computed, AfterViewInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MovieSummary, BookSummary, MusicVideoSummary } from '@naijaspride/types';

type LandingPhase = 'glitch' | 'dissolve' | 'hero' | 'archive';

interface ArchiveSection {
  id: string;
  number: string;
  type: string;
  title: string;
  titleAccent: string;
  description: string;
  image: string;
  align: 'left' | 'right';
  link: string;
  features: { label: string; value: string }[];
}

@Component({
  selector: 'app-editorial-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="relative min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-x-hidden"
         style="font-family: 'Plus Jakarta Sans', sans-serif;">
      
      <!-- PHASE 1-3: Opening Animation (Glitch → Dissolve → Hero) -->
      @if (phase() !== 'archive') {
        <section class="fixed inset-0 z-40 flex flex-col justify-center items-center bg-[var(--bg-primary)]"
                 [class.opacity-0]="phase() === 'dissolve'"
                 [class.transition-opacity]="phase() === 'dissolve'"
                 [class.duration-700]="phase() === 'dissolve'">
          
          <!-- Skip Button -->
          @if (phase() === 'glitch') {
            <button 
              (click)="skipAnimation()"
              class="absolute top-8 right-8 text-[10px] tracking-[0.3em] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors uppercase">
              Skip Intro
            </button>
          }

          <!-- Brand Reveal -->
          <div class="text-center">
            <h1 class="font-serif text-[12vw] md:text-[10vw] leading-[0.85] tracking-tight">
              @for (char of brandChars; track $index) {
                <span [class.text-[#8a1c1c]]="$index < burgundyCount"
                      [class.text-[var(--text-primary)]]="$index >= burgundyCount"
                      [class.opacity-0]="$index >= revealedChars()"
                      [class.animate-pulse]="$index === revealedChars() - 1 && phase() === 'glitch'">
                  {{ char }}
                </span>
              }
            </h1>
            
            @if (revealedChars() >= brandName.length) {
              <p class="mt-6 text-[10px] md:text-xs tracking-[0.5em] text-[#8a1c1c] font-bold animate-fade-in">
                COMICS • MOVIES • MUSIC
              </p>
            }
          </div>

          <!-- Location Pills -->
          @if (revealedChars() >= brandName.length && phase() === 'glitch') {
              <div class="absolute bottom-24 flex gap-8 text-[10px] tracking-widest text-[var(--text-muted)]">
                <div class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 bg-[#8a1c1c] rounded-full animate-pulse"></div>
                  <span>LAGOS</span>
              </div>
              <span class="opacity-30">•</span>
              <span>LONDON</span>
              <span class="opacity-30">•</span>
              <span>NEW YORK</span>
            </div>
          }

          <!-- Scroll Indicator -->
          @if (phase() === 'hero') {
            <div class="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 animate-fade-in">
              <span class="text-[10px] tracking-[0.3em] text-[var(--text-muted)]">SCROLL TO EXPLORE</span>
              <div class="w-[1px] h-16 bg-[var(--border-color)] overflow-hidden">
                <div class="w-full h-full bg-[#8a1c1c] animate-scroll-line"></div>
              </div>
            </div>
          }
        </section>
      }

      <!-- PHASE 4: Editorial Archive Content -->
      @if (phase() === 'archive') {
        <div class="animate-fade-in-slow">
          
          <!-- Hero Section -->
          <section class="h-screen relative flex flex-col justify-center items-center overflow-hidden">
            <!-- Deep black hero background for readability -->
            <div class="absolute inset-0 z-0 bg-[var(--bg-primary)]"></div>
            <div class="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,rgba(138,28,28,0.2),transparent_55%)]"></div>

            <div class="relative z-10 text-center px-4">
              <h1 class="font-display text-[11vw] md:text-[5vw] leading-none text-[var(--text-primary)] tracking-[0.22em] md:tracking-[0.35em] pr-[0.22em] md:pr-[0.35em] uppercase whitespace-nowrap">
                NAIJAsPRIDE
              </h1>
              <p class="mt-8 text-[10px] md:text-xs tracking-[0.35em] text-[var(--text-secondary)] font-bold uppercase">
                COMICS • MOVIES • MUSIC
              </p>
            </div>
          </section>

          <!-- Archive Sections -->
          @for (section of archiveSections(); track section.id) {
            <section class="min-h-screen relative flex items-center py-24 border-b border-[var(--border-color)] overflow-hidden"
                     [class.scroll-triggered]="scrollProgress() > 0.1 * ($index + 1)">
              
              <div class="absolute inset-0 z-0">
                <div class="absolute top-0 w-1/2 h-full"
                     [class.left-0]="section.align === 'right'"
                     [class.right-0]="section.align === 'left'"
                     [class.bg-gradient-to-r]="section.align === 'right'"
                     [class.bg-gradient-to-l]="section.align === 'left'"
                     style="background: linear-gradient(to right, rgba(56, 4, 4, 0.05), transparent);"></div>
              </div>

              <div class="container mx-auto px-6 md:px-12 relative z-10 flex flex-col md:flex-row gap-16 md:gap-24 items-center"
                   [class.md:flex-row-reverse]="section.align === 'right'">
                
                <!-- Visual Side -->
                <div class="w-full md:w-1/2 group cursor-pointer relative" [routerLink]="[section.link]">
                  <div class="relative aspect-[3/4] bg-[var(--bg-elevated)] overflow-hidden"
                       [class.clip-diag-right]="section.align === 'left'"
                       [class.clip-diag-left]="section.align === 'right'">
                    
                    <img 
                      [src]="section.image"
                      [alt]="section.title"
                      class="w-full h-full object-cover opacity-60 grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700 ease-out"
                    />
                    
                    <div class="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors duration-500"></div>
                    
                    <!-- Overlay Details -->
                    <div class="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex justify-between items-end">
                      <span class="text-[10px] tracking-widest text-[#8a1c1c] font-bold">START EXPLORING</span>
                      <div class="w-10 h-10 bg-[#8a1c1c] flex items-center justify-center text-black">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M7 17L17 7M17 7H7M17 7V17"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Floating Label -->
                   <div class="absolute -top-6 bg-white/80 dark:bg-[rgba(10,10,10,0.6)] backdrop-blur-sm border border-black/10 dark:border-white/5 px-6 py-3 border-l-2 border-[#8a1c1c] z-20"
                        [class.-left-6]="section.align === 'right'"
                        [class.-right-6]="section.align === 'left'">
                    <span class="text-xs font-bold tracking-[0.3em] text-[var(--text-primary)]">{{ section.type }}</span>
                  </div>
                </div>

                <!-- Text Side -->
                <div class="w-full md:w-1/2 space-y-8">
                  <div class="flex flex-col">
                    <span class="font-display text-8xl text-[var(--border-color)] font-bold leading-none mb-4 select-none"
                          style="-webkit-text-stroke: 1px rgba(100, 100, 100, 0.3); color: transparent;">
                      {{ section.number }}
                    </span>
                    
                    <h2 class="font-serif text-4xl md:text-6xl lg:text-7xl text-[var(--text-primary)] leading-[0.9] uppercase">
                      {{ section.title }} <br/>
                      <span class="italic text-[#8a1c1c] opacity-80 normal-case">{{ section.titleAccent }}</span>
                    </h2>
                  </div>

                  <p class="font-sans text-sm md:text-base text-[var(--text-secondary)] opacity-80 leading-relaxed max-w-md border-l border-[var(--border-color)] pl-6">
                    {{ section.description }}
                  </p>

                  <!-- Tech Specs Grid -->
                  <div class="grid grid-cols-2 gap-y-4 gap-x-8 py-6 border-t border-[var(--border-color)] w-full max-w-md">
                    @for (feature of section.features; track feature.label) {
                      <div class="flex flex-col">
                        <span class="text-[8px] tracking-widest text-[#8a1c1c] opacity-80 mb-1">{{ feature.label }}</span>
                        <span class="font-sans text-xs tracking-wider text-[var(--text-primary)]">{{ feature.value }}</span>
                      </div>
                    }
                  </div>

                  <a [routerLink]="[section.link]" class="inline-block">
                    <button class="flex items-center gap-4 text-xs tracking-[0.2em] text-[var(--text-primary)] hover:text-[#8a1c1c] transition-colors group">
                      ENTER SECTION
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                           class="group-hover:translate-x-2 transition-transform">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </button>
                  </a>
                </div>
              </div>
            </section>
          }

          <!-- Device Showcase Section -->
          <section class="py-32 px-6 md:px-12 bg-[var(--bg-primary)] border-b border-[var(--border-color)]">
            <div class="max-w-7xl mx-auto">
              <div class="mb-24 text-center">
                <span class="text-[10px] tracking-[0.4em] text-[#8a1c1c] font-bold block mb-4">COMPATIBILITY</span>
                <h2 class="font-serif text-4xl md:text-6xl text-[var(--text-primary)] mb-6">AVAILABLE EVERYWHERE</h2>
                <p class="font-sans text-sm text-[var(--text-secondary)] max-w-xl mx-auto">
                  Your library travels with you. Seamless synchronization across all your devices.
                </p>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10 max-w-5xl mx-auto">
                <!-- Mobile -->
                <div class="flex flex-col items-center gap-4">
                  <div class="w-full h-[320px] border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-xl flex items-center justify-center relative overflow-hidden hover:border-[#8a1c1c] transition-colors">
                    <img src="assets/images/mobile-phone.png" alt="Mobile app" class="w-full h-full object-contain p-6" loading="lazy" />
                  </div>
                  <span class="text-[10px] tracking-[0.2em] text-[var(--text-secondary)]">MOBILE</span>
                </div>

                <!-- Desktop -->
                <div class="flex flex-col items-center gap-4">
                  <div class="w-full h-[320px] border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-xl flex items-center justify-center relative overflow-hidden hover:border-[#8a1c1c] transition-colors">
                    <img src="assets/images/laptop-device.png" alt="Desktop app" class="w-full h-full object-contain p-6" loading="lazy" />
                  </div>
                  <span class="text-[10px] tracking-[0.2em] text-[var(--text-secondary)]">DESKTOP</span>
                </div>

                <!-- TV -->
                <div class="flex flex-col items-center gap-4">
                  <div class="w-full h-[320px] border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-xl flex items-center justify-center relative overflow-hidden hover:border-[#8a1c1c] transition-colors">
                    <img src="assets/images/tv-device.png" alt="TV app" class="w-full h-full object-contain p-6" loading="lazy" />
                  </div>
                  <span class="text-[10px] tracking-[0.2em] text-[var(--text-secondary)]">TV</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Pricing Section -->
          <section class="py-32 px-6 md:px-12 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
            <div class="max-w-7xl mx-auto flex flex-col md:flex-row gap-16 items-start">
              <div class="md:w-1/3">
                <span class="text-[10px] tracking-[0.4em] text-[#8a1c1c] font-bold block mb-4">MEMBERSHIP</span>
                <h2 class="font-serif text-4xl md:text-5xl text-[var(--text-primary)] leading-tight mb-6 uppercase">
                  UNLOCK THE <br/> <span class="italic opacity-50 normal-case">Full Archive</span>
                </h2>
                <p class="font-sans text-sm text-[var(--text-secondary)] leading-relaxed mb-8">
                  Join the community. Support independent creators and decentralized streaming.
                </p>
              </div>

              <div class="md:w-2/3 grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                <!-- Free Tier -->
                <div class="border border-[var(--border-color)] p-8 bg-[var(--bg-primary)] hover:border-[var(--text-primary)] transition-colors group">
                  <div class="mb-8">
                    <span class="text-xs tracking-widest opacity-60">GUEST</span>
                    <h3 class="font-serif text-4xl mt-2">Free</h3>
                    <p class="text-[10px] tracking-widest mt-2 opacity-40">AD-SUPPORTED ACCESS</p>
                  </div>
                  <ul class="space-y-4 mb-8">
                    @for (item of ['Standard Definition', 'Limited Catalog', 'Community Read-Only']; track $index) {
                      <li class="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        {{ item }}
                      </li>
                    }
                  </ul>
                  <button 
                    [routerLink]="['/register']"
                    class="w-full py-4 border border-[var(--border-color)] text-[10px] tracking-[0.2em] uppercase hover:bg-[var(--bg-elevated)] transition-colors">
                    Start Free
                  </button>
                </div>

                <!-- Premium Tier -->
                <div class="border border-[#8a1c1c] p-8 bg-[var(--bg-elevated)] relative overflow-hidden">
                  <div class="absolute top-0 right-0 bg-[#8a1c1c] px-3 py-1">
                    <span class="text-[8px] tracking-widest text-black font-bold">RECOMMENDED</span>
                  </div>
                  <div class="mb-8">
                    <span class="text-xs tracking-widest text-[#8a1c1c]">MEMBER</span>
                    <h3 class="font-serif text-4xl mt-2 text-[var(--text-primary)]">₦1,000<span class="text-sm opacity-50">/mo</span></h3>
                    <p class="text-[10px] tracking-widest mt-2 opacity-60">FULL ACCESS</p>
                  </div>
                  <ul class="space-y-4 mb-8">
                    @for (item of ['4K HDR Streaming', 'Offline Downloads', 'Exclusive Drops', 'Ad-Free Experience']; track $index) {
                      <li class="flex items-center gap-3 text-xs text-[var(--text-primary)]">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[#8a1c1c]">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        {{ item }}
                      </li>
                    }
                  </ul>
                  <button 
                    [routerLink]="['/premium']"
                    class="w-full py-4 bg-[#8a1c1c] text-black font-bold text-[10px] tracking-[0.2em] uppercase hover:bg-[var(--text-primary)] transition-colors">
                    Join Now
                  </button>
                </div>
              </div>
            </div>
          </section>

          @if (pwaInstallable()) {
            <div class="fixed right-4 bottom-4 z-30">
              <button (click)="installPwa()"
                class="flex items-center gap-2 px-4 py-2 border border-[#8a1c1c] bg-white/85 dark:bg-black/70 text-[10px] tracking-widest hover:bg-[#8a1c1c] hover:text-black transition-all">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                INSTALL APP
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .font-display {
      font-family: 'Cinzel', serif;
    }

    .font-serif {
      font-family: 'Cormorant Garamond', serif;
    }

    .font-sans {
      font-family: 'Plus Jakarta Sans', sans-serif;
    }

    .clip-diag-right {
      clip-path: polygon(10% 0, 100% 0, 100% 100%, 0 100%, 0 10%);
    }

    .clip-diag-left {
      clip-path: polygon(0 0, 90% 0, 100% 10%, 100% 100%, 0 100%);
    }

    @keyframes fade-in {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes fade-in-slow {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes scroll-line {
      0% { transform: translateY(-100%); }
      100% { transform: translateY(100%); }
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
  `]
})
export class EditorialLandingComponent implements OnInit, OnDestroy, AfterViewInit {
  private http = inject(HttpClient);
  private readonly onScroll = this.handleScroll.bind(this);

  // Animation state
  phase = signal<LandingPhase>('glitch');
  readonly brandName = 'NAIJAsPRIDE';
  readonly burgundyCount = 6;
  revealedChars = signal(0);
  private timers: ReturnType<typeof setTimeout>[] = [];
  scrollProgress = signal(0);

  // Data
  movies = signal<MovieSummary[]>([]);
  books = signal<BookSummary[]>([]);
  music = signal<MusicVideoSummary[]>([]);

  // PWA Install
  private deferredPrompt: any = null;
  pwaInstallable = signal(false);

  // Computed
  brandChars = this.brandName.split('');

  archiveSections = computed<ArchiveSection[]>(() => [
    {
      id: 'books',
      number: '01',
      type: 'READ',
      title: 'COMICS &',
      titleAccent: 'Manga',
      description: 'Immerse yourself in sequential art. From the neon-lit streets of cyberpunk Lagos to the ancient whispers of traditional folklore.',
      image: this.books()[0]?.coverUrl || 'https://images.unsplash.com/photo-1614726365723-49cfae967a57?q=80&w=1200&auto=format&fit=crop',
      align: 'left',
      link: '/books',
      features: [
        { label: 'FORMATS', value: 'Webtoon, PDF, CBR' },
        { label: 'GENRES', value: 'Sci-Fi, Fantasy' },
        { label: 'UPDATES', value: 'Weekly Chapters' }
      ]
    },
    {
      id: 'movies',
      number: '02',
      type: 'WATCH',
      title: 'MOVIES &',
      titleAccent: 'TV',
      description: 'A decentralized catalog of Nollywood Noir and Global Black Cinema. High-fidelity streaming powered by P2P protocols.',
      image: this.movies()[0]?.backdropUrl || this.movies()[0]?.posterUrl || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1200&auto=format&fit=crop',
      align: 'right',
      link: '/movies',
      features: [
        { label: 'QUALITY', value: '4K HDR10+ / Remux' },
        { label: 'AUDIO', value: 'Dolby Atmos / 5.1' },
        { label: 'ACCESS', value: 'Magnet / Stream' }
      ]
    },
    {
      id: 'music',
      number: '03',
      type: 'LISTEN',
      title: 'MUSIC &',
      titleAccent: 'Videos',
      description: 'Curated visual albums and high-fidelity audio. Experience the heartbeat of the culture through curated playlists.',
      image: this.music()[0]?.thumbnailUrl || 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=1200&auto=format&fit=crop',
      align: 'left',
      link: '/music',
      features: [
        { label: 'GENRES', value: 'Afrobeats, Alté' },
        { label: 'MEDIA', value: 'Music Video, FLAC' },
        { label: 'CURATION', value: 'Hand-Picked' }
      ]
    }
  ]);

  currentDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: '2-digit',
    timeZone: 'Africa/Lagos'
  }) + ' WAT';

  ngOnInit() {
    // Check reduced motion preference
    const prefersReduced = typeof window !== 'undefined' && 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      this.revealedChars.set(this.brandName.length);
      this.phase.set('archive');
    } else {
      this.startSequence();
    }

    // Load data
    this.loadData();

    // Setup PWA install listener
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent the mini-infobar from appearing on mobile
        e.preventDefault();
        // Store the event for later use
        this.deferredPrompt = e;
        // Show install button
        this.pwaInstallable.set(true);
      });

      // Listen for app installed event
      window.addEventListener('appinstalled', () => {
        this.pwaInstallable.set(false);
        this.deferredPrompt = null;
        console.log('PWA was installed');
      });
    }
  }

  ngAfterViewInit() {
    // Setup scroll listener for archive phase
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', this.onScroll, { passive: true });
    }
  }

  ngOnDestroy() {
    this.timers.forEach(clearTimeout);
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.onScroll);
    }
  }

  private startSequence() {
    const charDelay = 180;
    const holdTime = 600;
    const dissolveTime = 700;

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
      this.phase.set('dissolve');
    }, dissolveStart);
    this.timers.push(t2);

    // Phase 3: Brief hero pause
    const heroStart = dissolveStart + dissolveTime;
    const t3 = setTimeout(() => {
      this.phase.set('hero');
    }, heroStart);
    this.timers.push(t3);

    // Phase 4: Archive content
    const archiveStart = heroStart + 800;
    const t4 = setTimeout(() => {
      this.phase.set('archive');
    }, archiveStart);
    this.timers.push(t4);
  }

  skipAnimation() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.revealedChars.set(this.brandName.length);
    this.phase.set('archive');
  }

  private loadData() {
    // Load movies
    this.http.get<{ success?: boolean; data?: MovieSummary[] }>('/api/v1/movies', {
      params: { limit: '6', sortBy: 'latest' }
    }).subscribe({
      next: (res) => {
        const movies = Array.isArray(res.data) ? res.data : [];
        this.movies.set(movies);
      },
      error: () => this.movies.set([])
    });

    // Load books
    this.http.get<{ success?: boolean; data?: BookSummary[] }>('/api/v1/books', {
      params: { limit: '6', sortBy: 'latest' }
    }).subscribe({
      next: (res) => {
        const books = Array.isArray(res.data) ? res.data : [];
        this.books.set(books);
      },
      error: () => this.books.set([])
    });

    // Load music
    this.http.get<{ success?: boolean; data?: MusicVideoSummary[] }>('/api/v1/music/featured').subscribe({
      next: (res) => {
        const music = Array.isArray(res.data) ? res.data : [];
        this.music.set(music);
      },
      error: () => this.music.set([])
    });
  }

  private handleScroll() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? scrollTop / docHeight : 0;
    this.scrollProgress.set(progress);
  }

  async installPwa() {
    if (!this.deferredPrompt) {
      // If no deferred prompt, show manual instructions
      this.showInstallInstructions();
      return;
    }

    // Show the install prompt
    this.deferredPrompt.prompt();

    // Wait for the user to respond
    const { outcome } = await this.deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }

    // Clear the deferred prompt
    this.deferredPrompt = null;
    this.pwaInstallable.set(false);
  }

  private showInstallInstructions() {
    // Detect platform and show appropriate instructions
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
    const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua);

    let message = '';
    if (isIOS && isSafari) {
      message = 'To install on iOS:\n1. Tap the Share button\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add"';
    } else if (isAndroid && isChrome) {
      message = 'To install on Android:\n1. Tap the menu (3 dots)\n2. Tap "Add to Home Screen" or "Install App"\n3. Follow the prompts';
    } else if (isChrome) {
      message = 'To install on desktop:\n1. Click the install icon in the address bar\n2. Or click menu (3 dots) > "Install NaijasPride"';
    } else {
      message = 'To install:\nCheck your browser menu for "Add to Home Screen" or "Install App" option';
    }

    alert(message);
  }
}
