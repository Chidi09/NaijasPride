import { Component, inject, HostListener } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
    <div class="min-h-screen flex flex-col bg-cinema-900 text-cinema-50">
      
      <header 
        class="fixed top-0 w-full z-50 transition-all duration-500 ease-in-out"
        [class.bg-cinema-900]="scrolled"
        [class.bg-gradient-to-b]="!scrolled"
        [class.from-black/80]="!scrolled"
        [class.to-transparent]="!scrolled"
      >
        <div class="container mx-auto px-6 h-20 flex justify-between items-center">
          
          <a routerLink="/" class="flex items-center gap-1 group select-none">
             <span class="text-4xl font-serif font-bold text-cinema-500 tracking-tighter group-hover:text-cinema-100 transition-colors">N</span>
             <div class="hidden md:flex flex-col leading-none ml-1">
               <span class="font-serif text-lg tracking-[0.2em] text-cinema-100 group-hover:text-cinema-500 transition-colors">NAIJAS</span>
               <span class="font-sans text-[10px] font-bold tracking-[0.4em] text-cinema-500 uppercase ml-0.5">Pride</span>
             </div>
          </a>

          <nav class="hidden md:flex items-center gap-8">
            <a routerLink="/movies" routerLinkActive="text-white font-medium" class="text-sm text-gray-400 hover:text-cinema-100 transition-colors">Movies</a>
            <a routerLink="/series" routerLinkActive="text-white font-medium" class="text-sm text-gray-400 hover:text-cinema-100 transition-colors">Series</a>
            <a routerLink="/new" routerLinkActive="text-white font-medium" class="text-sm text-gray-400 hover:text-cinema-100 transition-colors">New & Popular</a>
          </nav>

          <div class="flex items-center gap-6">
            <button class="text-gray-300 hover:text-white transition-transform hover:scale-110">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </button>
            
            @if (auth.currentUser()) {
              <div class="w-8 h-8 rounded bg-cinema-500 flex items-center justify-center text-xs font-serif font-bold cursor-pointer hover:ring-2 hover:ring-cinema-100 transition-all">
                {{ auth.currentUser()?.email?.charAt(0) }}
              </div>
            } @else {
              <a routerLink="/login" class="text-sm font-medium hover:text-cinema-500 transition-colors">Sign In</a>
            }
          </div>
        </div>
      </header>

      <main class="flex-grow pt-20">
        <router-outlet />
      </main>

    </div>
  `
})
export class AppComponent { 
  scrolled = false;
  auth = inject(AuthService);

  @HostListener('window:scroll', ['$event'])
  onWindowScroll() {
    this.scrolled = window.scrollY > 50;
  }
}
