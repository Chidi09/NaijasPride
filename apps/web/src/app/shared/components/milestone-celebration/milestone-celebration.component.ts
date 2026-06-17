import { Component, inject } from "@angular/core";
import { MilestoneService } from "../../../core/services/milestone.service";

const ICONS: Record<string, string> = {
  movie:
    "M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z",
  download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  book: "M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z",
  trophy:
    "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z",
  star: "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
};

@Component({
  selector: "app-milestone-celebration",
  standalone: true,
  template: `
    @if (milestones.activeCelebration(); as m) {
      <div
        class="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
        style="animation: milestone-bg 5s ease-out forwards"
      >
        <!-- Confetti particles -->
        <div class="absolute inset-0 overflow-hidden pointer-events-none">
          @for (i of particles; track i) {
            <div
              class="absolute w-2 h-2 rounded-full"
              [style.left.%]="10 + ((i * 17) % 80)"
              [style.background]="colors[i % colors.length]"
              [style.animation]="
                'confetti-fall ' +
                (2 + i * 0.3) +
                's ease-out ' +
                i * 0.1 +
                's forwards'
              "
            ></div>
          }
        </div>

        <!-- Card -->
        <div
          class="pointer-events-auto bg-zinc-900/95 border border-cinema-500/40 rounded-2xl p-8 text-center max-w-sm mx-4 backdrop-blur-xl shadow-2xl shadow-cinema-500/20"
          style="animation: milestone-card 600ms cubic-bezier(0.34,1.56,0.64,1) forwards"
          (click)="milestones.dismissCelebration()"
        >
          <div
            class="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-cinema-500 to-amber-500 flex items-center justify-center"
          >
            <svg
              class="w-8 h-8 text-white"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path [attr.d]="getIcon(m.icon)" />
            </svg>
          </div>
          <h3 class="text-xl font-bold text-white mb-1">{{ m.title }}</h3>
          <p class="text-sm text-gray-400">{{ m.subtitle }}</p>
          <div class="mt-4 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-cinema-500 to-amber-500 rounded-full"
              style="animation: milestone-progress 5s linear forwards"
            ></div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      @keyframes milestone-bg {
        0% {
          background: rgba(0, 0, 0, 0);
        }
        10% {
          background: rgba(0, 0, 0, 0.6);
        }
        80% {
          background: rgba(0, 0, 0, 0.6);
        }
        100% {
          background: rgba(0, 0, 0, 0);
        }
      }
      @keyframes milestone-card {
        0% {
          opacity: 0;
          transform: scale(0.8) translateY(20px);
        }
        100% {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
      @keyframes milestone-progress {
        0% {
          width: 100%;
        }
        100% {
          width: 0%;
        }
      }
      @keyframes confetti-fall {
        0% {
          transform: translateY(-20vh) rotate(0deg);
          opacity: 1;
        }
        100% {
          transform: translateY(100vh) rotate(720deg);
          opacity: 0;
        }
      }
    `,
  ],
})
export class MilestoneCelebrationComponent {
  milestones = inject(MilestoneService);
  particles = Array.from({ length: 12 }, (_, i) => i);
  colors = ["#800020", "#d4af37", "#22c55e", "#3b82f6", "#f59e0b", "#ec4899"];

  getIcon(name: string): string {
    return ICONS[name] || ICONS["star"];
  }
}
