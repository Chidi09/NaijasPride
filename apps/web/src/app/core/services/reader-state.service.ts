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
}
