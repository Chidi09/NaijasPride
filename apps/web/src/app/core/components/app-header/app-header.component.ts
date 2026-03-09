import { Component, ElementRef, HostListener, effect, inject, output, signal } from '@angular/core';
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
      width: 64px;
    }

    .header-right {
      justify-content: flex-end;
      position: relative;
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
      width: 96px;
      height: 28px;
      object-fit: contain;
    }

    .notification-btn {
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
      position: relative;
      transition: background 0.2s ease, transform 0.2s ease;
    }

    .notification-btn:hover {
      background: var(--border-color, #d8c2b8);
      transform: translateY(-1px);
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

    .notifications-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 280px;
      background: var(--bg-card, #fff);
      border: 1px solid var(--border-color, #d8c2b8);
      border-radius: 14px;
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.18);
      overflow: hidden;
      z-index: 55;
    }

    .notifications-head {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-color, #d8c2b8);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted, #6b5b52);
    }

    .notification-item {
      display: block;
      padding: 10px 12px;
      text-decoration: none;
      color: inherit;
      border-bottom: 1px solid color-mix(in srgb, var(--border-color, #d8c2b8) 65%, transparent);
      transition: background 0.2s ease;
    }

    .notification-item:hover {
      background: var(--bg-secondary, #efe1d7);
    }

    .notification-item:last-child {
      border-bottom: 0;
    }

    .notification-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary, #24181b);
    }

    .notification-meta {
      margin-top: 2px;
      font-size: 11px;
      color: var(--text-muted, #6b5b52);
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

    :host-context(.dark) .notification-btn {
      background: var(--bg-secondary, #1a1a1a);
      color: var(--text-primary, #e6d5cc);
    }

    :host-context(.dark) .notifications-dropdown {
      background: #121212;
      border-color: #2a2a2a;
    }

    :host-context(.dark) .notifications-head {
      border-bottom-color: #2a2a2a;
      color: #bcae9e;
    }

    :host-context(.dark) .notification-item {
      border-bottom-color: #2a2a2a;
    }

    :host-context(.dark) .notification-item:hover {
      background: #1c1c1c;
    }

    :host-context(.dark) .notification-title {
      color: #e6e0d4;
    }

    :host-context(.dark) .notification-meta {
      color: #a39287;
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
            <img class="logo" src="assets/images/logo.svg" alt="NaijasPride" />
          </a>
        </div>

        <div class="header-right">
          <button class="notification-btn" (click)="toggleNotifications($event)" aria-label="Notifications">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 01-3.46 0"></path>
            </svg>
            <span class="notification-badge"></span>
          </button>

          @if (showNotifications()) {
            <div class="notifications-dropdown" (click)="$event.stopPropagation()">
              <div class="notifications-head">Notifications</div>

              @for (item of notifications(); track item.id) {
                <a class="notification-item" [routerLink]="item.link" (click)="closeNotifications()">
                  <div class="notification-title">{{ item.title }}</div>
                  <div class="notification-meta">{{ item.meta }}</div>
                </a>
              }
            </div>
          }
        </div>
      </header>
    }
  `
})
export class AppHeaderComponent {
  authService = inject(AuthService);
  pwaService = inject(PwaService);
  private host = inject(ElementRef<HTMLElement>);
  
  openMenu = output<void>();

  userName = signal('Guest');
  userInitials = signal('G');
  showNotifications = signal(false);
  notifications = signal([
    { id: 'n1', title: 'Fresh movies dropped', meta: 'New stream and embed titles are now live.', link: '/movies' },
    { id: 'n2', title: 'Your library is ready', meta: 'Pick up from where you stopped watching.', link: '/library' },
    { id: 'n3', title: 'Discover trending music', meta: 'New charting tracks have landed.', link: '/music' },
  ]);

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        const name = user.name || user.email?.split('@')[0] || 'Guest';
        this.userName.set(name);
        this.userInitials.set(name.charAt(0).toUpperCase());
      } else {
        this.userName.set('Guest');
        this.userInitials.set('G');
      }
    }, { allowSignalWrites: true });
  }

  openUserMenu(): void {
    this.openMenu.emit();
  }

  toggleNotifications(event: Event): void {
    event.stopPropagation();
    this.showNotifications.update((current) => !current);
  }

  closeNotifications(): void {
    this.showNotifications.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.showNotifications()) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (!this.host.nativeElement.contains(target)) {
      this.showNotifications.set(false);
    }
  }
}
