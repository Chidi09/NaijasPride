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
      bottom: calc(env(safe-area-inset-bottom, 0px) + 10px);
      left: 12px;
      right: 12px;
      height: 72px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--bg-card, #fff) 92%, transparent);
      border: 1px solid color-mix(in srgb, var(--border-color, #d8c2b8) 82%, transparent);
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.18);
      backdrop-filter: blur(12px);
      display: flex;
      justify-content: space-around;
      align-items: center;
      padding: 6px 8px;
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
      gap: 2px;
      width: 20%;
      height: 100%;
      border-radius: 999px;
      color: #5a4640;
      text-decoration: none;
      transition: color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
      position: relative;
    }

    .nav-item:hover,
    .nav-item.active {
      color: var(--brand, #800020);
      background: rgba(128, 0, 32, 0.12);
      transform: translateY(-1px);
    }

    .nav-icon {
      width: 22px;
      height: 22px;
      color: currentColor;
      transition: transform 0.2s ease;
    }

    .nav-item:hover .nav-icon,
    .nav-item.active .nav-icon {
      transform: scale(1.1);
    }

    .nav-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.3px;
      line-height: 1;
    }

    /* Vintage icon styling */
    .vintage-icon {
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.9;
    }

    .vintage-icon.filled {
      fill: currentColor;
    }

    /* Dark mode support */
    :host-context(.dark) .bottom-nav {
      background: color-mix(in srgb, #101010 92%, transparent);
      border-color: #2a2a2a;
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
    }

    :host-context(.dark) .nav-item {
      color: #c7b3a5;
    }

    :host-context(.dark) .nav-item.active,
    :host-context(.dark) .nav-item:hover {
      color: #f0d3be;
      background: rgba(128, 0, 32, 0.35);
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
