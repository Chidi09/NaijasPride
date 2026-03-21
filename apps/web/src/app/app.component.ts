import { Component, OnInit, inject, viewChild, effect } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { NavbarComponent } from './core/components/navbar/navbar.component';
import { SiteFooterComponent } from './core/components/site-footer/site-footer.component';
import { BottomNavComponent } from './core/components/bottom-nav/bottom-nav.component';
import { AppHeaderComponent } from './core/components/app-header/app-header.component';
import { SidePanelComponent } from './core/components/side-panel/side-panel.component';
import { PwaInstallPromptComponent } from './core/components/pwa-install-prompt/pwa-install-prompt.component';
import { ReaderStateService } from './core/services/reader-state.service';
import { ThemeService } from './core/services/theme.service';
import { PwaService } from './core/services/pwa.service';
import { FirebaseMessagingService } from './core/services/firebase-messaging.service';
import { AuthStateService } from './core/auth/auth-state.service';
import { AdPolicyService } from './core/services/ad-policy.service';
import { AdScriptService } from './core/services/ad-script.service';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';
import { CookieConsentComponent } from './shared/components/cookie-consent/cookie-consent.component';
import { BackButtonComponent } from './shared/components/back-button/back-button.component';
import { MiniPlayerComponent } from './features/music/components/mini-player/mini-player.component';
import { MusicPlayerService } from './features/music/services/music-player.service';
import { MilestoneCelebrationComponent } from './shared/components/milestone-celebration/milestone-celebration.component';
import { CinemaSplashComponent } from './shared/components/cinema-splash/cinema-splash.component';
import { AccessibilityPanelComponent } from './shared/components/accessibility-panel/accessibility-panel.component';
import { UserPreferencesService } from './core/services/user-preferences.service';
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
    PwaInstallPromptComponent,
    MilestoneCelebrationComponent,
    CinemaSplashComponent,
    AccessibilityPanelComponent
  ],
  template: `
    <div class="min-h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] transition-colors duration-300">

      <!-- ═══════════════════════════════════════════════════════ -->
      <!-- WEB MODE: Classic Navbar (hidden in PWA/app mode)      -->
      <!-- ═══════════════════════════════════════════════════════ -->
      @if (!readerState.navbarHidden() && !readerState.homePageActive() && !pwaService.isAppMode()) {
        <app-navbar />
      }

      <!-- ═══════════════════════════════════════════════════════ -->
      <!-- APP MODE: Compact header (PWA/standalone only)         -->
      <!-- Hidden on md+ where the side rail provides enough nav  -->
      <!-- ═══════════════════════════════════════════════════════ -->
      @if (pwaService.isAppMode() && !readerState.navbarHidden() && !readerState.homePageActive()) {
        <app-app-header (openMenu)="openSidePanel()" />
      }

      <!-- ═══════════════════════════════════════════════════════ -->
      <!-- MAIN CONTENT                                           -->
      <!-- Padding accounts for:                                  -->
      <!--   Web mode: pt-16 for fixed navbar                    -->
      <!--   App mobile: pt-14 for app-header, pb-24 for bottom  -->
      <!--   App tablet+: md:pl-20 for left side rail             -->
      <!-- ═══════════════════════════════════════════════════════ -->
      <main 
        class="flex-1" 
        [class.pt-16]="!readerState.navbarHidden() && !readerState.homePageActive() && !pwaService.isAppMode()"
        [class.pt-14]="pwaService.isAppMode() && !readerState.navbarHidden() && !readerState.homePageActive()"
        [class.pb-24]="pwaService.isAppMode() && !hideBottomNav && !readerState.homePageActive()"
        [class.md:pb-0]="pwaService.isAppMode()"
        [class.md:pl-20]="pwaService.isAppMode() && !readerState.homePageActive()"
      >
        <router-outlet />
      </main>

      <!-- Back Button (PWA/TV mode, non-home pages) -->
      <!-- The back-button component handles its own fixed positioning -->
      @if (pwaService.isAppMode() && !readerState.navbarHidden() && !readerState.homePageActive()) {
        <app-back-button />
      }

      <!-- ═══════════════════════════════════════════════════════ -->
      <!-- WEB MODE: Classic Footer                               -->
      <!-- Hidden in PWA mode, reader mode, and on app pages      -->
      <!-- when user is logged in                                 -->
      <!-- ═══════════════════════════════════════════════════════ -->
      @if (showFooter()) {
        <app-site-footer />
      }

      <!-- ═══════════════════════════════════════════════════════ -->
      <!-- APP MODE: Bottom Nav (mobile) / Side Rail (tablet+)    -->
      <!-- ═══════════════════════════════════════════════════════ -->
      @if (pwaService.isAppMode() && !readerState.navbarHidden() && !readerState.homePageActive()) {
        <app-bottom-nav #bottomNav />
      }

      <!-- Side Panel for User Menu (always available) -->
      <app-side-panel #sidePanel (closed)="onSidePanelClose()" />

      <!-- PWA Install Prompt (shows on web, not in standalone) -->
      @if (!pwaService.isAppMode()) {
        <app-pwa-install-prompt />
      }

      <app-toast-container />
      <app-cookie-consent />
      <app-milestone-celebration />
      <app-accessibility-panel #a11yPanel />

      <!-- Cinema splash for first-time visitors -->
      @if (showSplash) {
        <app-cinema-splash (dismissed)="showSplash = false" />
      }

      <!-- Global Mini-player: show only when there's an active track -->
      @if (musicPlayer.currentTrack()) {
        <app-mini-player />
      }
    </div>
  `
})
export class AppComponent implements OnInit {
  private themeService = inject(ThemeService);
  private firebaseMessaging = inject(FirebaseMessagingService);
  protected pwaService = inject(PwaService);
  private router = inject(Router);

  protected readerState = inject(ReaderStateService);
  protected musicPlayer = inject(MusicPlayerService);
  private authState = inject(AuthStateService);
  private adPolicy = inject(AdPolicyService);
  private adScriptService = inject(AdScriptService);
  private userPrefs = inject(UserPreferencesService);

  private sidePanel = viewChild<SidePanelComponent>('sidePanel');
  private bottomNav = viewChild<BottomNavComponent>('bottomNav');

  hideBottomNav = false;
  showSplash = !this.userPrefs.hasSeenOnboarding();
  private readonly defaultViewportContent = 'width=device-width, initial-scale=1';
  private readonly lockedViewportContent =
    'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

  // App pages where the footer should be hidden for logged-in users
  private readonly APP_ROUTES = ['/home', '/movies', '/tv-shows', '/books', '/music', '/browse', '/watch', '/admin', '/profile', '/account', '/settings', '/search', '/library', '/downloads'];

  constructor() {
    effect(() => {
      const shouldLockViewport = this.pwaService.isAppMode() && !!this.authState.currentUser();
      this.applyAppViewportMode(shouldLockViewport);
    });

    effect(() => {
      const canShowAds = this.adPolicy.canShowAds();
      if (canShowAds) {
        this.adScriptService.ensureAdSenseAutoAdsScript();
      } else {
        this.adScriptService.unloadAllAdScripts();
      }
    });

    effect(() => {
      const canShowSocialBarAds = this.adPolicy.canShowSocialBarAds();
      if (canShowSocialBarAds) {
        this.adScriptService.ensureEffectiveGateSocialBarScript();
      } else {
        this.adScriptService.unloadEffectiveGateSocialBarScript();
      }
    });
  }

  protected showFooter(): boolean {
    if (this.readerState.navbarHidden() || this.pwaService.isAppMode()) return false;
    const url = this.router.url;
    const isAppPage = this.APP_ROUTES.some(r => url.startsWith(r));
    if (isAppPage && this.authState.currentUser()) return false;
    return true;
  }

  ngOnInit() {
    this.themeService.init();

    const initializeMessaging = () => {
      void this.firebaseMessaging.init();
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (cb: () => void, options?: { timeout: number }) => number })
        .requestIdleCallback(initializeMessaging, { timeout: 4000 });
    } else {
      setTimeout(initializeMessaging, 2000);
    }

    if (this.pwaService.isTV()) {
      document.body.classList.add('tv-mode');
    }

    // Listen for route changes to hide/show bottom nav in immersive views
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event) => {
      const navEnd = event as NavigationEnd;
      this.hideBottomNav = this.pwaService.shouldHideBottomNav(navEnd.url);
      
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

  private applyAppViewportMode(locked: boolean): void {
    if (typeof document === 'undefined') return;

    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      viewportMeta.setAttribute('content', locked ? this.lockedViewportContent : this.defaultViewportContent);
    }

    document.body.classList.toggle('app-shell-locked', locked);
    document.documentElement.classList.toggle('app-shell-locked', locked);
  }
}
