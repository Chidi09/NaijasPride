import { Injectable, computed, signal } from '@angular/core';

export interface AuthUser {
  id?: string;
  email: string;
  name?: string | null;
  role: string;
  isGuest?: boolean;
  isPremium?: boolean;
  subStatus?: 'active' | 'inactive' | 'cancelled' | 'past_due';
}

interface SessionData {
  user: AuthUser;
  token: string;
  refreshToken?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthStateService {
  private readonly tokenKey = 'token';
  private readonly refreshTokenKey = 'refreshToken';
  private readonly userKey = 'user';

  readonly currentUser = signal<AuthUser | null>(this.getUserFromStorage());
  readonly isPremium = computed(() => {
    const user = this.currentUser();
    if (!user) return false;
    return !!user.isPremium || user.subStatus === 'active';
  });

  getToken() {
    if (!this.canUseStorage()) return null;
    return this.safeGet(this.tokenKey);
  }

  getRefreshToken() {
    if (!this.canUseStorage()) return null;
    return this.safeGet(this.refreshTokenKey);
  }

  isAuthenticated() {
    return !!this.getToken() && !!this.currentUser();
  }

  setSession(data: SessionData) {
    if (!this.canUseStorage()) {
      this.currentUser.set(data.user);
      return;
    }

    this.safeSet(this.tokenKey, data.token);
    if (data.refreshToken) {
      this.safeSet(this.refreshTokenKey, data.refreshToken);
    } else {
      this.safeRemove(this.refreshTokenKey);
    }
    this.safeSet(this.userKey, JSON.stringify(data.user));
    this.currentUser.set(data.user);
  }

  clearSession() {
    if (!this.canUseStorage()) {
      this.currentUser.set(null);
      return;
    }

    this.safeRemove(this.tokenKey);
    this.safeRemove(this.refreshTokenKey);
    this.safeRemove(this.userKey);
    this.currentUser.set(null);
  }

  updateUser(user: AuthUser) {
    if (!this.canUseStorage()) {
      this.currentUser.set(user);
      return;
    }

    this.safeSet(this.userKey, JSON.stringify(user));
    this.currentUser.set(user);
  }

  private getUserFromStorage() {
    if (!this.canUseStorage()) return null;

    const user = this.safeGet(this.userKey);
    if (!user) return null;

    try {
      return JSON.parse(user) as AuthUser;
    } catch {
      this.safeRemove(this.userKey);
      return null;
    }
  }

  private canUseStorage(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  private safeGet(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private safeSet(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore storage failures and keep in-memory state.
    }
  }

  private safeRemove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage failures and keep in-memory state.
    }
  }
}
