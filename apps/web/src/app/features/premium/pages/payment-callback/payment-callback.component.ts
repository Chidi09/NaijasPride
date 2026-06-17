import { Component, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { HttpClient } from "@angular/common/http";
import { ProfileQueryService } from "../../../profile/services/profile-query.service";
import { AuthService } from "../../../../core/auth/auth.service";

@Component({
  selector: "app-payment-callback",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div
      class="min-h-screen bg-[#f7efe8] dark:bg-cinema-900 flex items-center justify-center p-4"
    >
      <div class="max-w-md w-full text-center space-y-6">
        @if (status === "verifying") {
          <div
            class="w-16 h-16 border-4 border-cinema-500/30 border-t-cinema-500 rounded-full animate-spin mx-auto"
          ></div>
          <p class="text-[#725f58] dark:text-gray-400">
            Verifying your payment...
          </p>
        }

        @if (status === "success") {
          <div
            class="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto"
          >
            <svg
              class="w-8 h-8 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1
            class="text-2xl font-serif font-bold text-[#24181b] dark:text-white"
          >
            Payment Successful!
          </h1>
          <p class="text-[#725f58] dark:text-gray-400">
            Your NaijasPride PRO membership is now active. Enjoy unlimited
            streaming with no ads.
          </p>
          <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              routerLink="/movies"
              class="inline-block bg-cinema-500 hover:bg-cinema-400 text-white font-bold px-8 py-3 rounded-full transition-colors"
            >
              Start Watching
            </a>
            <a
              routerLink="/profile"
              [queryParams]="{ tab: 'subscription' }"
              class="inline-block border border-cinema-500/60 text-cinema-500 font-bold px-6 py-3 rounded-full hover:bg-cinema-500/10 transition-colors"
            >
              View My Plan
            </a>
          </div>
        }

        @if (status === "failed") {
          <div
            class="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto"
          >
            <svg
              class="w-8 h-8 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1
            class="text-2xl font-serif font-bold text-[#24181b] dark:text-white"
          >
            Payment Not Completed
          </h1>
          <p class="text-[#725f58] dark:text-gray-400">
            {{
              errorMessage ||
                "Your payment could not be verified. If you were charged, please contact support."
            }}
          </p>
          <div class="flex gap-4 justify-center">
            <a
              routerLink="/premium"
              class="inline-block bg-cinema-500 hover:bg-cinema-400 text-white font-bold px-6 py-3 rounded-full transition-colors"
            >
              Try Again
            </a>
            <a
              routerLink="/movies"
              class="inline-block border border-cinema-500/60 text-cinema-500 font-bold px-6 py-3 rounded-full hover:bg-cinema-500/10 transition-colors"
            >
              Go to Browse
            </a>
          </div>
        }
      </div>
    </div>
  `,
})
export class PaymentCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private profileQuery = inject(ProfileQueryService);
  private auth = inject(AuthService);

  status: "verifying" | "success" | "failed" = "verifying";
  errorMessage: string | null = null;

  ngOnInit() {
    const reference =
      this.route.snapshot.queryParamMap.get("reference") ||
      this.route.snapshot.queryParamMap.get("trxref");

    if (!reference) {
      this.status = "failed";
      this.errorMessage = "No payment reference found.";
      return;
    }

    this.http.post("/api/v1/payments/verify", { reference }).subscribe({
      next: (res: { success?: boolean; message?: string }) => {
        if (res?.success) {
          this.status = "success";
          // Bust the subscription + profile caches so the UI reflects the new plan immediately.
          this.profileQuery.invalidateSubscription();
          this.profileQuery.invalidateProfile();
          // Refresh the in-memory auth user so isPremium is updated.
          this.auth.refreshUser().subscribe({ error: () => {} });
        } else {
          this.status = "failed";
          this.errorMessage = res?.message || null;
        }
      },
      error: (err) => {
        this.status = "failed";
        this.errorMessage = err?.error?.message || null;
      },
    });
  }
}
