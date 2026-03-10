import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../../core/auth/auth.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ToastService } from '../../../../core/services/toast.service';
import { BrandLogoComponent } from '../../../../shared/components/brand-logo/brand-logo.component';

type GoogleCredentialResponse = { credential?: string };

type GoogleAccountsIdApi = {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
  }): void;
  prompt(): void;
};

type LoginWindow = Window & {
  google?: {
    accounts?: {
      id?: GoogleAccountsIdApi;
    };
  };
  handleGoogleCredentialResponse?: (response: GoogleCredentialResponse) => void;
  __GOOGLE_CLIENT_ID__?: string;
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, BrandLogoComponent],
  template: `
    <div class="relative min-h-screen overflow-hidden bg-[#f7efe8] dark:bg-[#0b0708] px-4 py-12 sm:px-6 lg:px-8">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(128,0,32,0.14),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(154,109,31,0.10),transparent_40%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(128,0,32,0.24),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(214,184,122,0.14),transparent_40%)]"></div>
      <div class="relative mx-auto w-full max-w-md rounded-2xl border border-[#d8b7a8] dark:border-[#5f1327]/60 bg-white/90 dark:bg-[#120a0d]/90 p-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] dark:shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-sm">
        <div>
          <div class="flex justify-center">
            <app-brand-logo variant="mark" alt="NaijasPride" className="h-16 w-auto object-contain" />
          </div>
          <p class="mt-4 text-center text-xs uppercase tracking-[0.28em] text-[#8a5f1c] dark:text-[#d6b87a]">Welcome Back</p>
          <h2 class="mt-3 text-center font-['Cinzel'] text-3xl font-bold text-[#2a1c1f] dark:text-[#f3e5d8]">
            Sign in to NaijasPride
          </h2>
          <p class="mt-2 text-center text-sm text-[#7b6660] dark:text-[#d7c4b6]">
            Or create a new account
          </p>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="mt-8 space-y-5">
          <div class="space-y-3">
            <div>
              <label class="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#8a5f1c] dark:text-[#d6b87a]">Email address</label>
              <input
                formControlName="email"
                type="email"
                required
                class="block w-full rounded-lg border border-[#d8b7a8] dark:border-[#5f1327] bg-white dark:bg-[#1b1014] px-4 py-3 text-[#2a1c1f] dark:text-[#f7eee7] placeholder-[#8e756b] dark:placeholder-[#a88a78] outline-none transition focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/50"
                placeholder="Email address"
              >
            </div>
            <div>
              <label class="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#8a5f1c] dark:text-[#d6b87a]">Password</label>
              <input
                formControlName="password"
                type="password"
                required
                class="block w-full rounded-lg border border-[#d8b7a8] dark:border-[#5f1327] bg-white dark:bg-[#1b1014] px-4 py-3 text-[#2a1c1f] dark:text-[#f7eee7] placeholder-[#8e756b] dark:placeholder-[#a88a78] outline-none transition focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/50"
                placeholder="Password"
              >
            </div>
          </div>

          @if (error) {
            <div class="rounded-lg border border-[#c94866] dark:border-[#7f1d2d] bg-[#ffe7ec] dark:bg-[#3a1118]/65 p-3 text-center text-sm text-[#7a1f35] dark:text-[#ffccd4]">
              {{ error }}
            </div>
          }

          <div>
            <button
              type="submit"
              [disabled]="form.invalid || isLoading"
              class="group relative flex w-full justify-center rounded-lg border border-[#992143] bg-[#800020] px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#fff5f2] transition hover:bg-[#660019] focus:outline-none focus:ring-2 focus:ring-[#800020]/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              @if (isLoading) {
                Processing...
              } @else {
                Sign in
              }
            </button>
          </div>

          <div class="flex items-center justify-between">
            <a [routerLink]="['/forgot-password']" class="text-sm text-[#800020] dark:text-[#d6b87a] hover:underline">
              Forgot password?
            </a>
            <a [routerLink]="['/register']" class="text-sm text-[#800020] dark:text-[#d6b87a] hover:underline">
              Create account
            </a>
          </div>

          <div class="relative py-1">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-[#d8b7a8] dark:border-[#5f1327]"></div>
            </div>
            <div class="relative flex justify-center text-xs uppercase tracking-[0.2em]">
              <span class="bg-white dark:bg-[#120a0d] px-3 text-[#8a5f1c] dark:text-[#d6b87a]">or</span>
            </div>
          </div>

          <button
            type="button"
            (click)="signInWithGoogle()"
            [disabled]="isLoading || googleLoading || !googleClientId"
            class="flex w-full items-center justify-center gap-2 rounded-lg border border-[#d8b7a8] dark:border-[#5f1327] bg-white dark:bg-[#1b1014] px-4 py-3 text-sm font-semibold text-[#2a1c1f] dark:text-[#f7eee7] transition hover:bg-[#f7efe8] dark:hover:bg-[#2a151b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[#4285F4] font-bold">G</span>
            @if (googleLoading) {
              Loading Google...
            } @else {
              Continue with Google
            }
          </button>

          @if (!googleClientId) {
            <p class="text-center text-xs text-[#8a756e] dark:text-[#a88a78]">
              Google sign-in is unavailable. Configure <code>google-client-id</code> meta tag.
            </p>
          }

          <div class="relative py-1">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-[#d8b7a8] dark:border-[#5f1327]"></div>
            </div>
            <div class="relative flex justify-center text-xs uppercase tracking-[0.2em]">
              <span class="bg-white dark:bg-[#120a0d] px-3 text-[#8a5f1c] dark:text-[#d6b87a]">or</span>
            </div>
          </div>

          <button
            type="button"
            (click)="continueAsGuest()"
            [disabled]="isLoading || guestLoading"
            class="flex w-full items-center justify-center gap-2 rounded-lg border border-[#d8b7a8] dark:border-[#5f1327] bg-white dark:bg-[#1b1014] px-4 py-3 text-sm font-semibold text-[#2a1c1f] dark:text-[#f7eee7] transition hover:bg-[#f7efe8] dark:hover:bg-[#2a151b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            @if (guestLoading) {
              Creating guest account...
            } @else {
              Continue as Guest
            }
          </button>

          <p class="text-center text-xs text-[#8a756e] dark:text-[#a88a78]">
            Guest accounts are temporary and expire after 30 days. 
            <a [routerLink]="['/register']" class="text-[#800020] dark:text-[#d6b87a] hover:underline">Create an account</a> to save your data.
          </p>
        </form>
      </div>
    </div>
  `
})
export class LoginComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  readonly googleClientId = this.readGoogleClientId();

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  isLoading = false;
  error = '';
  googleLoading = false;
  googleEnabled = false;
  guestLoading = false;
  private googleScriptEl: HTMLScriptElement | null = null;

  private getRuntimeWindow(): LoginWindow {
    return window as LoginWindow;
  }

  ngOnInit() {
    const prefilledEmail = this.route.snapshot.queryParamMap.get('email');
    if (prefilledEmail) {
      this.form.patchValue({ email: prefilledEmail });
    }

    this.initializeGoogleSignIn();
  }

  ngOnDestroy() {
    const win = this.getRuntimeWindow();
    if (win.handleGoogleCredentialResponse) {
      delete win.handleGoogleCredentialResponse;
    }
  }

  onSubmit() {
    if (this.form.valid) {
      this.isLoading = true;
      this.error = '';
      
      const credentials = {
        email: this.form.value.email ?? '',
        password: this.form.value.password ?? '',
      };

      this.authService.login(credentials, this.getReturnUrl()).subscribe({
        next: () => {
          // Navigation handles in service
        },
        error: (err) => {
          this.isLoading = false;
          this.error = err.error?.error || 'Login failed. Please check your credentials.';
          this.toast.error(this.error);
        }
      });
    }
  }

  signInWithGoogle() {
    this.error = '';
    if (!this.googleEnabled) {
      this.toast.error('Google Sign-In is not configured yet.');
      return;
    }

    const google = this.getRuntimeWindow().google;
    if (!google?.accounts?.id?.prompt) {
      this.toast.error('Google Sign-In is unavailable right now. Please try again.');
      return;
    }

    google.accounts.id.prompt();
  }

  private initializeGoogleSignIn() {
    if (!this.googleClientId) {
      return;
    }

    this.googleLoading = true;
    const win = this.getRuntimeWindow();
    win.handleGoogleCredentialResponse = (response: GoogleCredentialResponse) => {
      const credential = response?.credential;
      if (!credential) {
        this.toast.error('Google did not return an ID token.');
        return;
      }

      this.isLoading = true;
      this.authService.loginWithGoogle(credential, this.getReturnUrl()).subscribe({
        next: () => {
          this.isLoading = false;
        },
        error: (err) => {
          this.isLoading = false;
          this.error = err.error?.error || 'Google login failed. Please try again.';
          this.toast.error(this.error);
        },
      });
    };

    this.googleScriptEl = document.createElement('script');
    this.googleScriptEl.src = 'https://accounts.google.com/gsi/client';
    this.googleScriptEl.async = true;
    this.googleScriptEl.defer = true;
    this.googleScriptEl.onload = () => {
      const google = this.getRuntimeWindow().google;
      if (!google?.accounts?.id) {
        this.googleLoading = false;
        return;
      }

      google.accounts.id.initialize({
        client_id: this.googleClientId,
        callback: win.handleGoogleCredentialResponse!,
        auto_select: false,
      });

      this.googleEnabled = true;
      this.googleLoading = false;
    };
    this.googleScriptEl.onerror = () => {
      this.googleLoading = false;
      this.googleEnabled = false;
    };
    document.head.appendChild(this.googleScriptEl);
  }

  private readGoogleClientId(): string {
    const runtimeValue = (this.getRuntimeWindow().__GOOGLE_CLIENT_ID__ || '').trim();
    if (runtimeValue) return runtimeValue;

    const meta = document.querySelector('meta[name="google-client-id"]');
    return (meta?.getAttribute('content') || '').trim();
  }

  private getReturnUrl() {
    return this.route.snapshot.queryParamMap.get('returnUrl') || undefined;
  }

  continueAsGuest() {
    this.error = '';
    this.guestLoading = true;

    this.authService.loginAsGuest(this.getReturnUrl()).subscribe({
      next: () => {
        this.guestLoading = false;
        this.toast.success('Welcome! You\'re browsing as a guest.');
      },
      error: (err) => {
        this.guestLoading = false;
        this.error = err.error?.error || 'Failed to create guest account. Please try again.';
        this.toast.error(this.error);
      }
    });
  }
}
