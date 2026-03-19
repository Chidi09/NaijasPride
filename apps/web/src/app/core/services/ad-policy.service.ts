import { Injectable, computed, inject, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthStateService } from '../auth/auth-state.service';

@Injectable({
  providedIn: 'root'
})
export class AdPolicyService {
  private authState = inject(AuthStateService);
  private router = inject(Router);

  private readonly adBlacklist = [
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/verify-email',
    '/profile',
    '/profile/settings',
    '/payment-callback',
    '/admin'
  ];

  private readonly socialBarBlacklist = [
    '/',
    '/home',
    '/admin',
    '/profile',
    '/library',
    '/downloads',
    '/search',
    '/account',
    '/settings',
    '/premium',
    '/auth',
    '/privacy',
    '/terms',
    '/cookies',
    '/help',
    '/contact',
    '/faq',
    '/jobs',
    '/corporate',
    '/media',
    '/investors',
    '/ways-to-watch'
  ];

  private readonly socialBarAllowedPatterns: RegExp[] = [
    /^\/movies\/[^/]+\/watch(?:$|[/?#])/,
    /^\/watch\/[^/]+(?:$|[/?#])/,
    /^\/tv-shows\/[^/]+\/watch(?:$|[/?#])/,
    /^\/anime\/[^/]+\/watch\/[^/]+(?:$|[/?#])/,
    /^\/books\/novel\/[^/]+\/read(?:$|[/?#])/,
    /^\/books\/(?:manga|comics)\/[^/]+\/read\/[^/]+(?:$|[/?#])/
  ];

  private currentUrl = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => (event as NavigationEnd).urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  readonly isPremium = computed(() => this.authState.isPremium());
  
  readonly isBlacklistedPage = computed(() => {
    const url = this.currentUrl();
    return this.adBlacklist.some(path => url.startsWith(path));
  });

  readonly canShowAds = computed(() => !this.isPremium() && !this.isBlacklistedPage());

  readonly canShowSocialBarAds = computed(() => {
    if (this.isPremium() || this.isBlacklistedPage()) {
      return false;
    }

    const url = this.normalizeUrl(this.currentUrl());
    const isBlacklisted = this.socialBarBlacklist.some(path =>
      path === '/' ? url === '/' : url.startsWith(path)
    );
    if (isBlacklisted) {
      return false;
    }

    return this.socialBarAllowedPatterns.some((pattern) => pattern.test(url));
  });

  private normalizeUrl(url: string): string {
    const source = (url || '/').trim();
    const withoutQuery = source.split('?')[0] || '/';
    const withoutHash = withoutQuery.split('#')[0] || '/';
    return withoutHash || '/';
  }
}
