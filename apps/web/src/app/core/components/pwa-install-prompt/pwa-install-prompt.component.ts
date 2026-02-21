import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PwaService } from '../../services/pwa.service';

@Component({
  selector: 'app-pwa-install-prompt',
  standalone: true,
  imports: [CommonModule],
  styles: [`
    :host {
      display: block;
    }

    .install-prompt {
      position: fixed;
      bottom: 80px;
      left: 16px;
      right: 16px;
      background: var(--bg-card, #ffffff);
      border: 1px solid var(--border-color, #d8c2b8);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      z-index: 60;
      animation: slideUp 0.3s ease;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .prompt-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 16px;
    }

    .app-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: #800020;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .app-icon svg {
      width: 28px;
      height: 28px;
    }

    .prompt-text {
      flex: 1;
    }

    .prompt-title {
      font-weight: 600;
      font-size: 16px;
      color: var(--text-primary, #24181b);
      margin-bottom: 4px;
    }

    .prompt-subtitle {
      font-size: 13px;
      color: var(--text-muted, #6b5b52);
      line-height: 1.4;
    }

    .close-btn {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: var(--text-muted, #6b5b52);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.2s ease;
    }

    .close-btn:hover {
      background: var(--bg-secondary, #efe1d7);
    }

    .prompt-actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      flex: 1;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
    }

    .btn-secondary {
      background: var(--bg-secondary, #efe1d7);
      color: var(--text-primary, #24181b);
    }

    .btn-secondary:hover {
      background: var(--border-color, #d8c2b8);
    }

    .btn-primary {
      background: var(--brand, #800020);
      color: white;
    }

    .btn-primary:hover {
      background: #660019;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* iOS specific banner */
    .ios-banner {
      bottom: 16px;
      text-align: center;
    }

    .ios-instructions {
      font-size: 14px;
      color: var(--text-primary, #24181b);
      margin-bottom: 8px;
    }

    .ios-icon {
      display: inline-block;
      vertical-align: middle;
      margin: 0 4px;
    }

    /* Dark mode */
    :host-context(.dark) .install-prompt {
      background: var(--bg-card, #1a1a1a);
      border-color: var(--border-color, #2a2a2a);
    }

    :host-context(.dark) .prompt-title {
      color: var(--text-primary, #e6d5cc);
    }

    :host-context(.dark) .prompt-subtitle {
      color: var(--text-muted, #8a7a72);
    }

    :host-context(.dark) .close-btn:hover {
      background: var(--bg-secondary, #2a2a2a);
    }

    :host-context(.dark) .btn-secondary {
      background: var(--bg-secondary, #2a2a2a);
      color: var(--text-primary, #e6d5cc);
    }

    :host-context(.dark) .btn-secondary:hover {
      background: var(--border-color, #3a3a3a);
    }

    :host-context(.dark) .ios-instructions {
      color: var(--text-primary, #e6d5cc);
    }
  `],
  template: `
    @if (showPrompt() && !isDismissed()) {
      <div class="install-prompt" [class.ios-banner]="isIOS()">
        @if (!isIOS()) {
          <div class="prompt-header">
            <div class="app-icon">
              <svg viewBox="0 0 40 40" fill="none">
                <rect width="40" height="40" rx="8" fill="#800020"/>
                <path d="M12 30V10H16L24 22V10H28V30H24L16 18V30H12Z" fill="white"/>
              </svg>
            </div>
            
            <div class="prompt-text">
              <div class="prompt-title">Install NaijasPride</div>
              <div class="prompt-subtitle">Add to your home screen for the best experience</div>
            </div>
            
            <button class="close-btn" (click)="dismiss()" aria-label="Dismiss">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div class="prompt-actions">
            <button class="btn btn-secondary" (click)="dismiss()">Not Now</button>
            <button 
              class="btn btn-primary" 
              (click)="install()"
              [disabled]="isInstalling()"
            >
              @if (isInstalling()) {
                Installing...
              } @else {
                Install App
              }
            </button>
          </div>
        } @else {
          <!-- iOS instructions -->
          <div class="ios-instructions">
            Install this app on your iPhone:
            <br>
            Tap <svg class="ios-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            then "Add to Home Screen"
          </div>
          <button class="close-btn" (click)="dismiss()" aria-label="Dismiss">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        }
      </div>
    }
  `
})
export class PwaInstallPromptComponent {
  pwaService = inject(PwaService);
  
  showPrompt = signal(false);
  isDismissed = signal(false);
  isInstalling = signal(false);
  isIOS = signal(false);

  constructor() {
    // Check if we should show the prompt
    const hasPrompt = this.pwaService.state().canInstall;
    const isStandalone = this.pwaService.state().isStandalone;
    const dismissedBefore = localStorage.getItem('pwa-install-dismissed');
    
    // Show if can install and not already in standalone mode
    this.showPrompt.set(hasPrompt && !isStandalone && !dismissedBefore);
    
    // Check for iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    this.isIOS.set(isIOSDevice);

    // Show iOS instructions if on iOS but not in standalone mode
    if (isIOSDevice && !isStandalone && !dismissedBefore) {
      this.showPrompt.set(true);
    }
  }

  async install(): Promise<void> {
    this.isInstalling.set(true);
    const installed = await this.pwaService.installApp();
    this.isInstalling.set(false);
    
    if (installed) {
      this.showPrompt.set(false);
    }
  }

  dismiss(): void {
    this.isDismissed.set(true);
    localStorage.setItem('pwa-install-dismissed', 'true');
  }
}
