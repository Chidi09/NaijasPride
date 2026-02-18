import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, signal, viewChild, ElementRef, OnInit, OnDestroy } from '@angular/core';
import { RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo.component';
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component';
import { WatchApiService } from '../../../features/watch/services/watch-api.service';

  @Component({
    selector: 'app-navbar',
    standalone: true,
    imports: [CommonModule, RouterLink, RouterLinkActive, ReactiveFormsModule, BrandLogoComponent, ThemeToggleComponent],
    templateUrl: './navbar.component.html'
  })
  export class NavbarComponent implements OnInit, OnDestroy {
    private destroy$ = new Subject<void>();
    private router = inject(Router);
    private fb = inject(FormBuilder);
    searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');
    
    searchForm = this.fb.group({
      query: ['']
    });
    
    showSearchOverlay = signal(false);
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

  ngOnInit() {
    // Update search input based on URL query params
    this.router.events.pipe(
      takeUntil(this.destroy$)
    ).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        const url = new URL(event.url, window.location.origin);
        const searchQuery = url.searchParams.get('q');
        if (searchQuery) {
          this.searchForm.patchValue({ query: searchQuery });
        }
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent) {
    // Cmd/Ctrl + K to focus search
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      this.focusSearch();
    }
    // Escape to close search overlay
    if (event.key === 'Escape') {
      this.showSearchOverlay.set(false);
    }
  }

  focusSearch() {
    this.showSearchOverlay.set(true);
    setTimeout(() => {
      this.searchInput()?.nativeElement?.focus();
    }, 0);
  }

  onSearchSubmit() {
    const query = this.searchForm.value.query?.trim();
    if (query) {
      this.router.navigate(['/browse'], { queryParams: { q: query } });
      this.showSearchOverlay.set(false);
    }
  }

  onSearchInput(event: Event) {
    const query = (event.target as HTMLInputElement).value.trim();
    if (query) {
      this.router.navigate(['/browse'], { queryParams: { q: query } });
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
            routerLink: ['/watch', entry.movie.slug || entry.movie.id],
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
