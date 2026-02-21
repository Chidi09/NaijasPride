import { Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { PwaService } from '../../services/pwa.service';

@Component({
  selector: 'app-app-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [`
    :host {
      display: block;
    }

    .app-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 56px;
      background: var(--bg-primary, #f8f0e9);
      border-bottom: 1px solid var(--border-color, #d8c2b8);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      padding-top: env(safe-area-inset-top, 0);
      z-index: 40;
    }

    .header-left,
    .header-right {
      display: flex;
      align-items: center;
      width: 48px;
    }

    .header-center {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .user-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: var(--bg-secondary, #efe1d7);
      color: var(--text-primary, #24181b);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
      transition: background 0.2s ease;
    }

    .user-btn:hover {
      background: var(--border-color, #d8c2b8);
    }

    .logo-link {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo {
      width: 32px;
      height: 32px;
    }

    .notification-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: var(--text-muted, #6b5b52);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      transition: background 0.2s ease;
    }

    .notification-btn:hover {
      background: var(--bg-secondary, #efe1d7);
    }

    .notification-badge {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 8px;
      height: 8px;
      background: var(--brand, #800020);
      border-radius: 50%;
      border: 2px solid var(--bg-primary, #f8f0e9);
    }

    /* Dark mode */
    :host-context(.dark) .app-header {
      background: var(--bg-primary, #0a0a0a);
      border-bottom-color: var(--border-color, #2a2a2a);
    }

    :host-context(.dark) .user-btn {
      background: var(--bg-secondary, #1a1a1a);
      color: var(--text-primary, #e6d5cc);
    }

    :host-context(.dark) .notification-btn:hover {
      background: var(--bg-secondary, #1a1a1a);
    }

    /* Desktop hide - only show on mobile/tablet */
    @media (min-width: 1024px) {
      .app-header {
        display: none;
      }
    }
  `],
  template: `
    @if (pwaService.isAppMode()) {
      <header class="app-header">
        <div class="header-left">
          <button 
            class="user-btn" 
            (click)="openUserMenu()"
            [attr.aria-label]="'Open user menu for ' + userName()"
          >
            {{ userInitials() }}
          </button>
        </div>

        <div class="header-center">
          <a routerLink="/home" class="logo-link" aria-label="NaijasPride Home">
            <svg class="logo" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="8" fill="#800020"/>
              <path d="M12 30V10H16L24 22V10H28V30H24L16 18V30H12Z" fill="white"/>
            </svg>
          </a>
        </div>

        <div class="header-right">
          <button class="notification-btn" aria-label="Notifications">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 01-3.46 0"></path>
            </svg>
            <span class="notification-badge"></span>
          </button>
        </div>
      </header>
    }
  `
})
export class AppHeaderComponent {
  authService = inject(AuthService);
  pwaService = inject(PwaService);
  
  openMenu = output<void>();

  userName = signal('Guest');
  userInitials = signal('G');

  constructor() {
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        const name = user.name || user.email?.split('@')[0] || 'Guest';
        this.userName.set(name);
        this.userInitials.set(name.charAt(0).toUpperCase());
      }
    });
  }

  openUserMenu(): void {
    this.openMenu.emit();
  }
}
