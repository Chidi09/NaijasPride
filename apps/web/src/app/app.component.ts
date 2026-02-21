import { Component, OnInit, inject, viewChild, effect } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { NavbarComponent } from './core/components/navbar/navbar.component';
import { SiteFooterComponent } from './core/components/site-footer/site-footer.component';
import { BottomNavComponent } from './core/components/bottom-nav/bottom-nav.component';
import { AppHeaderComponent } from './core/components/app-header/app-header.component';
import { SidePanelComponent } from './core/components/side-panel/side-panel.component';
import { PwaInstallPromptComponent } from './core/components/pwa-install-prompt/pwa-install-prompt.component';
import { DeviceService } from './core/services/device.service';
import { ReaderStateService } from './core/services/reader-state.service';
import { ThemeService } from './core/services/theme.service';
import { PwaService } from './core/services/pwa.service';
import { FirebaseMessagingService } from './core/services/firebase-messaging.service';
import { AuthStateService } from './core/auth/auth-state.service';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';
import { CookieConsentComponent } from './shared/components/cookie-consent/cookie-consent.component';
import { BackButtonComponent } from './shared/components/back-button/back-button.component';
import { MiniPlayerComponent } from './features/music/components/mini-player/mini-player.component';
import { MusicPlayerService } from './features/music/services/music-player.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet, 
    NavbarComponent, 
    SiteFooterComponent, 
    ToastContainerComponent, 
    CookieConsentComponent, 
    BackButtonComponent,
    MiniPlayerComponent,
    BottomNavComponent,
    AppHeaderComponent,
    SidePanelComponent,
    PwaInstallPromptComponent
  ],
  template: `
    <div class="min-h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] transition-colors duration-300">
      <!-- Classic Navbar (hidden in PWA/app mode) -->
      @if (!readerState.navbarHidden() && !pwaService.isAppMode()) {
        <app-navbar />
      }

      <!-- App Header (PWA mode only) -->
      @if (pwaService.isAppMode()) {
        <app-app-header (openMenu)="openSidePanel()" />
      }

      <main 
        class="flex-1" 
        [class.pt-16]="!readerState.navbarHidden() && !pwaService.isAppMode()"
        [class.pt-14]="pwaService.isAppMode()"
        [class.pb-24]="pwaService.isAppMode() && !hideBottomNav"
      >
        <router-outlet />
      </main>

      <!-- Back Button (PWA/TV mode, non-home pages) -->
      @if (pwaService.isAppMode()) {
        <div class="fixed left-4 top-20 z-40">
          <app-back-button />
        </div>
      }

      <!-- Classic Footer (hidden in PWA mode and on app pages when logged in) -->
      @if (showFooter()) {
        <app-site-footer />
      }

      <!-- Bottom Navigation (PWA mode only) -->
      @if (pwaService.isAppMode()) {
        <app-bottom-nav #bottomNav />
      }

      <!-- Side Panel for User Menu -->
      <app-side-panel #sidePanel (closed)="onSidePanelClose()" />

      <!-- PWA Install Prompt -->
      <app-pwa-install-prompt />

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
  private firebaseMessaging = inject(FirebaseMessagingService);
  protected pwaService = inject(PwaService);
  private router = inject(Router);
  
  protected readerState = inject(ReaderStateService);
  protected musicPlayer = inject(MusicPlayerService);
  private authState = inject(AuthStateService);
  
  private sidePanel = viewChild<SidePanelComponent>('sidePanel');
  private bottomNav = viewChild<BottomNavComponent>('bottomNav');
  
  hideBottomNav = false;

  // App pages where the footer should be hidden for logged-in users
  private readonly APP_ROUTES = ['/home', '/movies', '/books', '/music', '/manga', '/browse', '/watch', '/admin', '/profile', '/account', '/settings', '/search', '/library', '/downloads'];

  protected showFooter(): boolean {
    if (this.readerState.navbarHidden() || this.pwaService.isAppMode()) return false;
    // Hide footer on app pages when user is logged in
    const url = this.router.url;
    const isAppPage = this.APP_ROUTES.some(r => url.startsWith(r));
    if (isAppPage && this.authState.currentUser()) return false;
    return true;
  }

  ngOnInit() {
    this.themeService.init();
    void this.firebaseMessaging.init();

    if (this.deviceService.isTV()) {
      document.body.classList.add('tv-mode');
    }

    // Listen for route changes to hide/show bottom nav
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event) => {
      const navEnd = event as NavigationEnd;
      this.hideBottomNav = this.pwaService.shouldHideBottomNav(navEnd.url);
      
      // Update bottom nav visibility
      const nav = this.bottomNav();
      if (nav) {
        if (this.hideBottomNav) {
          nav.hide();
        } else {
          nav.show();
        }
      }
    });
  }

  openSidePanel(): void {
    this.sidePanel()?.open();
  }

  onSidePanelClose(): void {
    // Handle any cleanup when side panel closes
  }
}
