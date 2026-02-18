import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-site-footer',
  standalone: true,
  imports: [RouterLink],
  template: `
    <footer class="bg-black text-[#dcdcdc] border-t border-white/10">
      <div class="max-w-7xl mx-auto px-6 md:px-8 pt-16 pb-10">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 pb-10 border-b border-white/10">
          <div>
            <h2 class="font-serif text-3xl md:text-4xl tracking-wide uppercase">
              <span class="text-[#8a1c1c]">NAIJAs</span><span class="text-white">PRIDE</span>
            </h2>
            <p class="mt-2 text-[10px] md:text-xs tracking-[0.3em] text-white/60">THE CULTURE CAPITAL</p>
          </div>

          <div class="flex gap-6 md:gap-8 text-[10px] md:text-xs tracking-[0.2em] text-white/70">
            <a href="https://youtube.com" target="_blank" rel="noopener" class="hover:text-white transition-colors">YOUTUBE</a>
            <span class="text-white/50">APPLE MUSIC</span>
            <span class="text-white/50">SPOTIFY</span>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-8 pt-10">
          <div>
            <h3 class="text-sm font-semibold mb-3">Content</h3>
            <div class="flex flex-col gap-2 text-sm text-white/70">
              <a routerLink="/movies" class="hover:text-white transition-colors">Movies</a>
              <a routerLink="/books" class="hover:text-white transition-colors">Books & Comics</a>
              <a routerLink="/music" class="hover:text-white transition-colors">Music</a>
              <a routerLink="/browse" class="hover:text-white transition-colors">Browse All</a>
            </div>
          </div>

          <div>
            <h3 class="text-sm font-semibold mb-3">Account</h3>
            <div class="flex flex-col gap-2 text-sm text-white/70">
              <a routerLink="/login" class="hover:text-white transition-colors">Sign In</a>
              <a routerLink="/register" class="hover:text-white transition-colors">Create Account</a>
              <a routerLink="/profile" class="hover:text-white transition-colors">Profile</a>
              <a routerLink="/premium" class="hover:text-white transition-colors">Premium</a>
            </div>
          </div>

          <div>
            <h3 class="text-sm font-semibold mb-3">Support</h3>
            <div class="flex flex-col gap-2 text-sm text-white/70">
              <a routerLink="/help" class="hover:text-white transition-colors">Help Center</a>
              <a routerLink="/faq" class="hover:text-white transition-colors">FAQ</a>
              <a routerLink="/ways-to-watch" class="hover:text-white transition-colors">Ways to Watch</a>
              <a routerLink="/contact" class="hover:text-white transition-colors">Contact Us</a>
            </div>
          </div>

          <div>
            <h3 class="text-sm font-semibold mb-3">Legal</h3>
            <div class="flex flex-col gap-2 text-sm text-white/70">
              <a routerLink="/terms" class="hover:text-white transition-colors">Terms of Use</a>
              <a routerLink="/privacy" class="hover:text-white transition-colors">Privacy Policy</a>
              <a routerLink="/cookies" class="hover:text-white transition-colors">Cookie Policy</a>
              <a routerLink="/corporate" class="hover:text-white transition-colors">Corporate Info</a>
            </div>
          </div>
        </div>

        <div class="mt-10 pt-6 border-t border-white/10 text-[10px] tracking-[0.12em] text-white/50">
          © 2026 NAIJASPRIDE MUSIC GROUP. | DESIGNED IN LAGOS
        </div>
      </div>
    </footer>
  `,
})
export class SiteFooterComponent {}
