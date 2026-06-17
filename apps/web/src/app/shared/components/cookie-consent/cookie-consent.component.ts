import { Component, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";

const STORAGE_KEY = "np_cookie_consent";

@Component({
  selector: "app-cookie-consent",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (visible()) {
      <div
        role="dialog"
        aria-modal="false"
        aria-label="Cookie consent"
        class="fixed bottom-0 left-0 right-0 z-[9999] bg-[#140d11] border-t border-[#3f1d28] shadow-2xl animate-slide-up"
      >
        <div
          class="max-w-7xl mx-auto px-4 py-4 md:py-5 flex flex-col md:flex-row items-start md:items-center gap-4"
        >
          <!-- Icon + text -->
          <div class="flex items-start gap-3 flex-1">
            <span
              class="material-symbols-outlined text-2xl mt-0.5 flex-shrink-0"
              aria-hidden="true"
              >cookie</span
            >
            <div>
              <p class="text-sm text-[#f0e8e0] leading-relaxed">
                We use essential cookies to keep you signed in and to remember
                your preferences. We do <strong>not</strong> use advertising or
                tracking cookies.
                <a
                  routerLink="/cookies"
                  class="text-[#c07060] hover:text-[#d88070] underline ml-1 whitespace-nowrap"
                  (click)="dismiss()"
                >
                  Cookie Policy
                </a>
                &amp;
                <a
                  routerLink="/privacy"
                  class="text-[#c07060] hover:text-[#d88070] underline whitespace-nowrap"
                  (click)="dismiss()"
                >
                  Privacy Policy
                </a>
              </p>
            </div>
          </div>

          <!-- Buttons -->
          <div class="flex gap-3 flex-shrink-0 self-end md:self-auto">
            <button
              (click)="dismiss()"
              class="px-4 py-2 text-sm text-[#bfa49a] hover:text-white border border-[#3f1d28] hover:border-[#800020] rounded transition-colors"
            >
              Dismiss
            </button>
            <button
              (click)="accept()"
              class="px-5 py-2 text-sm font-semibold bg-[#800020] hover:bg-[#660019] text-white rounded transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      @keyframes slideUp {
        from {
          transform: translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      .animate-slide-up {
        animation: slideUp 0.3s ease-out forwards;
      }
    `,
  ],
})
export class CookieConsentComponent implements OnInit {
  visible = signal(false);
  private revealTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        if (typeof window !== "undefined") {
          window.addEventListener("pointerdown", this.revealFromInteraction, {
            once: true,
            passive: true,
          });
          window.addEventListener("keydown", this.revealFromInteraction, {
            once: true,
          });
          window.addEventListener("scroll", this.revealFromInteraction, {
            once: true,
            passive: true,
          });
          this.revealTimer = setTimeout(this.revealFromInteraction, 8000);
        }
      }
    }
  }

  accept() {
    localStorage.setItem(STORAGE_KEY, "accepted");
    this.visible.set(false);
    this.removeInteractionListeners();
  }

  dismiss() {
    localStorage.setItem(STORAGE_KEY, "dismissed");
    this.visible.set(false);
    this.removeInteractionListeners();
  }

  private removeInteractionListeners(): void {
    if (typeof window === "undefined") return;
    window.removeEventListener("pointerdown", this.revealFromInteraction);
    window.removeEventListener("keydown", this.revealFromInteraction);
    window.removeEventListener("scroll", this.revealFromInteraction);
  }

  private readonly revealFromInteraction = () => {
    if (!this.visible()) {
      this.visible.set(true);
    }
    this.removeInteractionListeners();
    if (this.revealTimer) {
      clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }
  };
}
