import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { PwaService } from '../../../core/services/pwa.service';

@Component({
  selector: 'app-back-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (showBackButton()) {
      <button
        type="button"
        (click)="goBack()"
        class="flex items-center gap-1 text-sm font-medium text-[var(--text-primary)] transition hover:text-[var(--brand)]"
        [class]="buttonClass()"
      >
        <svg 
          class="h-5 w-5" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            stroke-linecap="round" 
            stroke-linejoin="round" 
            stroke-width="2" 
            d="M15 19l-7-7 7-7"
          />
        </svg>
        <span>Back</span>
      </button>
    }
  `
})
export class BackButtonComponent {
  private location = inject(Location);
  private router = inject(Router);
  private pwaService = inject(PwaService);

  showBackButton = () => {
    // Always show back button in PWA/TV mode except on home
    if (this.pwaService.isAppMode() || this.pwaService.isTV()) {
      return !this.router.url.includes('/home') && this.router.url !== '/';
    }
    return false;
  };

  buttonClass = () => {
    if (this.pwaService.isAppMode() || this.pwaService.isTV()) {
      return 'fixed left-4 md:left-24 top-[72px] z-[41] rounded-full bg-[var(--bg-card)] border border-[var(--border-color)] p-2 shadow-lg';
    }
    return '';
  };

  goBack(): void {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigate(['/home']);
    }
  }
}
