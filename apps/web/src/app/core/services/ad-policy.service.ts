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
}
