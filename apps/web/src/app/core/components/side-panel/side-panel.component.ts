import { Component, inject, signal, output, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-side-panel',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [`
    :host {
      display: block;
    }

    .side-panel-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 100;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s ease, visibility 0.3s ease;
    }

    .side-panel-overlay.open {
      opacity: 1;
      visibility: visible;
    }

    .side-panel {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      width: 280px;
      max-width: 85vw;
      background: var(--bg-primary, #f8f0e9);
      z-index: 101;
      transform: translateX(-100%);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .side-panel.open {
      transform: translateX(0);
    }

    .panel-header {
      padding: 20px;
      border-bottom: 1px solid var(--border-color, #d8c2b8);
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .user-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--brand, #800020);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
      font-size: 18px;
    }

    .user-details {
      flex: 1;
      min-width: 0;
    }

    .user-name {
      font-weight: 600;
      color: var(--text-primary, #24181b);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-email {
      font-size: 12px;
      color: var(--text-muted, #6b5b52);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .close-btn {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: var(--text-muted, #6b5b52);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s ease;
    }

    .close-btn:hover {
      background: var(--bg-secondary, #efe1d7);
    }

    .panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px 0;
    }

    .menu-section {
      margin-bottom: 24px;
    }

    .section-title {
      padding: 0 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted, #6b5b52);
      margin-bottom: 8px;
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 20px;
      color: var(--text-primary, #24181b);
      text-decoration: none;
      transition: background 0.2s ease;
      cursor: pointer;
    }

    .menu-item:hover {
      background: var(--bg-secondary, #efe1d7);
    }

    .menu-icon {
      width: 20px;
      height: 20px;
      color: var(--text-muted, #6b5b52);
    }

    .menu-text {
      flex: 1;
      font-size: 14px;
    }

    .toggle-switch {
      position: relative;
      width: 44px;
      height: 24px;
      background: var(--border-color, #d8c2b8);
      border-radius: 12px;
      transition: background 0.3s ease;
      cursor: pointer;
    }

    .toggle-switch.active {
      background: var(--brand, #800020);
    }

    .toggle-knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      background: white;
      border-radius: 50%;
      transition: transform 0.3s ease;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .toggle-switch.active .toggle-knob {
      transform: translateX(20px);
    }

    .panel-footer {
      padding: 16px 20px;
      border-top: 1px solid var(--border-color, #d8c2b8);
    }

    .logout-btn {
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
      padding: 12px;
      border: none;
      background: transparent;
      color: #dc2626;
      font-size: 14px;
      cursor: pointer;
      border-radius: 8px;
      transition: background 0.2s ease;
    }

    .logout-btn:hover {
      background: rgba(220, 38, 38, 0.1);
    }

    /* Dark mode */
    :host-context(.dark) .side-panel {
      background: var(--bg-primary, #0a0a0a);
    }

    :host-context(.dark) .panel-header,
    :host-context(.dark) .panel-footer {
      border-color: var(--border-color, #2a2a2a);
    }

    :host-context(.dark) .menu-item:hover {
      background: var(--bg-secondary, #1a1a1a);
    }
  `],
  template: `
    <div 
      class="side-panel-overlay"
      [class.open]="isOpen()"
      (click)="close()"
    ></div>

    <aside class="side-panel" [class.open]="isOpen()">
      <button class="close-btn" (click)="close()" aria-label="Close menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <!-- User Header -->
      <div class="panel-header">
        <div class="user-info">
          <div class="user-avatar">
            {{ getUserInitials() }}
          </div>
          <div class="user-details">
            <div class="user-name">{{ userName() }}</div>
            <div class="user-email">{{ userEmail() }}</div>
          </div>
        </div>
      </div>

      <!-- Menu Content -->
      <div class="panel-content">
        <!-- Quick Actions -->
        <div class="menu-section">
          <div class="section-title">Quick Actions</div>
          
          <a class="menu-item" routerLink="/profile" (click)="close()">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span class="menu-text">My Profile</span>
          </a>

          <a class="menu-item" routerLink="/profile" (click)="close()">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
            </svg>
            <span class="menu-text">My Library</span>
          </a>

          <a class="menu-item" routerLink="/downloads" (click)="close()">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span class="menu-text">Downloads</span>
          </a>
        </div>

        <!-- Preferences -->
        <div class="menu-section">
          <div class="section-title">Preferences</div>
          
          <div class="menu-item" (click)="toggleTheme()">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
            <span class="menu-text">Dark Mode</span>
            <div class="toggle-switch" [class.active]="isDarkMode()">
              <div class="toggle-knob"></div>
            </div>
          </div>

          <a class="menu-item" routerLink="/settings" (click)="close()">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"></path>
            </svg>
            <span class="menu-text">Settings</span>
          </a>
        </div>

        <!-- Support -->
        <div class="menu-section">
          <div class="section-title">Support</div>
          
          <a class="menu-item" routerLink="/help" (click)="close()">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"></path>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span class="menu-text">Help Center</span>
          </a>

          <a class="menu-item" routerLink="/faq" (click)="close()">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <span class="menu-text">FAQ</span>
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div class="panel-footer">
        <button class="logout-btn" (click)="logout()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  `
})
export class SidePanelComponent {
  authService = inject(AuthService);
  themeService = inject(ThemeService);
  
  isOpen = signal(false);
  closed = output<void>();

  userName = signal('Guest');
  userEmail = signal('guest@naijaspride.com');
  isDarkMode = signal(false);

  constructor() {
    // React to auth state changes
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.userName.set(user.name || user.email?.split('@')[0] || 'User');
        this.userEmail.set(user.email || '');
      } else {
        this.userName.set('Guest');
        this.userEmail.set('');
      }
    });

    // React to theme changes
    effect(() => {
      this.isDarkMode.set(this.themeService.theme() === 'dark');
    });
  }

  getUserInitials(): string {
    const name = this.userName();
    if (!name) return 'G';
    return name.charAt(0).toUpperCase();
  }

  open(): void {
    this.isOpen.set(true);
    document.body.style.overflow = 'hidden';
  }

  close(): void {
    this.isOpen.set(false);
    document.body.style.overflow = '';
    this.closed.emit();
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  logout(): void {
    this.close();
    this.authService.logout();
  }
}
