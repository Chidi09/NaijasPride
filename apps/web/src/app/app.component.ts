import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './core/components/navbar/navbar.component';
import { SiteFooterComponent } from './core/components/site-footer/site-footer.component';
import { DeviceService } from './core/services/device.service';
import { ReaderStateService } from './core/services/reader-state.service';
import { ThemeService } from './core/services/theme.service';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';
import { CookieConsentComponent } from './shared/components/cookie-consent/cookie-consent.component';
import { MiniPlayerComponent } from './features/music/components/mini-player/mini-player.component';
import { MusicPlayerService } from './features/music/services/music-player.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, SiteFooterComponent, ToastContainerComponent, CookieConsentComponent, MiniPlayerComponent],
  template: `
    <div class="min-h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] transition-colors duration-300">
      @if (!readerState.navbarHidden()) {
        <app-navbar />
      }

      <main class="flex-1" [class.pt-16]="!readerState.navbarHidden()">
        <router-outlet />
      </main>

      @if (!readerState.navbarHidden()) {
        <app-site-footer />
      }

      <app-toast-container />
      <app-cookie-consent />

      <!-- Mini-player: show only when there's an active track -->
      @if (musicPlayer.currentTrack()) {
        <app-mini-player />
      }
    </div>
  `
})
export class AppComponent implements OnInit {
  private deviceService = inject(DeviceService);
  private themeService = inject(ThemeService);
  protected readerState = inject(ReaderStateService);
  protected musicPlayer = inject(MusicPlayerService);

  ngOnInit() {
    this.themeService.init();

    if (this.deviceService.isTV()) {
      document.body.classList.add('tv-mode');
    }
  }
}
