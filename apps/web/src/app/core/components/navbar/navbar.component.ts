import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo.component';
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component';
import { WatchApiService } from '../../../features/watch/services/watch-api.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, BrandLogoComponent, ThemeToggleComponent],
  templateUrl: './navbar.component.html'
})
export class NavbarComponent {
  scrolled = false;
  mobileMenuOpen = signal(false);
  notificationsOpen = signal(false);

  notificationsLoading = signal(false);
  notifications = signal<Array<{ text: string; routerLink?: any[] }>>([]);

  auth = inject(AuthService);
  private watchApi = inject(WatchApiService);

  @HostListener('window:scroll')
  onWindowScroll() {
    this.scrolled = window.scrollY > 50;
  }

  toggleNotifications() {
    const next = !this.notificationsOpen();
    this.notificationsOpen.set(next);
    if (next) {
      this.loadNotifications();
    }
  }

  private loadNotifications() {
    if (!this.auth.currentUser()) {
      this.notifications.set([
        { text: 'Sign in to see your watch progress', routerLink: ['/login'] },
      ]);
      return;
    }

    this.notificationsLoading.set(true);
    this.watchApi.getWatchHistory({ page: 1, limit: 4 }).subscribe({
      next: (response) => {
        const items = (response.data || [])
          .filter((entry) => (entry.progressPercentage ?? 0) > 0 && (entry.progressPercentage ?? 0) < 95)
          .slice(0, 3)
          .map((entry) => ({
            text: `Continue watching: ${entry.movie.title}`,
            routerLink: ['/watch', entry.movie.id],
          }));

        const fallback = items.length
          ? []
          : [{ text: 'No in-progress videos yet. Start watching something.' as const, routerLink: ['/movies'] }];

        this.notifications.set([
          ...items,
          ...fallback,
          { text: 'Explore movies', routerLink: ['/movies'] },
          { text: 'Open manga library', routerLink: ['/books/manga'] },
        ]);
        this.notificationsLoading.set(false);
      },
      error: () => {
        this.notifications.set([
          { text: 'Unable to load notifications right now', routerLink: ['/profile'] },
        ]);
        this.notificationsLoading.set(false);
      },
    });
  }
}
