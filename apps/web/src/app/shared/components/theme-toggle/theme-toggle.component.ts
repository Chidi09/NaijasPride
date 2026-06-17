import { CommonModule } from "@angular/common";
import { Component, computed, inject, input } from "@angular/core";
import { ThemeService } from "../../../core/services/theme.service";

@Component({
  selector: "app-theme-toggle",
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      (click)="themeService.toggleTheme()"
      class="inline-flex items-center justify-center rounded-full border transition-colors duration-300"
      [ngClass]="compact() ? compactClass() : regularClass()"
      [attr.aria-label]="ariaLabel()"
      [title]="ariaLabel()"
    >
      @if (isDark()) {
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3v2.5M12 18.5V21M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M3 12h2.5M18.5 12H21M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
      } @else {
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M21 13.09A9 9 0 1110.91 3 7 7 0 0021 13.09z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      }
    </button>
  `,
})
export class ThemeToggleComponent {
  compact = input(false);

  themeService = inject(ThemeService);
  isDark = computed(() => this.themeService.theme() === "dark");
  ariaLabel = computed(() =>
    this.isDark() ? "Switch to light mode" : "Switch to dark mode",
  );

  regularClass = computed(() =>
    this.isDark()
      ? "h-10 w-10 border-white/20 bg-black/50 text-[#d6b87a] hover:border-white/40 hover:bg-black/70"
      : "h-10 w-10 border-[#caa899] bg-white/90 text-[#6b1b2d] hover:border-[#a26d5a] hover:bg-white",
  );

  compactClass = computed(() =>
    this.isDark()
      ? "h-9 w-9 border-white/20 bg-black/50 text-[#d6b87a]"
      : "h-9 w-9 border-[#caa899] bg-white/90 text-[#6b1b2d]",
  );
}
