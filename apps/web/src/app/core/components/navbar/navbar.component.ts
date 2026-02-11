import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo.component';
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component';

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
  notifications = signal<string[]>([
    'New Nollywood uploads from your channels',
    'Continue watching where you stopped',
    'Fresh manga chapters are now available',
  ]);
  auth = inject(AuthService);

  @HostListener('window:scroll')
  onWindowScroll() {
    this.scrolled = window.scrollY > 50;
  }
}
