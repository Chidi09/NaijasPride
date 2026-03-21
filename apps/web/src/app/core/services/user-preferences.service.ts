import { Injectable, signal } from '@angular/core';

export type FeedMood = 'all' | 'chill' | 'intense' | 'family' | 'nollywood';

export interface UserPreferences {
  feedMood: FeedMood;
  highContrast: boolean;
  fontScale: number; // 1 = normal, 1.125, 1.25, 1.5
  hasSeenOnboarding: boolean;
}

const STORAGE_KEY = 'np_user_prefs';

const DEFAULTS: UserPreferences = {
  feedMood: 'all',
  highContrast: false,
  fontScale: 1,
  hasSeenOnboarding: false,
};

@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
  readonly feedMood = signal<FeedMood>(DEFAULTS.feedMood);
  readonly highContrast = signal(DEFAULTS.highContrast);
  readonly fontScale = signal(DEFAULTS.fontScale);
  readonly hasSeenOnboarding = signal(DEFAULTS.hasSeenOnboarding);

  constructor() {
    this.load();
  }

  setFeedMood(mood: FeedMood) {
    this.feedMood.set(mood);
    this.persist();
  }

  setHighContrast(on: boolean) {
    this.highContrast.set(on);
    document.documentElement.classList.toggle('high-contrast', on);
    this.persist();
  }

  setFontScale(scale: number) {
    const clamped = Math.max(0.875, Math.min(1.5, scale));
    this.fontScale.set(clamped);
    document.documentElement.style.fontSize = `${clamped * 100}%`;
    this.persist();
  }

  markOnboardingSeen() {
    this.hasSeenOnboarding.set(true);
    this.persist();
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<UserPreferences>;
      if (saved.feedMood) this.feedMood.set(saved.feedMood);
      if (saved.highContrast) {
        this.highContrast.set(true);
        document.documentElement.classList.add('high-contrast');
      }
      if (saved.fontScale && saved.fontScale !== 1) {
        this.fontScale.set(saved.fontScale);
        document.documentElement.style.fontSize = `${saved.fontScale * 100}%`;
      }
      if (saved.hasSeenOnboarding) this.hasSeenOnboarding.set(true);
    } catch { /* corrupted storage, use defaults */ }
  }

  private persist() {
    const prefs: UserPreferences = {
      feedMood: this.feedMood(),
      highContrast: this.highContrast(),
      fontScale: this.fontScale(),
      hasSeenOnboarding: this.hasSeenOnboarding(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }
}
