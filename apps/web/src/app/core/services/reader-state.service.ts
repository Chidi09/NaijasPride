import { Injectable, signal } from '@angular/core';

/**
 * Service to manage reader visibility state across the application.
 * When a manga or book is being read, the main navbar should be hidden
 * to provide an immersive reading experience.
 * 
 * Kotatsu behavior:
 * - Navbar is hidden when entering reader
 * - Tap center of screen toggles navbar visibility
 * - Auto-hide after inactivity (optional)
 */
@Injectable({
  providedIn: 'root'
})
export class ReaderStateService {
  /**
   * Signal to track if navbar should be hidden
   * When true, the main app navbar is hidden and reader takes full screen
   */
  navbarHidden = signal(false);

  /**
   * Signal to indicate the home dashboard page is active.
   * When true, the top navbar and bottom nav are hidden because
   * the home page renders its own full-screen 3-column layout with sidebar nav.
   */
  homePageActive = signal(false);

  /**
   * Enter reader mode - hide navbar
   */
  enterReader(): void {
    this.navbarHidden.set(true);
  }

  /**
   * Exit reader mode - show navbar
   */
  exitReader(): void {
    this.navbarHidden.set(false);
  }

  /**
   * Toggle navbar visibility while in reader
   */
  toggleNavbar(): void {
    this.navbarHidden.update(current => !current);
  }

  /** Called by HomeComponent on init — hides shell nav so home renders its own sidebar */
  enterHome(): void {
    this.homePageActive.set(true);
  }

  /** Called by HomeComponent on destroy — restores shell nav */
  exitHome(): void {
    this.homePageActive.set(false);
  }
}
