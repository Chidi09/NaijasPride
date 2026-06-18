import { Injectable, signal, inject } from "@angular/core";
import { Platform } from "@angular/cdk/platform";
import { detectTvEnvironment } from "../utils/tv-detection";

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface PWAState {
  isStandalone: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isTV: boolean;
  canInstall: boolean;
  installPrompt: BeforeInstallPromptEvent | null;
}

@Injectable({
  providedIn: "root",
})
export class PwaService {
  private platform = inject(Platform);

  private pwaState = signal<PWAState>({
    isStandalone: false,
    isIOS: false,
    isAndroid: false,
    isTV: false,
    canInstall: false,
    installPrompt: null,
  });

  readonly state = this.pwaState.asReadonly();
  readonly isStandalone = signal(false);
  readonly isAppMode = signal(false);
  readonly isTV = signal(false);

  constructor() {
    this.detectPWA();
    this.detectTV();
    this.listenForInstallPrompt();
  }

  private detectPWA(): void {
    if (typeof window === "undefined") return;
    // Check if running in standalone mode (PWA installed)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;

    // Check platform
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(navigator.userAgent);

    this.pwaState.update((state) => ({
      ...state,
      isStandalone,
      isIOS,
      isAndroid,
    }));

    this.isStandalone.set(isStandalone);
    this.isAppMode.set(isStandalone || this.isTV());

    // Listen for display mode changes
    window
      .matchMedia("(display-mode: standalone)")
      .addEventListener("change", (e) => {
        const standalone = e.matches;
        this.pwaState.update((state) => ({
          ...state,
          isStandalone: standalone,
        }));
        this.isStandalone.set(standalone);
        this.isAppMode.set(standalone || this.isTV());
      });
  }

  private detectTV(): void {
    const isTV = detectTvEnvironment();

    this.pwaState.update((state) => ({ ...state, isTV }));
    this.isTV.set(isTV);
    if (isTV) {
      this.isAppMode.set(true);
    }
  }

  private listenForInstallPrompt(): void {
    if (typeof window === "undefined") return;
    // Capture the install prompt event
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.pwaState.update((state) => ({
        ...state,
        canInstall: true,
        installPrompt: e as BeforeInstallPromptEvent,
      }));
    });

    // Handle when app is installed
    window.addEventListener("appinstalled", () => {
      this.pwaState.update((state) => ({
        ...state,
        canInstall: false,
        installPrompt: null,
        isStandalone: true,
      }));
      this.isStandalone.set(true);
      this.isAppMode.set(true);
    });
  }

  async installApp(): Promise<boolean> {
    const prompt = this.pwaState().installPrompt;
    if (!prompt) return false;

    prompt.prompt();
    const result = await prompt.userChoice;

    if (result.outcome === "accepted") {
      this.pwaState.update((state) => ({
        ...state,
        canInstall: false,
        installPrompt: null,
      }));
      return true;
    }

    return false;
  }

  dismissInstallPrompt(): void {
    this.pwaState.update((state) => ({
      ...state,
      canInstall: false,
    }));
  }

  // Helper to check if we should show app-like UI
  shouldShowAppUI(): boolean {
    return this.isStandalone() || this.isAppMode();
  }

  // Check if bottom nav should be hidden (when watching/reading in immersive views)
  shouldHideBottomNav(currentRoute: string): boolean {
    const hidePatterns = [
      "/watch", // Movie watch room: /movies/:slug/watch
      "/read", // Book reader: /books/novel/:slug/read, manga reader: /books/manga/:id/read/:chapter
    ];

    return hidePatterns.some((pattern) => currentRoute.includes(pattern));
  }
}
