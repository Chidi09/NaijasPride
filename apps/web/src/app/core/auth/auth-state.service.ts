import { Injectable, signal } from '@angular/core';

export interface AuthUser {
  id?: string;
  email: string;
  name?: string | null;
  role: string;
  isGuest?: boolean;
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

  getToken() {
    return localStorage.getItem(this.tokenKey);
  }

  getRefreshToken() {
    return localStorage.getItem(this.refreshTokenKey);
  }

  isAuthenticated() {
    return !!this.getToken() && !!this.currentUser();
  }

  setSession(data: SessionData) {
    localStorage.setItem(this.tokenKey, data.token);
    if (data.refreshToken) {
      localStorage.setItem(this.refreshTokenKey, data.refreshToken);
    } else {
      localStorage.removeItem(this.refreshTokenKey);
    }
    localStorage.setItem(this.userKey, JSON.stringify(data.user));
    this.currentUser.set(data.user);
  }

  clearSession() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.userKey);
    this.currentUser.set(null);
  }

  updateUser(user: AuthUser) {
    localStorage.setItem(this.userKey, JSON.stringify(user));
    this.currentUser.set(user);
  }

  private getUserFromStorage() {
    const user = localStorage.getItem(this.userKey);
    if (!user) return null;

    try {
      return JSON.parse(user) as AuthUser;
    } catch {
      localStorage.removeItem(this.userKey);
      return null;
    }
  }
}
