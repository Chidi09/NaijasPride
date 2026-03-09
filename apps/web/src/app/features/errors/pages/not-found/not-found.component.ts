import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BrandLogoComponent } from '../../../../shared/components/brand-logo/brand-logo.component';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink, BrandLogoComponent],
  template: `
    <div class="relative min-h-screen overflow-hidden bg-[#f7efe8] dark:bg-[#0b0708] flex items-center justify-center px-4">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(128,0,32,0.14),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(154,109,31,0.10),transparent_40%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(128,0,32,0.24),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(214,184,122,0.14),transparent_40%)]"></div>
      
      <div class="relative text-center max-w-lg">
        <div class="flex justify-center mb-8">
          <app-brand-logo variant="mark" alt="NaijasPride" className="h-20 w-20 object-contain opacity-50" />
        </div>
        
        <div class="text-[120px] font-bold text-[#800020]/20 leading-none mb-4">404</div>
        
        <h1 class="font-['Cinzel'] text-4xl md:text-5xl font-bold text-[#2a1c1f] dark:text-[#f3e5d8] mb-4">
          Page Not Found
        </h1>
        
        <p class="text-lg text-[#7b6660] dark:text-[#d7c4b6] mb-8">
          Oops! The page you're looking for seems to have wandered off into the digital wilderness.
        </p>
        
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <a 
            [routerLink]="['/movies/stream']" 
            class="inline-flex items-center justify-center gap-2 rounded-lg border border-[#992143] bg-[#800020] px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#fff5f2] transition hover:bg-[#660019]">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Browse Movies
          </a>
          
          <a 
            [routerLink]="['/']" 
            class="inline-flex items-center justify-center gap-2 rounded-lg border border-[#d8b7a8] dark:border-[#5f1327] bg-white dark:bg-[#1b1014] px-6 py-3 text-sm font-semibold text-[#2a1c1f] dark:text-[#f7eee7] transition hover:bg-[#f7efe8] dark:hover:bg-[#2a151b]">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Go Home
          </a>
        </div>
        
        <div class="mt-12 pt-8 border-t border-[#d8b7a8] dark:border-[#5f1327]">
          <p class="text-sm text-[#8a756e] dark:text-[#a88a78]">
            Need help? <a [routerLink]="['/contact']" class="text-[#800020] dark:text-[#d6b87a] hover:underline">Contact Support</a>
          </p>
        </div>
      </div>
    </div>
  `
})
export class NotFoundComponent {}
