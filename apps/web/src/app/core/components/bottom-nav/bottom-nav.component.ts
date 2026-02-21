import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PwaService } from '../../../core/services/pwa.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  styles: [`
    :host {
      display: block;
    }

    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 64px;
      background: var(--bg-primary, #f8f0e9);
      border-top: 1px solid var(--border-color, #d8c2b8);
      display: flex;
      justify-content: space-around;
      align-items: center;
      padding-bottom: env(safe-area-inset-bottom, 0);
      z-index: 50;
      transition: transform 0.3s ease;
    }

    .bottom-nav.hidden {
      transform: translateY(100%);
    }

    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 8px 16px;
      color: var(--text-muted, #6b5b52);
      text-decoration: none;
      transition: color 0.2s ease;
      position: relative;
    }

    .nav-item:hover,
    .nav-item.active {
      color: var(--brand, #800020);
    }

    .nav-item.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 24px;
      height: 3px;
      background: var(--brand, #800020);
      border-radius: 2px;
    }

    .nav-icon {
      width: 24px;
      height: 24px;
      transition: transform 0.2s ease;
    }

    .nav-item:hover .nav-icon,
    .nav-item.active .nav-icon {
      transform: scale(1.1);
    }

    .nav-label {
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.5px;
    }

    /* Vintage icon styling */
    .vintage-icon {
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      stroke-width: 1.5;
    }

    .vintage-icon.filled {
      fill: currentColor;
    }

    /* Dark mode support */
    :host-context(.dark) .bottom-nav {
      background: var(--bg-primary, #0a0a0a);
      border-top-color: var(--border-color, #2a2a2a);
    }

    /* Desktop hide - only show on mobile/tablet */
    @media (min-width: 1024px) {
      .bottom-nav {
        display: none;
      }
    }
  `],
  template: `
    @if (pwaService.isAppMode()) {
      <nav class="bottom-nav" [class.hidden]="isHidden()">
        <!-- Home -->
        <a 
          routerLink="/home" 
          routerLinkActive="active"
          class="nav-item"
          [routerLinkActiveOptions]="{exact: true}"
        >
          <svg class="nav-icon vintage-icon" viewBox="0 0 24 24" [class.filled]="isActive('/home')">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span class="nav-label">Home</span>
        </a>

        <!-- Search -->
        <a 
          routerLink="/search" 
          routerLinkActive="active"
          class="nav-item"
        >
          <svg class="nav-icon vintage-icon" viewBox="0 0 24 24" [class.filled]="isActive('/search')">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span class="nav-label">Search</span>
        </a>

        <!-- Movies -->
        <a 
          routerLink="/movies" 
          routerLinkActive="active"
          class="nav-item"
        >
          <svg class="nav-icon vintage-icon" viewBox="0 0 24 24" [class.filled]="isActive('/movies')">
            <rect x="2" y="2" width="20" height="20" rx="2.18"/>
            <line x1="7" y1="2" x2="7" y2="22"/>
            <line x1="17" y1="2" x2="17" y2="22"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <line x1="2" y1="7" x2="7" y2="7"/>
            <line x1="2" y1="17" x2="7" y2="17"/>
            <line x1="17" y1="17" x2="22" y2="17"/>
            <line x1="17" y1="7" x2="22" y2="7"/>
          </svg>
          <span class="nav-label">Movies</span>
        </a>

        <!-- Music -->
        <a 
          routerLink="/music" 
          routerLinkActive="active"
          class="nav-item"
        >
          <svg class="nav-icon vintage-icon" viewBox="0 0 24 24" [class.filled]="isActive('/music')">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3"/>
            <path d="M12 19v3"/>
            <path d="M2 12h3"/>
            <path d="M19 12h3"/>
          </svg>
          <span class="nav-label">Music</span>
        </a>

        <!-- Books -->
        <a 
          routerLink="/books" 
          routerLinkActive="active"
          class="nav-item"
        >
          <svg class="nav-icon vintage-icon" viewBox="0 0 24 24" [class.filled]="isActive('/books')">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
            <line x1="10" y1="2" x2="10" y2="22"/>
          </svg>
          <span class="nav-label">Books</span>
        </a>
      </nav>
    }
  `
})
export class BottomNavComponent {
  pwaService = inject(PwaService);
  authService = inject(AuthService);
  
  isHidden = signal(false);

  isActive(route: string): boolean {
    return window.location.pathname.startsWith(route);
  }

  hide(): void {
    this.isHidden.set(true);
  }

  show(): void {
    this.isHidden.set(false);
  }
}
