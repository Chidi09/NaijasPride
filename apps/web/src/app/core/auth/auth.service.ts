import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Router } from "@angular/router";
import { tap } from "rxjs";
import { AuthStateService, AuthUser } from "./auth-state.service";

interface SignupResponse {
  success: boolean;
  data?: {
    id: string;
    email: string;
    name: string | null;
    isPremium: boolean;
    role: string;
  };
  error?: string;
}

interface ForgotPasswordResponse {
  success: boolean;
  message?: string;
  error?: string;
}

interface ResetPasswordResponse {
  success: boolean;
  message?: string;
  error?: string;
}

interface VerifyEmailResponse {
  success: boolean;
  data?: { email: string };
  message?: string;
  error?: string;
}

interface AuthResponse {
  success: boolean;
  data: {
    user: AuthUser;
    token: string;
    refreshToken: string;
  };
}

@Injectable({ providedIn: "root" })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private authState = inject(AuthStateService);

  currentUser = this.authState.currentUser;

  login(credentials: { email: string; password: string }, returnUrl?: string) {
    return this.http.post<AuthResponse>("/api/v1/auth/login", credentials).pipe(
      tap((response) => {
        if (response.success) {
          this.setSession(response.data, returnUrl);
        }
      }),
    );
  }

  loginWithGoogle(idToken: string, returnUrl?: string) {
    return this.http
      .post<AuthResponse>("/api/v1/auth/google", { idToken })
      .pipe(
        tap((response) => {
          if (response.success) {
            this.setSession(response.data, returnUrl);
          }
        }),
      );
  }

  logout() {
    // Best-effort server-side teardown (future token blocklist hook).
    this.http.post("/api/v1/auth/logout", {}).subscribe({ error: () => {} });
    this.authState.clearSession();
    this.router.navigate(["/auth/login"]);
  }

  refreshUser() {
    return this.http
      .get<{ success: boolean; data: AuthUser }>("/api/v1/profile")
      .pipe(
        tap((response) => {
          if (response.success) {
            this.authState.updateUser(response.data);
          }
        }),
      );
  }

  loginAsGuest(returnUrl?: string) {
    return this.http.post<AuthResponse>("/api/v1/auth/guest", {}).pipe(
      tap((response) => {
        if (response.success) {
          this.setSession(response.data, returnUrl);
        }
      }),
    );
  }

  convertGuestAccount(email: string, password: string, name?: string) {
    return this.http
      .post<AuthResponse>("/api/v1/auth/convert-guest", {
        email,
        password,
        name,
      })
      .pipe(
        tap((response) => {
          if (response.success) {
            this.authState.updateUser(response.data.user);
          }
        }),
      );
  }

  signup(data: { name?: string; email: string; password: string }) {
    return this.http.post<SignupResponse>("/api/v1/auth/signup", data);
  }

  forgotPassword(email: string) {
    return this.http.post<ForgotPasswordResponse>(
      "/api/v1/auth/forgot-password",
      { email },
    );
  }

  resetPassword(token: string, password: string) {
    return this.http.post<ResetPasswordResponse>(
      "/api/v1/auth/reset-password",
      { token, password },
    );
  }

  verifyEmail(token: string) {
    return this.http.post<VerifyEmailResponse>("/api/v1/auth/verify-email", {
      token,
    });
  }

  resendVerification(email?: string) {
    return this.http.post<VerifyEmailResponse>(
      "/api/v1/auth/resend-verification",
      { email },
    );
  }

  private setSession(data: AuthResponse["data"], returnUrl?: string) {
    this.authState.setSession(data);

    if (returnUrl) {
      this.router.navigateByUrl(returnUrl);
      return;
    }

    // Redirect based on role
    if (data.user.role === "ADMIN") {
      this.router.navigate(["/admin"]);
    } else {
      this.router.navigate(["/home"]);
    }
  }
}
