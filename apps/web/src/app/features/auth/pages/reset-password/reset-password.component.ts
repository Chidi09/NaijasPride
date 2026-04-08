import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { ToastService } from "../../../../core/services/toast.service";
import { BrandLogoComponent } from "../../../../shared/components/brand-logo/brand-logo.component";
import { CheckIconComponent } from "../../../../shared/components/icons/check-icon.component";
import { CrossIconComponent } from "../../../../shared/components/icons/cross-icon.component";

interface ResetPasswordResponse {
  success: boolean;
  message?: string;
  error?: string;
}

@Component({
  selector: "app-reset-password",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    BrandLogoComponent,
    CheckIconComponent,
    CrossIconComponent,
  ],
  template: `
    <div
      class="relative min-h-screen overflow-hidden bg-[#f7efe8] dark:bg-[#0b0708] px-4 py-12 sm:px-6 lg:px-8"
    >
      <div
        class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(128,0,32,0.14),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(154,109,31,0.10),transparent_40%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(128,0,32,0.24),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(214,184,122,0.14),transparent_40%)]"
      ></div>
      <div
        class="relative mx-auto w-full max-w-md rounded-2xl border border-[#d8b7a8] dark:border-[#5f1327]/60 bg-white/90 dark:bg-[#120a0d]/90 p-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] dark:shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-sm"
      >
        <div>
          <div class="flex justify-center">
            <app-brand-logo
              variant="mark"
              alt="NaijasPride"
              className="h-16 w-auto object-contain"
            />
          </div>
          <p
            class="mt-4 text-center text-xs uppercase tracking-[0.28em] text-[#8a5f1c] dark:text-[#d6b87a]"
          >
            Set New Password
          </p>
          <h2
            class="mt-3 text-center font-['Cinzel'] text-3xl font-bold text-[#2a1c1f] dark:text-[#f3e5d8]"
          >
            Create New Password
          </h2>
        </div>

        @if (!token) {
          <div class="mt-8 text-center">
            <div class="mb-4 flex justify-center">
              <app-cross-icon [size]="48" fillColor="#ef4444" />
            </div>
            <h3
              class="text-xl font-semibold text-[#2a1c1f] dark:text-[#f3e5d8] mb-2"
            >
              Invalid Reset Link
            </h3>
            <p class="text-[#7b6660] dark:text-[#d7c4b6] mb-6">
              This password reset link is invalid or has expired.
            </p>
            <a
              [routerLink]="['/forgot-password']"
              class="inline-flex justify-center rounded-lg border border-[#992143] bg-[#800020] px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#fff5f2] transition hover:bg-[#660019]"
            >
              Request New Link
            </a>
          </div>
        } @else if (success) {
          <div class="mt-8 text-center">
            <div class="mb-4 flex justify-center">
              <app-check-icon [size]="48" fillColor="#22c55e" />
            </div>
            <h3
              class="text-xl font-semibold text-[#2a1c1f] dark:text-[#f3e5d8] mb-2"
            >
              Password Updated
            </h3>
            <p class="text-[#7b6660] dark:text-[#d7c4b6] mb-6">
              Your password has been reset successfully. You can now sign in
              with your new password.
            </p>
            <a
              [routerLink]="['/login']"
              class="inline-flex justify-center rounded-lg border border-[#992143] bg-[#800020] px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#fff5f2] transition hover:bg-[#660019]"
            >
              Sign In Now
            </a>
          </div>
        } @else {
          <form
            [formGroup]="form"
            (ngSubmit)="onSubmit()"
            class="mt-8 space-y-5"
          >
            <div class="space-y-3">
              <div>
                <label
                  class="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#8a5f1c] dark:text-[#d6b87a]"
                  >New Password</label
                >
                <input
                  formControlName="password"
                  type="password"
                  required
                  class="block w-full rounded-lg border border-[#d8b7a8] dark:border-[#5f1327] bg-white dark:bg-[#1b1014] px-4 py-3 text-[#2a1c1f] dark:text-[#f7eee7] placeholder-[#8e756b] dark:placeholder-[#a88a78] outline-none transition focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/50"
                  placeholder="New password (min 6 characters)"
                />
                @if (
                  form.get("password")?.invalid && form.get("password")?.touched
                ) {
                  <p class="mt-1 text-xs text-[#c94866]">
                    Password must be at least 6 characters
                  </p>
                }
              </div>
              <div>
                <label
                  class="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#8a5f1c] dark:text-[#d6b87a]"
                  >Confirm New Password</label
                >
                <input
                  formControlName="confirmPassword"
                  type="password"
                  required
                  class="block w-full rounded-lg border border-[#d8b7a8] dark:border-[#5f1327] bg-white dark:bg-[#1b1014] px-4 py-3 text-[#2a1c1f] dark:text-[#f7eee7] placeholder-[#8e756b] dark:placeholder-[#a88a78] outline-none transition focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/50"
                  placeholder="Confirm new password"
                />
                @if (
                  form.errors?.["passwordMismatch"] &&
                  form.get("confirmPassword")?.touched
                ) {
                  <p class="mt-1 text-xs text-[#c94866]">
                    Passwords do not match
                  </p>
                }
              </div>
            </div>

            @if (error) {
              <div
                class="rounded-lg border border-[#c94866] dark:border-[#7f1d2d] bg-[#ffe7ec] dark:bg-[#3a1118]/65 p-3 text-center text-sm text-[#7a1f35] dark:text-[#ffccd4]"
              >
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
                  Updating...
                } @else {
                  Reset Password
                }
              </button>
            </div>
          </form>
        }
      </div>
    </div>
  `,
})
export class ResetPasswordComponent implements OnInit {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);

  form = this.fb.group(
    {
      password: ["", [Validators.required, Validators.minLength(6)]],
      confirmPassword: ["", [Validators.required]],
    },
    { validators: this.passwordMatchValidator },
  );

  isLoading = false;
  error = "";
  success = false;
  token = "";

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get("token") || "";
    if (!this.token) {
      this.error = "Invalid reset token";
    }
  }

  onSubmit() {
    if (this.form.valid && this.token) {
      this.isLoading = true;
      this.error = "";

      this.http
        .post<ResetPasswordResponse>("/api/v1/auth/reset-password", {
          token: this.token,
          password: this.form.value.password,
        })
        .subscribe({
          next: (response) => {
            this.isLoading = false;
            if (response.success) {
              this.success = true;
              this.toast.success("Password reset successfully!");
            } else {
              this.error =
                response.error || "Failed to reset password. Please try again.";
              this.toast.error(this.error);
            }
          },
          error: (err) => {
            this.isLoading = false;
            this.error =
              err.error?.error ||
              "Failed to reset password. The link may have expired.";
            this.toast.error(this.error);
          },
        });
    }
  }

  private passwordMatchValidator(group: ReturnType<FormBuilder["group"]>) {
    const password = group.get("password")?.value;
    const confirmPassword = group.get("confirmPassword")?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }
}
