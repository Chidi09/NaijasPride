import { Component, inject, OnDestroy, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { AuthService } from "../../../../core/auth/auth.service";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { ToastService } from "../../../../core/services/toast.service";
import { BrandLogoComponent } from "../../../../shared/components/brand-logo/brand-logo.component";
import { CheckIconComponent } from "../../../../shared/components/icons/check-icon.component";
import { HttpClient } from "@angular/common/http";

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

type GoogleCredentialResponse = { credential?: string };

type GoogleAccountsIdApi = {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
  }): void;
  prompt(): void;
};

type RegisterWindow = Window & {
  google?: {
    accounts?: {
      id?: GoogleAccountsIdApi;
    };
  };
  handleGoogleCredentialResponse?: (response: GoogleCredentialResponse) => void;
  __GOOGLE_CLIENT_ID__?: string;
};

@Component({
  selector: "app-register",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    BrandLogoComponent,
    CheckIconComponent,
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
            Create Account
          </p>
          <h2
            class="mt-3 text-center font-['Cinzel'] text-3xl font-bold text-[#2a1c1f] dark:text-[#f3e5d8]"
          >
            Join NaijasPride
          </h2>
          <p
            class="mt-2 text-center text-sm text-[#7b6660] dark:text-[#d7c4b6]"
          >
            Start streaming and reading today
          </p>
        </div>

        @if (success) {
          <div class="mt-8 text-center">
            <div class="mb-4 flex justify-center">
              <app-check-icon [size]="48" fillColor="#22c55e" />
            </div>
            <h3
              class="text-xl font-semibold text-[#2a1c1f] dark:text-[#f3e5d8] mb-2"
            >
              Welcome Aboard!
            </h3>
            <p class="text-[#7b6660] dark:text-[#d7c4b6] mb-6">
              Your account has been created successfully.
            </p>
            <button
              (click)="goToLogin()"
              class="group relative flex w-full justify-center rounded-lg border border-[#992143] bg-[#800020] px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#fff5f2] transition hover:bg-[#660019] focus:outline-none focus:ring-2 focus:ring-[#800020]/60"
            >
              Continue to Sign In
            </button>
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
                  >Full Name</label
                >
                <input
                  formControlName="name"
                  type="text"
                  class="block w-full rounded-lg border border-[#d8b7a8] dark:border-[#5f1327] bg-white dark:bg-[#1b1014] px-4 py-3 text-[#2a1c1f] dark:text-[#f7eee7] placeholder-[#8e756b] dark:placeholder-[#a88a78] outline-none transition focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/50"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label
                  class="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#8a5f1c] dark:text-[#d6b87a]"
                  >Email address</label
                >
                <input
                  formControlName="email"
                  type="email"
                  required
                  class="block w-full rounded-lg border border-[#d8b7a8] dark:border-[#5f1327] bg-white dark:bg-[#1b1014] px-4 py-3 text-[#2a1c1f] dark:text-[#f7eee7] placeholder-[#8e756b] dark:placeholder-[#a88a78] outline-none transition focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/50"
                  placeholder="Email address"
                />
                @if (form.get("email")?.invalid && form.get("email")?.touched) {
                  <p class="mt-1 text-xs text-[#c94866]">
                    Please enter a valid email
                  </p>
                }
              </div>
              <div>
                <label
                  class="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#8a5f1c] dark:text-[#d6b87a]"
                  >Password</label
                >
                <input
                  formControlName="password"
                  type="password"
                  required
                  class="block w-full rounded-lg border border-[#d8b7a8] dark:border-[#5f1327] bg-white dark:bg-[#1b1014] px-4 py-3 text-[#2a1c1f] dark:text-[#f7eee7] placeholder-[#8e756b] dark:placeholder-[#a88a78] outline-none transition focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/50"
                  placeholder="Password (min 6 characters)"
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
                  >Confirm Password</label
                >
                <input
                  formControlName="confirmPassword"
                  type="password"
                  required
                  class="block w-full rounded-lg border border-[#d8b7a8] dark:border-[#5f1327] bg-white dark:bg-[#1b1014] px-4 py-3 text-[#2a1c1f] dark:text-[#f7eee7] placeholder-[#8e756b] dark:placeholder-[#a88a78] outline-none transition focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/50"
                  placeholder="Confirm password"
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
                  Creating Account...
                } @else {
                  Create Account
                }
              </button>
            </div>

            <div class="relative py-1">
              <div class="absolute inset-0 flex items-center">
                <div
                  class="w-full border-t border-[#d8b7a8] dark:border-[#5f1327]"
                ></div>
              </div>
              <div
                class="relative flex justify-center text-xs uppercase tracking-[0.2em]"
              >
                <span
                  class="bg-white dark:bg-[#120a0d] px-3 text-[#8a5f1c] dark:text-[#d6b87a]"
                  >or</span
                >
              </div>
            </div>

            <button
              type="button"
              (click)="signInWithGoogle()"
              [disabled]="isLoading || googleLoading || !googleClientId"
              class="flex w-full items-center justify-center gap-2 rounded-lg border border-[#d8b7a8] dark:border-[#5f1327] bg-white dark:bg-[#1b1014] px-4 py-3 text-sm font-semibold text-[#2a1c1f] dark:text-[#f7eee7] transition hover:bg-[#f7efe8] dark:hover:bg-[#2a151b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[#4285F4] font-bold"
                >G</span
              >
              @if (googleLoading) {
                Loading Google...
              } @else {
                Sign up with Google
              }
            </button>

            @if (!googleClientId) {
              <p class="text-center text-xs text-[#8a756e] dark:text-[#a88a78]">
                Google sign-in is unavailable. Configure
                <code>google-client-id</code> meta tag.
              </p>
            }

            <p class="text-center text-sm text-[#7b6660] dark:text-[#d7c4b6]">
              Already have an account?
              <a
                [routerLink]="['/login']"
                class="font-semibold text-[#800020] dark:text-[#d6b87a] hover:text-[#5f1327] dark:hover:text-[#f3e5d8] transition"
              >
                Sign in
              </a>
            </p>
          </form>
        }
      </div>
    </div>
  `,
})
export class RegisterComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  readonly googleClientId = this.readGoogleClientId();

  form = this.fb.group(
    {
      name: [""],
      email: ["", [Validators.required, Validators.email]],
      password: ["", [Validators.required, Validators.minLength(6)]],
      confirmPassword: ["", [Validators.required]],
    },
    { validators: this.passwordMatchValidator },
  );

  isLoading = false;
  error = "";
  success = false;
  googleLoading = false;
  googleEnabled = false;
  private googleScriptEl: HTMLScriptElement | null = null;

  private getRuntimeWindow(): RegisterWindow {
    return window as RegisterWindow;
  }

  ngOnInit() {
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
      this.error = "";

      const { name, email, password } = this.form.value;

      this.http
        .post<SignupResponse>("/api/v1/auth/signup", {
          name,
          email,
          password,
        })
        .subscribe({
          next: (response) => {
            this.isLoading = false;
            if (response.success) {
              this.success = true;
              this.toast.success("Account created successfully!");
            } else {
              this.error = response.error || "Signup failed. Please try again.";
              this.toast.error(this.error);
            }
          },
          error: (err) => {
            this.isLoading = false;
            this.error = err.error?.error || "Signup failed. Please try again.";
            this.toast.error(this.error);
          },
        });
    }
  }

  signInWithGoogle() {
    this.error = "";
    if (!this.googleEnabled) {
      this.toast.error("Google Sign-In is not configured yet.");
      return;
    }

    const google = this.getRuntimeWindow().google;
    if (!google?.accounts?.id?.prompt) {
      this.toast.error(
        "Google Sign-In is unavailable right now. Please try again.",
      );
      return;
    }

    google.accounts.id.prompt();
  }

  goToLogin() {
    const returnUrl = this.getReturnUrl();
    this.router.navigate(["/login"], {
      queryParams: returnUrl ? { returnUrl } : {},
      queryParamsHandling: "merge",
    });
  }

  private passwordMatchValidator(group: ReturnType<FormBuilder["group"]>) {
    const password = group.get("password")?.value;
    const confirmPassword = group.get("confirmPassword")?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  private initializeGoogleSignIn() {
    if (!this.googleClientId) {
      return;
    }

    this.googleLoading = true;
    const win = this.getRuntimeWindow();
    win.handleGoogleCredentialResponse = (
      response: GoogleCredentialResponse,
    ) => {
      const credential = response?.credential;
      if (!credential) {
        this.toast.error("Google did not return an ID token.");
        return;
      }

      this.isLoading = true;
      this.authService
        .loginWithGoogle(credential, this.getReturnUrl())
        .subscribe({
          next: () => {
            this.isLoading = false;
          },
          error: (err) => {
            this.isLoading = false;
            this.error =
              err.error?.error || "Google login failed. Please try again.";
            this.toast.error(this.error);
          },
        });
    };

    this.googleScriptEl = document.createElement("script");
    this.googleScriptEl.src = "https://accounts.google.com/gsi/client";
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
    const runtimeValue = (
      this.getRuntimeWindow().__GOOGLE_CLIENT_ID__ || ""
    ).trim();
    if (runtimeValue) return runtimeValue;

    const meta = document.querySelector('meta[name="google-client-id"]');
    return (meta?.getAttribute("content") || "").trim();
  }

  private getReturnUrl() {
    return this.route.snapshot.queryParamMap.get("returnUrl") || undefined;
  }
}
