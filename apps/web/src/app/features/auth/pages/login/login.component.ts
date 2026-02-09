import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../../core/auth/auth.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ToastService } from '../../../../core/services/toast.service';
import { BrandLogoComponent } from '../../../../shared/components/brand-logo/brand-logo.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, BrandLogoComponent],
  template: `
    <div class="relative min-h-screen overflow-hidden bg-[#0b0708] px-4 py-12 sm:px-6 lg:px-8">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(128,0,32,0.24),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(214,184,122,0.14),transparent_40%)]"></div>
      <div class="relative mx-auto w-full max-w-md rounded-2xl border border-[#5f1327]/60 bg-[#120a0d]/90 p-8 shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-sm">
        <div>
          <div class="flex justify-center">
            <app-brand-logo variant="mark" alt="NaijasPride" className="h-16 w-16 object-contain" />
          </div>
          <p class="mt-4 text-center text-xs uppercase tracking-[0.28em] text-[#d6b87a]">Welcome Back</p>
          <h2 class="mt-3 text-center font-['Cinzel'] text-3xl font-bold text-[#f3e5d8]">
            Sign in to NaijasPride
          </h2>
          <p class="mt-2 text-center text-sm text-[#d7c4b6]">
            Or create a new account
          </p>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="mt-8 space-y-5">
          <div class="space-y-3">
            <div>
              <label class="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#d6b87a]">Email address</label>
              <input
                formControlName="email"
                type="email"
                required
                class="block w-full rounded-lg border border-[#5f1327] bg-[#1b1014] px-4 py-3 text-[#f7eee7] placeholder-[#a88a78] outline-none transition focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/50"
                placeholder="Email address"
              >
            </div>
            <div>
              <label class="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#d6b87a]">Password</label>
              <input
                formControlName="password"
                type="password"
                required
                class="block w-full rounded-lg border border-[#5f1327] bg-[#1b1014] px-4 py-3 text-[#f7eee7] placeholder-[#a88a78] outline-none transition focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/50"
                placeholder="Password"
              >
            </div>
          </div>

          @if (error) {
            <div class="rounded-lg border border-[#7f1d2d] bg-[#3a1118]/65 p-3 text-center text-sm text-[#ffccd4]">
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
        </form>
      </div>
    </div>
  `
})
export class LoginComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  isLoading = false;
  error = '';

  ngOnInit() {
    const prefilledEmail = this.route.snapshot.queryParamMap.get('email');
    if (prefilledEmail) {
      this.form.patchValue({ email: prefilledEmail });
    }
  }

  onSubmit() {
    if (this.form.valid) {
      this.isLoading = true;
      this.error = '';
      
      this.authService.login(this.form.value as any, this.getReturnUrl()).subscribe({
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

  private getReturnUrl() {
    return this.route.snapshot.queryParamMap.get('returnUrl') || undefined;
  }
}
