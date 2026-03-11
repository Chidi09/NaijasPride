import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PwaService } from '../../../core/services/pwa.service';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    @if (pwaService.isAppMode()) {
      <nav 
        class="nav-shell"
        [class.nav-hidden]="isHidden()"
      >
        <a routerLink="/home" routerLinkActive="active-link" [routerLinkActiveOptions]="{exact: true}" class="nav-item">
          <svg class="nav-icon" viewBox="0 0 24 24">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span class="nav-label">Home</span>
        </a>

        <a routerLink="/search" routerLinkActive="active-link" class="nav-item">
          <svg class="nav-icon" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span class="nav-label">Search</span>
        </a>

        <a routerLink="/movies" routerLinkActive="active-link" class="nav-item">
          <svg class="nav-icon" viewBox="0 0 24 24">
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

        <a routerLink="/tv-shows" routerLinkActive="active-link" class="nav-item">
          <svg class="nav-icon" viewBox="0 0 24 24">
            <rect x="3" y="5" width="18" height="14" rx="2"/>
            <path d="M8 3l4 2 4-2"/>
            <path d="M9 12h6"/>
          </svg>
          <span class="nav-label">TV</span>
        </a>

        <a routerLink="/anime" routerLinkActive="active-link" class="nav-item">
          <svg class="nav-icon" viewBox="0 0 24 24">
            <path d="M4 6l8 12 8-12"/>
            <path d="M7 6h10"/>
            <path d="M9 11h6"/>
          </svg>
          <span class="nav-label">Anime</span>
        </a>

        <a routerLink="/music" routerLinkActive="active-link" class="nav-item">
          <svg class="nav-icon" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3"/>
            <path d="M12 19v3"/>
            <path d="M2 12h3"/>
            <path d="M19 12h3"/>
          </svg>
          <span class="nav-label">Music</span>
        </a>

        <a routerLink="/books" routerLinkActive="active-link" class="nav-item">
          <svg class="nav-icon" viewBox="0 0 24 24">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
            <line x1="10" y1="2" x2="10" y2="22"/>
          </svg>
          <span class="nav-label">Books</span>
        </a>
      </nav>
    }
  `,
  styles: [`
    :host { display: block; }

    /* ── Base: Shared styles ── */
    .nav-icon {
      width: 22px;
      height: 22px;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.9;
      transition: transform 0.2s ease;
    }

    .nav-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.3px;
      line-height: 1;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }

    /* ── Mobile: Floating Bottom Bar (default) ── */
    .nav-shell {
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
      flex-direction: row;
      justify-content: space-around;
      align-items: center;
      padding: 6px 8px;
      z-index: 50;
      transition: transform 0.3s ease;
    }

    .nav-shell.nav-hidden {
      transform: translateY(calc(100% + 20px));
    }

    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      flex: 1;
      min-width: 0;
      height: 100%;
      border-radius: 999px;
      color: var(--text-muted, #826f68);
      text-decoration: none;
      transition: color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
      position: relative;
    }

    .nav-item:hover,
    .nav-item.active-link {
      color: var(--brand, #800020);
      background: rgba(128, 0, 32, 0.12);
      transform: translateY(-1px);
    }

    .nav-item:hover .nav-icon,
    .nav-item.active-link .nav-icon {
      transform: scale(1.1);
    }

    .nav-item.active-link .nav-icon {
      fill: currentColor;
    }

    /* ── Dark mode ── */
    :host-context(.dark) .nav-shell {
      background: color-mix(in srgb, #101010 92%, transparent);
      border-color: #2a2a2a;
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
    }

    :host-context(.dark) .nav-item {
      color: #c7b3a5;
    }

    :host-context(.dark) .nav-item.active-link,
    :host-context(.dark) .nav-item:hover {
      color: #f0d3be;
      background: rgba(128, 0, 32, 0.35);
    }

    /* ── Tablet/Desktop: Fixed Left Side Rail ── */
    @media (min-width: 768px) {
      .nav-shell {
        /* Reset mobile positioning */
        bottom: auto;
        left: 0;
        right: auto;
        /* Side rail positioning */
        top: 0;
        width: 80px;
        height: 100vh;
        height: 100dvh;
        border-radius: 0;
        flex-direction: column;
        justify-content: flex-start;
        padding: 80px 0 24px;
        gap: 4px;
        border: none;
        border-right: 1px solid color-mix(in srgb, var(--border-color, #d8c2b8) 82%, transparent);
        box-shadow: 4px 0 16px rgba(0, 0, 0, 0.08);
      }

      .nav-shell.nav-hidden {
        transform: translateX(-100%);
      }

      .nav-item {
        width: 64px;
        height: 56px;
        border-radius: 16px;
        margin: 2px auto;
      }

      .nav-item:hover,
      .nav-item.active-link {
        transform: none;
      }

      :host-context(.dark) .nav-shell {
        border-right-color: #2a2a2a;
        box-shadow: 4px 0 16px rgba(0, 0, 0, 0.25);
      }
    }
  `]
})
export class BottomNavComponent {
  pwaService = inject(PwaService);
  isHidden = signal(false);

  hide(): void {
    this.isHidden.set(true);
  }

  show(): void {
    this.isHidden.set(false);
  }
}
