import { Injectable, signal } from '@angular/core';

type ThemeMode = 'light' | 'dark';
type ThemePreference = ThemeMode | 'system';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly storageKey = 'naijaspride-theme';
  private mediaQuery: MediaQueryList | null = null;

  preference = signal<ThemePreference>('system');
  theme = signal<ThemeMode>('dark');

  init() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const saved = localStorage.getItem(this.storageKey) as ThemePreference | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      this.preference.set(saved);
    }

    this.applyTheme();
    this.mediaQuery.addEventListener('change', this.handleSystemThemeChange);
  }

  toggleTheme() {
    this.setTheme(this.theme() === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: ThemePreference) {
    this.preference.set(theme);
    localStorage.setItem(this.storageKey, theme);
    this.applyTheme();
  }

  private handleSystemThemeChange = () => {
    if (this.preference() === 'system') {
      this.applyTheme();
    }
  };

  private applyTheme() {
    const activeTheme = this.resolveTheme();
    this.theme.set(activeTheme);

    const root = document.documentElement;
    root.classList.toggle('dark', activeTheme === 'dark');
    root.style.colorScheme = activeTheme;
  }

  private resolveTheme(): ThemeMode {
    const preference = this.preference();
    if (preference === 'light' || preference === 'dark') {
      return preference;
    }

    return this.mediaQuery?.matches ? 'dark' : 'light';
  }
}
