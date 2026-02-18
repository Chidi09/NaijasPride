import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, OnDestroy, inject, signal, computed, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MovieSummary, BookSummary, MusicVideoSummary } from '@naijaspride/types';
import { MusicPlayerService } from '../../features/music/services/music-player.service';

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
    <div class="relative min-h-screen bg-[#020202] text-[#dcdcdc] overflow-x-hidden"
         style="font-family: 'Plus Jakarta Sans', sans-serif;">
      
      <!-- Grain Overlay -->
      <div class="fixed inset-0 pointer-events-none z-50 opacity-[0.08]"
           style="background-image: url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E');">
      </div>

      <!-- PHASE 1-3: Opening Animation (Glitch → Dissolve → Hero) -->
      @if (phase() !== 'archive') {
        <section class="fixed inset-0 z-40 flex flex-col justify-center items-center bg-[#020202]"
                 [class.opacity-0]="phase() === 'dissolve'"
                 [class.transition-opacity]="phase() === 'dissolve'"
                 [class.duration-700]="phase() === 'dissolve'">
          
          <!-- Skip Button -->
          @if (phase() === 'glitch') {
            <button 
              (click)="skipAnimation()"
              class="absolute top-8 right-8 text-[10px] tracking-[0.3em] text-[#dcdcdc]/40 hover:text-[#dcdcdc] transition-colors uppercase">
              Skip Intro
            </button>
          }

          <!-- Brand Reveal -->
          <div class="text-center">
            <h1 class="font-serif text-[12vw] md:text-[10vw] leading-[0.85] tracking-tight">
              @for (char of brandChars; track $index) {
                <span [class.text-[#8a1c1c]]="$index < burgundyCount"
                      [class.text-[#dcdcdc]]="$index >= burgundyCount"
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
            <div class="absolute bottom-24 flex gap-8 text-[10px] tracking-widest text-[#dcdcdc]/50">
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
              <span class="text-[10px] tracking-[0.3em] text-[#dcdcdc]/40">SCROLL TO EXPLORE</span>
              <div class="w-[1px] h-16 bg-[#1a1a1a] overflow-hidden">
                <div class="w-full h-full bg-[#8a1c1c] animate-scroll-line"></div>
              </div>
            </div>
          }
        </section>
      }

      <!-- PHASE 4: Editorial Archive Content -->
      @if (phase() === 'archive') {
        <div class="animate-fade-in-slow">
          
          <!-- Navigation -->
          <nav class="fixed top-0 left-0 w-full px-6 md:px-8 py-6 flex justify-between items-center z-40 mix-blend-difference border-b border-white/5 bg-black/50 backdrop-blur-sm">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 border border-[#bfb29e] flex items-center justify-center relative group overflow-hidden cursor-pointer"
                   [routerLink]="['/']">
                <div class="absolute inset-0 bg-[#bfb29e] translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                <span class="font-serif text-2xl font-bold relative z-10 group-hover:text-black">N</span>
              </div>
              <div class="hidden md:flex flex-col">
                <span class="text-[10px] tracking-[0.3em] font-bold text-[#bfb29e]">NAIJASPRIDE</span>
                <span class="text-[8px] tracking-widest opacity-50">EST. MMXXVI</span>
              </div>
            </div>
            
            <div class="hidden md:flex gap-12 text-[10px] tracking-[0.2em] font-bold text-[#bfb29e]">
              <a routerLink="/books" class="cursor-pointer hover:text-white transition-colors opacity-60 hover:opacity-100">COMICS</a>
              <a routerLink="/movies" class="cursor-pointer hover:text-white transition-colors opacity-60 hover:opacity-100">MOVIES</a>
              <a routerLink="/music" class="cursor-pointer hover:text-white transition-colors opacity-60 hover:opacity-100">MUSIC</a>
            </div>

            <button class="flex items-center gap-3 group text-[#bfb29e]" (click)="scrollToFooter()">
              <span class="text-[10px] tracking-widest group-hover:opacity-100 opacity-60 transition-opacity">MENU</span>
              <div class="flex flex-col gap-1.5">
                <div class="w-8 h-[1px] bg-[#bfb29e] group-hover:w-6 transition-all"></div>
                <div class="w-8 h-[1px] bg-[#bfb29e] group-hover:w-4 transition-all ml-auto"></div>
              </div>
            </button>
          </nav>

          <!-- Hero Section -->
          <section class="h-screen relative flex flex-col justify-center items-center overflow-hidden" #heroSection>
            <!-- Background -->
            <div class="absolute inset-0 z-0">
              <img 
                [src]="heroBackdrop() || 'https://images.unsplash.com/photo-1620641788421-7a1c3724c07c?q=80&w=2000&auto=format&fit=crop'"
                class="w-full h-full object-cover opacity-20 grayscale brightness-50"
                alt="Texture"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-[#020202] via-transparent to-[#020202]"></div>
              <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#020202_100%)]"></div>
            </div>

            <div class="relative z-10 text-center px-4">
              <h2 class="text-[10px] md:text-xs tracking-[0.5em] text-[#8a1c1c] mb-4 font-bold uppercase">
                Comics • Movies • Music
              </h2>
              <h1 class="font-display text-[18vw] md:text-[15vw] leading-[0.8] text-[#bfb29e] mix-blend-overlay">
                NAIJAS
              </h1>
              <div class="flex items-center justify-center gap-4 -mt-2 md:-mt-8">
                <h1 class="font-serif text-[18vw] md:text-[15vw] leading-[0.8] text-[#380404] italic brightness-150">
                  PRIDE
                </h1>
              </div>
              
              <p class="mt-8 text-xs md:text-sm tracking-widest text-[#dcdcdc] opacity-60 max-w-lg mx-auto leading-relaxed">
                The premier archive for African digital culture. <br/> 
                Read, Watch, and Listen in one place.
              </p>
            </div>

            <div class="absolute bottom-12 left-0 w-full flex justify-center z-20">
              <div class="flex flex-col gap-2 items-center">
                <span class="text-[10px] tracking-widest text-[#bfb29e] opacity-40">SCROLL TO EXPLORE</span>
                <div class="h-16 w-[1px] bg-[#1a1a1a] overflow-hidden">
                  <div class="h-full w-full bg-[#8a1c1c] animate-scroll-line"></div>
                </div>
              </div>
            </div>
          </section>

          <!-- Archive Sections -->
          @for (section of archiveSections(); track section.id) {
            <section class="min-h-screen relative flex items-center py-24 border-b border-[#1a1a1a] overflow-hidden"
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
                  <div class="relative aspect-[3/4] bg-[#1a1a1a] overflow-hidden"
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
                  <div class="absolute -top-6 bg-[rgba(10,10,10,0.6)] backdrop-blur-sm border border-white/5 px-6 py-3 border-l-2 border-[#8a1c1c] z-20"
                       [class.-left-6]="section.align === 'right'"
                       [class.-right-6]="section.align === 'left'">
                    <span class="text-xs font-bold tracking-[0.3em] text-[#dcdcdc]">{{ section.type }}</span>
                  </div>
                </div>

                <!-- Text Side -->
                <div class="w-full md:w-1/2 space-y-8">
                  <div class="flex flex-col">
                    <span class="font-display text-8xl text-[#1a1a1a] font-bold leading-none mb-4 select-none"
                          style="-webkit-text-stroke: 1px rgba(100, 100, 100, 0.3); color: transparent;">
                      {{ section.number }}
                    </span>
                    
                    <h2 class="font-serif text-4xl md:text-6xl lg:text-7xl text-[#dcdcdc] leading-[0.9] uppercase">
                      {{ section.title }} <br/>
                      <span class="italic text-[#8a1c1c] opacity-80 normal-case">{{ section.titleAccent }}</span>
                    </h2>
                  </div>

                  <p class="font-sans text-sm md:text-base text-[#bfb29e] opacity-70 leading-relaxed max-w-md border-l border-[#1a1a1a] pl-6">
                    {{ section.description }}
                  </p>

                  <!-- Tech Specs Grid -->
                  <div class="grid grid-cols-2 gap-y-4 gap-x-8 py-6 border-t border-[#1a1a1a] w-full max-w-md">
                    @for (feature of section.features; track feature.label) {
                      <div class="flex flex-col">
                        <span class="text-[8px] tracking-widest text-[#8a1c1c] opacity-80 mb-1">{{ feature.label }}</span>
                        <span class="font-sans text-xs tracking-wider text-[#dcdcdc]">{{ feature.value }}</span>
                      </div>
                    }
                  </div>

                  <a [routerLink]="[section.link]" class="inline-block">
                    <button class="flex items-center gap-4 text-xs tracking-[0.2em] text-[#dcdcdc] hover:text-[#8a1c1c] transition-colors group">
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
          <section class="py-32 px-6 md:px-12 bg-[#020202] border-b border-[#1a1a1a]">
            <div class="max-w-7xl mx-auto">
              <div class="mb-24 text-center">
                <span class="text-[10px] tracking-[0.4em] text-[#8a1c1c] font-bold block mb-4">COMPATIBILITY</span>
                <h2 class="font-serif text-4xl md:text-6xl text-[#dcdcdc] mb-6">AVAILABLE EVERYWHERE</h2>
                <p class="font-sans text-sm opacity-50 max-w-xl mx-auto">
                  Your library travels with you. Seamless synchronization across all your devices.
                </p>
              </div>

              <div class="flex flex-wrap justify-center items-end gap-12 md:gap-24 opacity-80">
                <!-- Mobile -->
                <div class="flex flex-col items-center gap-6">
                  <div class="w-[120px] h-[240px] border border-[#1a1a1a] bg-[#0a0a0a] rounded-2xl flex items-center justify-center relative overflow-hidden group hover:border-[#8a1c1c] transition-colors">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-[#dcdcdc] opacity-50 group-hover:opacity-100 transition-opacity">
                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                      <line x1="12" y1="18" x2="12" y2="18"/>
                    </svg>
                    <div class="absolute top-4 w-8 h-1 bg-[#1a1a1a] rounded-full"></div>
                  </div>
                  <span class="text-[10px] tracking-widest">MOBILE</span>
                </div>

                <!-- Tablet -->
                <div class="flex flex-col items-center gap-6">
                  <div class="w-[200px] h-[260px] border border-[#1a1a1a] bg-[#0a0a0a] rounded-xl flex items-center justify-center relative overflow-hidden group hover:border-[#8a1c1c] transition-colors">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-[#dcdcdc] opacity-50 group-hover:opacity-100 transition-opacity">
                      <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
                      <line x1="12" y1="18" x2="12" y2="18"/>
                    </svg>
                  </div>
                  <span class="text-[10px] tracking-widest">TABLET</span>
                </div>

                <!-- TV/Desktop -->
                <div class="flex flex-col items-center gap-6">
                  <div class="w-[320px] h-[200px] border border-[#1a1a1a] bg-[#0a0a0a] rounded-lg flex items-center justify-center relative overflow-hidden group hover:border-[#8a1c1c] transition-colors">
                    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-[#dcdcdc] opacity-50 group-hover:opacity-100 transition-opacity">
                      <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/>
                      <polyline points="17 2 12 7 7 2"/>
                    </svg>
                    <div class="absolute bottom-[-10px] w-24 h-2 bg-[#1a1a1a]"></div>
                  </div>
                  <span class="text-[10px] tracking-widest">TV & DESKTOP</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Pricing Section -->
          <section class="py-32 px-6 md:px-12 bg-[#0a0a0a] border-b border-[#1a1a1a]">
            <div class="max-w-7xl mx-auto flex flex-col md:flex-row gap-16 items-start">
              <div class="md:w-1/3">
                <span class="text-[10px] tracking-[0.4em] text-[#8a1c1c] font-bold block mb-4">MEMBERSHIP</span>
                <h2 class="font-serif text-4xl md:text-5xl text-[#dcdcdc] leading-tight mb-6 uppercase">
                  UNLOCK THE <br/> <span class="italic opacity-50 normal-case">Full Archive</span>
                </h2>
                <p class="font-sans text-sm opacity-50 leading-relaxed mb-8">
                  Join the community. Support independent creators and decentralized streaming.
                </p>
              </div>

              <div class="md:w-2/3 grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                <!-- Free Tier -->
                <div class="border border-[#1a1a1a] p-8 bg-[#020202] hover:border-[#dcdcdc] transition-colors group">
                  <div class="mb-8">
                    <span class="text-xs tracking-widest opacity-60">GUEST</span>
                    <h3 class="font-serif text-4xl mt-2">Free</h3>
                    <p class="text-[10px] tracking-widest mt-2 opacity-40">AD-SUPPORTED ACCESS</p>
                  </div>
                  <ul class="space-y-4 mb-8">
                    @for (item of ['Standard Definition', 'Limited Catalog', 'Community Read-Only']; track $index) {
                      <li class="flex items-center gap-3 text-xs opacity-60">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        {{ item }}
                      </li>
                    }
                  </ul>
                  <button 
                    [routerLink]="['/register']"
                    class="w-full py-4 border border-[#1a1a1a] text-[10px] tracking-[0.2em] uppercase hover:bg-[#1a1a1a] transition-colors">
                    Start Free
                  </button>
                </div>

                <!-- Premium Tier -->
                <div class="border border-[#8a1c1c] p-8 bg-[#1a1a1a] relative overflow-hidden">
                  <div class="absolute top-0 right-0 bg-[#8a1c1c] px-3 py-1">
                    <span class="text-[8px] tracking-widest text-black font-bold">RECOMMENDED</span>
                  </div>
                  <div class="mb-8">
                    <span class="text-xs tracking-widest text-[#8a1c1c]">MEMBER</span>
                    <h3 class="font-serif text-4xl mt-2 text-[#dcdcdc]">₦1,000<span class="text-sm opacity-50">/mo</span></h3>
                    <p class="text-[10px] tracking-widest mt-2 opacity-60">FULL ACCESS</p>
                  </div>
                  <ul class="space-y-4 mb-8">
                    @for (item of ['4K HDR Streaming', 'Offline Downloads', 'Exclusive Drops', 'Ad-Free Experience']; track $index) {
                      <li class="flex items-center gap-3 text-xs text-[#dcdcdc]">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[#8a1c1c]">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        {{ item }}
                      </li>
                    }
                  </ul>
                  <button 
                    [routerLink]="['/premium']"
                    class="w-full py-4 bg-[#8a1c1c] text-black font-bold text-[10px] tracking-[0.2em] uppercase hover:bg-[#dcdcdc] transition-colors">
                    Join Now
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- Editorial Footer - Corporate/Legal -->
          <footer class="bg-[#020202] pt-24 pb-12 px-8 relative overflow-hidden border-t border-[#1a1a1a]" #footerSection>
            
            <div class="max-w-7xl mx-auto">
              <!-- Top Section: Brand + Social -->
              <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 pb-16 border-b border-[#1a1a1a]">
                <div>
                  <h2 class="font-display text-4xl md:text-6xl text-[#dcdcdc] mb-2">
                    NAIJAS<span class="text-[#590d0d]">PRIDE</span>
                  </h2>
                  <p class="font-sans text-xs tracking-[0.3em] text-[#bfb29e] opacity-50">
                    THE CULTURE CAPITAL
                  </p>
                </div>
                
                <div class="flex gap-8 mt-8 md:mt-0">
                  <a href="https://youtube.com" target="_blank" rel="noopener" 
                     class="text-xs tracking-widest border-b border-transparent hover:border-[#8a1c1c] hover:text-[#8a1c1c] transition-all pb-1">
                    YOUTUBE
                  </a>
                  <a href="#" class="text-xs tracking-widest border-b border-transparent hover:border-[#8a1c1c] hover:text-[#8a1c1c] transition-all pb-1">
                    APPLE MUSIC
                  </a>
                  <a href="#" class="text-xs tracking-widest border-b border-transparent hover:border-[#8a1c1c] hover:text-[#8a1c1c] transition-all pb-1">
                    SPOTIFY
                  </a>
                </div>
              </div>

              <!-- Middle Section: Links Grid -->
              <div class="grid grid-cols-2 md:grid-cols-4 gap-12 mb-16">
                <!-- Content -->
                <div class="flex flex-col gap-4">
                  <span class="font-serif text-lg italic text-[#8a1c1c]">Content</span>
                  <div class="flex flex-col gap-2 text-[10px] tracking-widest text-[#dcdcdc] opacity-60">
                    <a routerLink="/movies" class="hover:text-white hover:opacity-100 transition-all">Movies</a>
                    <a routerLink="/books" class="hover:text-white hover:opacity-100 transition-all">Books & Comics</a>
                    <a routerLink="/music" class="hover:text-white hover:opacity-100 transition-all">Music</a>
                    <a routerLink="/browse" class="hover:text-white hover:opacity-100 transition-all">Browse All</a>
                  </div>
                </div>

                <!-- Account -->
                <div class="flex flex-col gap-4">
                  <span class="font-serif text-lg italic text-[#8a1c1c]">Account</span>
                  <div class="flex flex-col gap-2 text-[10px] tracking-widest text-[#dcdcdc] opacity-60">
                    <a routerLink="/login" class="hover:text-white hover:opacity-100 transition-all">Sign In</a>
                    <a routerLink="/register" class="hover:text-white hover:opacity-100 transition-all">Create Account</a>
                    <a routerLink="/profile" class="hover:text-white hover:opacity-100 transition-all">Profile</a>
                    <a routerLink="/premium" class="hover:text-white hover:opacity-100 transition-all">Premium</a>
                  </div>
                </div>

                <!-- Support -->
                <div class="flex flex-col gap-4">
                  <span class="font-serif text-lg italic text-[#8a1c1c]">Support</span>
                  <div class="flex flex-col gap-2 text-[10px] tracking-widest text-[#dcdcdc] opacity-60">
                    <a routerLink="/help" class="hover:text-white hover:opacity-100 transition-all">Help Center</a>
                    <a routerLink="/faq" class="hover:text-white hover:opacity-100 transition-all">FAQ</a>
                    <a routerLink="/ways-to-watch" class="hover:text-white hover:opacity-100 transition-all">Ways to Watch</a>
                    <a routerLink="/contact" class="hover:text-white hover:opacity-100 transition-all">Contact Us</a>
                  </div>
                </div>

                <!-- Legal -->
                <div class="flex flex-col gap-4">
                  <span class="font-serif text-lg italic text-[#8a1c1c]">Legal</span>
                  <div class="flex flex-col gap-2 text-[10px] tracking-widest text-[#dcdcdc] opacity-60">
                    <a routerLink="/terms" class="hover:text-white hover:opacity-100 transition-all">Terms of Use</a>
                    <a routerLink="/privacy" class="hover:text-white hover:opacity-100 transition-all">Privacy Policy</a>
                    <a routerLink="/cookies" class="hover:text-white hover:opacity-100 transition-all">Cookie Policy</a>
                    <a routerLink="/corporate" class="hover:text-white hover:opacity-100 transition-all">Corporate Info</a>
                  </div>
                </div>
              </div>

              <!-- Bottom Section: Copyright + PWA Install -->
              <div class="pt-8 border-t border-[#1a1a1a] flex flex-col md:flex-row justify-between items-center gap-4">
                <div class="text-[10px] tracking-widest opacity-30 text-[#dcdcdc] text-center md:text-left">
                  <span>&copy; 2026 NAIJASPRIDE MUSIC GROUP.</span>
                  <span class="mx-2">|</span>
                  <span>DESIGNED IN LAGOS</span>
                </div>
                
                <!-- PWA Install Button (shows only when installable) -->
                @if (pwaInstallable()) {
                  <button (click)="installPwa()" 
                          class="flex items-center gap-2 px-4 py-2 border border-[#8a1c1c] text-[10px] tracking-widest hover:bg-[#8a1c1c] hover:text-black transition-all">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    INSTALL APP
                  </button>
                }
              </div>
            </div>
          </footer>
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
  private router = inject(Router);
  private musicPlayer = inject(MusicPlayerService);

  @ViewChild('heroSection') heroSection!: ElementRef;
  @ViewChild('footerSection') footerSection!: ElementRef;

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
  heroBackdrop = signal<string | null>(null);

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
      window.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });
    }
  }

  ngOnDestroy() {
    this.timers.forEach(clearTimeout);
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.handleScroll.bind(this));
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
        if (movies[0]?.backdropUrl) {
          this.heroBackdrop.set(movies[0].backdropUrl);
        }
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

  scrollToFooter() {
    this.footerSection?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
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
