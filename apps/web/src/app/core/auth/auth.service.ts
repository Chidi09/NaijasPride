import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { AuthStateService, AuthUser } from './auth-state.service';

interface AuthResponse {
  success: boolean;
  data: {
    user: AuthUser;
    token: string;
    refreshToken: string;
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private authState = inject(AuthStateService);

  currentUser = this.authState.currentUser;

  login(credentials: { email: string; password: string }, returnUrl?: string) {
    return this.http.post<AuthResponse>('/api/v1/auth/login', credentials).pipe(
      tap((response) => {
        if (response.success) {
          this.setSession(response.data, returnUrl);
        }
      })
    );
  }

  loginWithGoogle(idToken: string, returnUrl?: string) {
    return this.http.post<AuthResponse>('/api/v1/auth/google', { idToken }).pipe(
      tap((response) => {
        if (response.success) {
          this.setSession(response.data, returnUrl);
        }
      })
    );
  }

  logout() {
    this.authState.clearSession();
    this.router.navigate(['/login']);
  }

  refreshUser() {
    return this.http.get<{ success: boolean; data: AuthUser }>('/api/v1/profile').pipe(
      tap((response) => {
        if (response.success) {
          this.authState.updateUser(response.data);
        }
      })
    );
  }

  loginAsGuest(returnUrl?: string) {
    return this.http.post<AuthResponse>('/api/v1/auth/guest', {}).pipe(
      tap((response) => {
        if (response.success) {
          this.setSession(response.data, returnUrl);
        }
      })
    );
  }

  convertGuestAccount(email: string, password: string, name?: string) {
    return this.http.post<AuthResponse>('/api/v1/auth/convert-guest', { email, password, name }).pipe(
      tap((response) => {
        if (response.success) {
          this.authState.updateUser(response.data.user);
        }
      })
    );
  }

  private setSession(data: AuthResponse['data'], returnUrl?: string) {
    this.authState.setSession(data);

    if (returnUrl) {
      this.router.navigateByUrl(returnUrl);
      return;
    }

    // Redirect based on role
    if (data.user.role === 'ADMIN') {
      this.router.navigate(['/admin']);
    } else {
      this.router.navigate(['/home']);
    }
  }
}
