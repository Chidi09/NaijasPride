import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo.component';
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component';
import { AccessibilityPanelComponent } from '../../../shared/components/accessibility-panel/accessibility-panel.component';
import { UserPreferencesService } from '../../services/user-preferences.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, ReactiveFormsModule, BrandLogoComponent, ThemeToggleComponent],
  templateUrl: './navbar.component.html',
})
export class NavbarComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private router = inject(Router);
  private fb = inject(FormBuilder);

  auth = inject(AuthService);
  private userPrefs = inject(UserPreferencesService);
  searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  searchForm = this.fb.group({
    query: [''],
  });

  showSearchOverlay = signal(false);
  mobileMenuOpen = signal(false);
  scrolled = false;

  @HostListener('window:scroll')
  onWindowScroll() {
    this.scrolled = window.scrollY > 8;
  }

  ngOnInit() {
    this.router.events.pipe(takeUntil(this.destroy$)).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        const url = new URL(event.urlAfterRedirects, window.location.origin);
        const searchQuery = url.searchParams.get('q');
        this.searchForm.patchValue({ query: searchQuery ?? '' }, { emitEvent: false });
        this.mobileMenuOpen.set(false);
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.focusSearch();
    }

    if (event.key === 'Escape') {
      this.showSearchOverlay.set(false);
      this.mobileMenuOpen.set(false);
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
    this.router.navigate(['/search'], {
      queryParams: query ? { q: query } : {},
    });
    this.showSearchOverlay.set(false);
  }

  openAccessibility() {
    this.userPrefs.openAccessibilityPanel();
  }

  closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }
}
