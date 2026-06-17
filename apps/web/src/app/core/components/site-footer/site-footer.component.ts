import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";

@Component({
  selector: "app-site-footer",
  standalone: true,
  imports: [RouterLink],
  template: `
    <footer
      class="bg-[var(--bg-secondary)] text-[var(--text-primary)] border-t border-[var(--border-color)]"
    >
      <div class="max-w-7xl mx-auto px-6 md:px-8 pt-16 pb-10">
        <div
          class="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 pb-10 border-b border-[var(--border-color)]"
        >
          <div>
            <h2 class="font-serif text-3xl md:text-4xl tracking-wide">
              <span class="text-[#8a1c1c] uppercase">NAIJA</span>
              <span class="text-[#8a1c1c] lowercase text-[0.72em] align-super"
                >s</span
              >
              <span class="text-white bg-black px-1.5 py-0.5 ml-1 rounded-sm"
                >PRIDE</span
              >
            </h2>
            <p
              class="mt-2 text-[10px] md:text-xs tracking-[0.3em] text-[var(--text-secondary)]"
            >
              THE CULTURE CAPITAL
            </p>
          </div>

          <div
            class="flex gap-6 md:gap-8 text-[10px] md:text-xs tracking-[0.2em] text-[var(--text-secondary)]"
          >
            <a
              href="https://youtube.com"
              target="_blank"
              rel="noopener"
              class="hover:text-[var(--text-primary)] transition-colors"
              >YOUTUBE</a
            >
            <span>APPLE MUSIC</span>
            <span>SPOTIFY</span>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-8 pt-10">
          <div>
            <h3 class="text-sm font-semibold mb-3">Content</h3>
            <div
              class="flex flex-col gap-2 text-sm text-[var(--text-secondary)]"
            >
              <a
                routerLink="/movies"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Movies</a
              >
              <a
                routerLink="/tv-shows"
                class="hover:text-[var(--text-primary)] transition-colors"
                >TV Shows</a
              >
              <a
                routerLink="/books"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Books & Comics</a
              >
              <a
                routerLink="/music"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Music</a
              >
              <a
                routerLink="/movies"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Browse All</a
              >
            </div>
          </div>

          <div>
            <h3 class="text-sm font-semibold mb-3">Account</h3>
            <div
              class="flex flex-col gap-2 text-sm text-[var(--text-secondary)]"
            >
              <a
                routerLink="/account"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Account</a
              >
              <a
                routerLink="/login"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Sign In</a
              >
              <a
                routerLink="/register"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Create Account</a
              >
              <a
                routerLink="/profile"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Profile</a
              >
              <a
                routerLink="/premium"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Premium</a
              >
            </div>
          </div>

          <div>
            <h3 class="text-sm font-semibold mb-3">Support</h3>
            <div
              class="flex flex-col gap-2 text-sm text-[var(--text-secondary)]"
            >
              <a
                routerLink="/help"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Help Center</a
              >
              <a
                routerLink="/faq"
                class="hover:text-[var(--text-primary)] transition-colors"
                >FAQ</a
              >
              <a
                routerLink="/ways-to-watch"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Ways to Watch</a
              >
              <a
                routerLink="/contact"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Contact Us</a
              >
            </div>
          </div>

          <div>
            <h3 class="text-sm font-semibold mb-3">Legal</h3>
            <div
              class="flex flex-col gap-2 text-sm text-[var(--text-secondary)]"
            >
              <a
                routerLink="/terms"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Terms of Use</a
              >
              <a
                routerLink="/privacy"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Privacy Policy</a
              >
              <a
                routerLink="/cookies"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Cookie Policy</a
              >
              <a
                routerLink="/corporate"
                class="hover:text-[var(--text-primary)] transition-colors"
                >Corporate Info</a
              >
            </div>
          </div>
        </div>

        <div class="mt-10 pt-8 border-t border-[var(--border-color)]">
          <p
            class="text-[10px] md:text-xs text-[var(--text-secondary)] leading-relaxed max-w-4xl italic"
          >
            NaijasPride is the ultimate destination for Nollywood movies,
            Nigerian music, and African literature. Stream the latest Nigerian
            cinema, explore Yoruba, Igbo, and Hausa films, and discover emerging
            African authors. Our platform is dedicated to promoting African
            culture and providing high-quality entertainment to a global
            audience.
          </p>
        </div>

        <div
          class="mt-8 pt-6 border-t border-[var(--border-color)] text-[10px] tracking-[0.12em] text-[var(--text-muted)] flex flex-col md:flex-row justify-between gap-4"
        >
          <span>© 2026 NAIJASPRIDE MUSIC GROUP. | DESIGNED IN LAGOS</span>
          <div class="flex gap-4">
            <a routerLink="/privacy" class="hover:underline">Privacy</a>
            <a routerLink="/terms" class="hover:underline">Terms</a>
            <a routerLink="/cookies" class="hover:underline">Cookies</a>
          </div>
        </div>
      </div>
    </footer>
  `,
})
export class SiteFooterComponent {}
