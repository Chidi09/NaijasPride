import { Component, inject, output } from "@angular/core";
import { UserPreferencesService } from "../../../core/services/user-preferences.service";

@Component({
  selector: "app-cinema-splash",
  standalone: true,
  template: `
    <div
      class="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black"
      style="animation: splash-out 800ms ease-in 3.2s forwards"
    >
      <!-- Ambient glow -->
      <div
        class="absolute w-96 h-96 rounded-full bg-cinema-500/20 blur-[120px]"
        style="animation: splash-glow 3s ease-in-out"
      ></div>

      <!-- Logo mark -->
      <div
        class="relative"
        style="animation: splash-logo 1.2s cubic-bezier(0.34,1.56,0.64,1) forwards"
      >
        <div
          class="text-5xl md:text-7xl font-serif font-bold tracking-tight text-white"
        >
          <span class="text-cinema-500">Naijas</span
          ><span class="text-white">Pride</span>
        </div>
      </div>

      <!-- Tagline -->
      <p
        class="mt-6 text-sm md:text-base text-gray-400 tracking-widest uppercase"
        style="animation: splash-tagline 800ms ease-out 1s forwards; opacity: 0"
      >
        Your stories. Your culture. Your screen.
      </p>

      <!-- Skip -->
      <button
        class="absolute bottom-12 text-xs text-gray-600 hover:text-gray-400 tracking-wider uppercase transition-colors"
        style="animation: splash-skip 600ms ease-out 1.5s forwards; opacity: 0"
        (click)="dismiss()"
      >
        Skip intro
      </button>
    </div>
  `,
  styles: [
    `
      @keyframes splash-out {
        0% {
          opacity: 1;
        }
        100% {
          opacity: 0;
          pointer-events: none;
          visibility: hidden;
        }
      }
      @keyframes splash-glow {
        0% {
          opacity: 0;
          transform: scale(0.3);
        }
        50% {
          opacity: 1;
          transform: scale(1);
        }
        100% {
          opacity: 0.3;
          transform: scale(1.2);
        }
      }
      @keyframes splash-logo {
        0% {
          opacity: 0;
          transform: scale(0.9) translateY(10px);
          letter-spacing: 0.2em;
        }
        100% {
          opacity: 1;
          transform: scale(1) translateY(0);
          letter-spacing: normal;
        }
      }
      @keyframes splash-tagline {
        0% {
          opacity: 0;
          transform: translateY(8px);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @keyframes splash-skip {
        0% {
          opacity: 0;
        }
        100% {
          opacity: 0.5;
        }
      }
    `,
  ],
})
export class CinemaSplashComponent {
  private prefs = inject(UserPreferencesService);
  dismissed = output<void>();

  dismiss() {
    this.prefs.markOnboardingSeen();
    this.dismissed.emit();
  }

  constructor() {
    // Auto-dismiss after animation completes
    setTimeout(() => {
      this.prefs.markOnboardingSeen();
      this.dismissed.emit();
    }, 4000);
  }
}
