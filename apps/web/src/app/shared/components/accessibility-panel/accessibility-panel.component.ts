import { Component, inject } from '@angular/core';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';

@Component({
  selector: 'app-accessibility-panel',
  standalone: true,
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-[150] flex items-end sm:items-center justify-center">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" (click)="open.set(false)"></div>
        <div class="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 space-y-5">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-bold text-white">Accessibility</h3>
            <button (click)="open.set(false)" class="text-gray-500 hover:text-white text-xl">&times;</button>
          </div>

          <!-- High Contrast -->
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-white">High Contrast</p>
              <p class="text-xs text-gray-500">Sharper borders & bolder text</p>
            </div>
            <button
              (click)="prefs.setHighContrast(!prefs.highContrast())"
              class="w-12 h-7 rounded-full transition-colors relative"
              [class.bg-cinema-500]="prefs.highContrast()"
              [class.bg-zinc-700]="!prefs.highContrast()"
            >
              <span
                class="absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform"
                [class.translate-x-5]="prefs.highContrast()"
              ></span>
            </button>
          </div>

          <!-- Font Scale -->
          <div>
            <p class="text-sm font-medium text-white mb-2">Text Size</p>
            <div class="flex gap-2">
              @for (option of fontOptions; track option.value) {
                <button
                  (click)="prefs.setFontScale(option.value)"
                  class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors border"
                  [class.bg-cinema-500]="prefs.fontScale() === option.value"
                  [class.border-cinema-500]="prefs.fontScale() === option.value"
                  [class.text-white]="prefs.fontScale() === option.value"
                  [class.bg-zinc-800]="prefs.fontScale() !== option.value"
                  [class.border-zinc-700]="prefs.fontScale() !== option.value"
                  [class.text-gray-400]="prefs.fontScale() !== option.value"
                >
                  {{ option.label }}
                </button>
              }
            </div>
          </div>

          <p class="text-[11px] text-gray-600 text-center pt-2">Settings are saved automatically</p>
        </div>
      </div>
    }
  `,
})
export class AccessibilityPanelComponent {
  prefs = inject(UserPreferencesService);
  open = this.prefs.a11yPanelOpen;

  fontOptions = [
    { label: 'S', value: 0.875 },
    { label: 'M', value: 1 },
    { label: 'L', value: 1.125 },
    { label: 'XL', value: 1.25 },
  ];

  toggle() {
    this.open.update(v => !v);
  }
}
