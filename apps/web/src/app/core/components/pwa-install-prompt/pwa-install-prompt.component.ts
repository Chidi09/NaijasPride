import { Component, OnInit, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PwaService } from '../../services/pwa.service';

@Component({
  selector: 'app-pwa-install-prompt',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (showPrompt()) {
      <!-- Backdrop overlay -->
      <div 
        class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        [class.opacity-0]="!isVisible()"
        [class.opacity-100]="isVisible()"
        (click)="dismissPrompt()"
      ></div>
      
      <!-- Sheet panel -->
      <div 
        class="fixed z-[101] bottom-0 left-0 w-full md:w-[400px] md:left-1/2 md:-translate-x-1/2 md:bottom-6 
               bg-[var(--bg-primary)] rounded-t-3xl md:rounded-3xl shadow-2xl border border-[var(--border-color)] 
               overflow-hidden transition-transform duration-500 ease-out"
        [class.translate-y-0]="isVisible()"
        [class.translate-y-full]="!isVisible()"
      >
        <!-- Drag handle (mobile only) -->
        <div class="w-full flex justify-center pt-3 pb-1 md:hidden">
          <div class="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
        </div>

        <div class="p-6 md:p-8 flex flex-col items-center text-center">
          
          <!-- App icon -->
          <div class="w-20 h-20 mb-4 rounded-2xl shadow-lg bg-[var(--brand)] flex items-center justify-center border border-[var(--border-color)] overflow-hidden">
            <img src="assets/icons/android-chrome-192x192.png" alt="NaijasPride App" class="w-full h-full object-cover"
                 onerror="this.style.display='none'; this.parentElement.innerHTML='<svg viewBox=&quot;0 0 40 40&quot; class=&quot;w-12 h-12&quot;><path d=&quot;M12 30V10H16L24 22V10H28V30H24L16 18V30H12Z&quot; fill=&quot;white&quot;/></svg>'">
          </div>

          <h2 class="text-xl font-serif font-bold text-[var(--text-primary)] mb-2">Install NaijasPride</h2>
          
          @if (!isIOS()) {
            <p class="text-sm text-[var(--text-muted)] mb-6 font-sans leading-relaxed">
              Add our app to your home screen for an optimized, ad-free experience. Stream faster, download for offline, and access anywhere.
            </p>

            <!-- Value propositions -->
            <ul class="w-full text-left space-y-3 mb-8">
              <li class="flex items-center text-sm font-sans text-[var(--text-primary)]">
                <svg class="w-5 h-5 mr-3 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                One-tap access from Home Screen
              </li>
              <li class="flex items-center text-sm font-sans text-[var(--text-primary)]">
                <svg class="w-5 h-5 mr-3 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                Full-screen immersive streaming
              </li>
              <li class="flex items-center text-sm font-sans text-[var(--text-primary)]">
                <svg class="w-5 h-5 mr-3 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                Offline manga & book reading
              </li>
            </ul>

            <!-- Action buttons -->
            <div class="w-full flex flex-col gap-3">
              <button 
                (click)="installApp()" 
                [disabled]="isInstalling()"
                class="w-full py-3.5 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white rounded-xl font-bold tracking-wide transition-colors shadow-md flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                @if (isInstalling()) {
                  <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                  Installing...
                } @else {
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  Install App
                }
              </button>
              <button 
                (click)="dismissPrompt()" 
                class="w-full py-3.5 bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] font-semibold rounded-xl transition-colors"
              >
                Maybe Later
              </button>
            </div>
          } @else {
            <!-- iOS Instructions -->
            <p class="text-sm text-[var(--text-muted)] mb-6 font-sans leading-relaxed">
              Install NaijasPride on your device for the best experience.
            </p>
            
            <div class="w-full bg-[var(--bg-secondary)] rounded-2xl p-5 mb-6 text-left">
              <ol class="space-y-4 text-sm font-sans text-[var(--text-primary)]">
                <li class="flex items-start gap-3">
                  <span class="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--brand)] text-white text-xs font-bold flex items-center justify-center">1</span>
                  <span>Tap the <strong>Share</strong> button
                    <svg class="inline w-4 h-4 mx-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
                    in your browser toolbar
                  </span>
                </li>
                <li class="flex items-start gap-3">
                  <span class="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--brand)] text-white text-xs font-bold flex items-center justify-center">2</span>
                  <span>Scroll down and tap <strong>"Add to Home Screen"</strong></span>
                </li>
                <li class="flex items-start gap-3">
                  <span class="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--brand)] text-white text-xs font-bold flex items-center justify-center">3</span>
                  <span>Tap <strong>"Add"</strong> to confirm</span>
                </li>
              </ol>
            </div>

            <button 
              (click)="dismissPrompt()" 
              class="w-full py-3.5 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white rounded-xl font-bold tracking-wide transition-colors shadow-md"
            >
              Got it
            </button>
          }
        </div>
      </div>
    }
  `
})
export class PwaInstallPromptComponent implements OnInit {
  private pwaService = inject(PwaService);

  showPrompt = signal(false);
  isVisible = signal(false);
  isInstalling = signal(false);
  isIOS = signal(false);

  @HostListener('window:beforeinstallprompt', ['$event'])
  onBeforeInstallPrompt(e: Event) {
    e.preventDefault();
    // Stash the event for later use via the PwaService (already captured there)
    
    const hasDismissed = this.checkDismissed();
    if (!hasDismissed) {
      // Small delay so it doesn't punch users in the face on load
      setTimeout(() => {
        this.showPrompt.set(true);
        // Trigger the entrance animation after DOM renders
        requestAnimationFrame(() => {
          this.isVisible.set(true);
        });
      }, 3000);
    }
  }

  ngOnInit() {
    // Already in standalone mode? Don't show anything
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      this.showPrompt.set(false);
      return;
    }

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.isIOS.set(isIOSDevice);

    // Show iOS instructions if on iOS and not dismissed
    if (isIOSDevice && !this.checkDismissed()) {
      setTimeout(() => {
        this.showPrompt.set(true);
        requestAnimationFrame(() => {
          this.isVisible.set(true);
        });
      }, 3000);
    }

    // For non-iOS, also check if install prompt is already available via service
    if (!isIOSDevice && this.pwaService.state().canInstall && !this.checkDismissed()) {
      setTimeout(() => {
        this.showPrompt.set(true);
        requestAnimationFrame(() => {
          this.isVisible.set(true);
        });
      }, 3000);
    }
  }

  async installApp(): Promise<void> {
    this.isInstalling.set(true);
    
    const installed = await this.pwaService.installApp();
    this.isInstalling.set(false);

    if (installed) {
      this.hidePrompt();
    } else {
      // User declined native prompt
      this.hidePrompt();
      this.setDismissedState();
    }
  }

  dismissPrompt(): void {
    this.hidePrompt();
    this.setDismissedState();
  }

  private hidePrompt(): void {
    this.isVisible.set(false);
    // Wait for the slide-out animation to finish before removing from DOM
    setTimeout(() => {
      this.showPrompt.set(false);
    }, 500);
  }

  private setDismissedState(): void {
    // Don't bother them again for 7 days
    const expiry = new Date().getTime() + (7 * 24 * 60 * 60 * 1000);
    localStorage.setItem('naijaspride-pwa-dismissed', expiry.toString());
  }

  private checkDismissed(): boolean {
    const dismissed = localStorage.getItem('naijaspride-pwa-dismissed');
    if (!dismissed) return false;
    
    const expiry = parseInt(dismissed, 10);
    if (isNaN(expiry)) return false;
    
    // If the dismissal has expired, clear it and allow showing again
    if (new Date().getTime() > expiry) {
      localStorage.removeItem('naijaspride-pwa-dismissed');
      return false;
    }
    
    return true;
  }
}
