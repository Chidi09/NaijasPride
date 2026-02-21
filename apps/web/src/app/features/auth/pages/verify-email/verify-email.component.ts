import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastService } from '../../../../core/services/toast.service';
import { BrandLogoComponent } from '../../../../shared/components/brand-logo/brand-logo.component';

interface VerifyEmailResponse {
  success: boolean;
  data?: { email: string };
  message?: string;
  error?: string;
}

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterLink, BrandLogoComponent],
  template: `
    <div class="relative min-h-screen overflow-hidden bg-[#f7efe8] dark:bg-[#0b0708] px-4 py-12 sm:px-6 lg:px-8">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(128,0,32,0.14),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(154,109,31,0.10),transparent_40%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(128,0,32,0.24),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(214,184,122,0.14),transparent_40%)]"></div>
      <div class="relative mx-auto w-full max-w-md rounded-2xl border border-[#d8b7a8] dark:border-[#5f1327]/60 bg-white/90 dark:bg-[#120a0d]/90 p-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] dark:shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-sm">
        <div>
          <div class="flex justify-center">
            <app-brand-logo variant="mark" alt="NaijasPride" className="h-16 w-16 object-contain" />
          </div>
          <p class="mt-4 text-center text-xs uppercase tracking-[0.28em] text-[#8a5f1c] dark:text-[#d6b87a]">Email Verification</p>
        </div>

        @if (isVerifying) {
          <div class="mt-8 text-center">
            <div class="mb-4 animate-spin text-[#800020] text-4xl">⟳</div>
            <p class="text-[#7b6660] dark:text-[#d7c4b6]">Verifying your email address...</p>
          </div>
        } @else if (verified) {
          <div class="mt-8 text-center">
            <div class="mb-4 text-green-500 text-5xl">✓</div>
            <h3 class="text-xl font-semibold text-[#2a1c1f] dark:text-[#f3e5d8] mb-2">Email Verified!</h3>
            <p class="text-[#7b6660] dark:text-[#d7c4b6] mb-6">
              Your email address has been verified successfully. You can now enjoy all features of NaijasPride.
            </p>
            <a [routerLink]="['/movies/downloads']" class="inline-flex justify-center rounded-lg border border-[#992143] bg-[#800020] px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#fff5f2] transition hover:bg-[#660019]">
              Start Browsing
            </a>
          </div>
        } @else {
          <div class="mt-8 text-center">
            @if (!token) {
              <div class="mb-4 text-red-500 text-5xl">✕</div>
              <h3 class="text-xl font-semibold text-[#2a1c1f] dark:text-[#f3e5d8] mb-2">Invalid Verification Link</h3>
              <p class="text-[#7b6660] dark:text-[#d7c4b6] mb-6">
                The verification link is invalid or has expired.
              </p>
            } @else {
              <div class="mb-4 text-red-500 text-5xl">✕</div>
              <h3 class="text-xl font-semibold text-[#2a1c1f] dark:text-[#f3e5d8] mb-2">Verification Failed</h3>
              <p class="text-[#7b6660] dark:text-[#d7c4b6] mb-6">
                {{ error || 'Failed to verify email. The link may have expired.' }}
              </p>
            }
            <div class="space-y-3">
              <button
                (click)="resendEmail()"
                [disabled]="resending"
                class="w-full flex justify-center rounded-lg border border-[#992143] bg-[#800020] px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#fff5f2] transition hover:bg-[#660019] disabled:opacity-50"
              >
                @if (resending) {
                  Sending...
                } @else {
                  Resend Verification Email
                }
              </button>
              <a [routerLink]="['/login']" class="inline-block text-sm text-[#800020] dark:text-[#d6b87a] hover:underline">
                Back to Login
              </a>
            </div>
          </div>
        }
      </div>
    </div>
  `
})
export class VerifyEmailComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);

  isVerifying = true;
  verified = false;
  resending = false;
  error = '';
  token = '';

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    
    if (!this.token) {
      this.isVerifying = false;
      this.error = 'Invalid verification token';
      return;
    }

    this.verifyEmail();
  }

  verifyEmail() {
    this.http.post<VerifyEmailResponse>('/api/v1/auth/verify-email', {
      token: this.token
    }).subscribe({
      next: (response) => {
        this.isVerifying = false;
        if (response.success) {
          this.verified = true;
          this.toast.success('Email verified successfully!');
        } else {
          this.error = response.error || 'Verification failed';
          this.toast.error(this.error);
        }
      },
      error: (err) => {
        this.isVerifying = false;
        this.error = err.error?.error || 'Verification failed. The link may have expired.';
        this.toast.error(this.error);
      }
    });
  }

  resendEmail() {
    this.resending = true;
    this.http.post<VerifyEmailResponse>('/api/v1/auth/resend-verification', {}).subscribe({
      next: (response) => {
        this.resending = false;
        if (response.success) {
          this.toast.success('Verification email sent! Check your inbox.');
        } else {
          this.toast.error(response.error || 'Failed to resend verification email');
        }
      },
      error: (err) => {
        this.resending = false;
        const error = err.error?.error || 'Failed to resend verification email';
        this.toast.error(error);
      }
    });
  }
}
