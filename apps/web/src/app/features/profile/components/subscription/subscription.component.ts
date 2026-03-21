import { Component, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { ProfileQueryService } from "../../services/profile-query.service";

interface SubscriptionData {
  subscriptionStatus: "active" | "inactive" | "cancelled" | "expired";
  subscriptionPlan: "free" | "basic" | "standard" | "premium";
  subscriptionExpiresAt: string | null;
  subscriptionStartedAt: string | null;
  isPremium: boolean;
  daysRemaining: number;
}

@Component({
  selector: "app-subscription",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-8 bg-zinc-900 rounded-lg max-w-2xl mx-auto mt-10 text-white">
      <h2 class="text-3xl font-bold mb-6">My Plan</h2>

      @if (query.isLoading()) {
        <div class="flex justify-center py-8">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
        </div>
      } @else if (query.error()) {
        <div class="text-center py-8">
          <p class="text-red-400 mb-3">Failed to load subscription.</p>
          <button (click)="query.refetch()" class="bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-6 py-2 rounded transition-colors">
            Retry
          </button>
        </div>
      } @else {
        @if (data(); as subscription) {
        <div
          class="flex items-center justify-between bg-zinc-800 p-6 rounded-md"
        >
          <div>
            <p class="text-gray-400 text-sm">Current Plan</p>
            <h3
              class="text-2xl font-bold capitalize"
              [class.text-red-500]="subscription.subscriptionPlan !== 'free'"
              [class.text-gray-300]="subscription.subscriptionPlan === 'free'"
            >
              {{ subscription.subscriptionPlan }}
            </h3>
          </div>
          <span
            class="px-4 py-1 rounded-full text-sm font-bold"
            [ngClass]="getStatusClass(subscription.subscriptionStatus)"
          >
            {{ subscription.subscriptionStatus }}
          </span>
        </div>

        @if (subscription.subscriptionExpiresAt) {
          <div class="mt-6 bg-zinc-800 p-6 rounded-md">
            <div class="flex justify-between items-center mb-4">
              <span class="text-gray-400">Next billing date</span>
              <span class="text-white">
                {{ formatDate(subscription.subscriptionExpiresAt) }}
              </span>
            </div>

            @if (subscription.daysRemaining > 0) {
              <div class="text-sm">
                @if (subscription.daysRemaining <= 7) {
                  <span class="text-yellow-500"
                    >{{ subscription.daysRemaining }} days remaining</span
                  >
                } @else {
                  <span class="text-green-400"
                    >{{ subscription.daysRemaining }} days remaining</span
                  >
                }
              </div>
            }
          </div>
        }

        <!-- Features List -->
        <div class="mt-6">
          <h4 class="text-lg font-semibold mb-4">Your Benefits</h4>
          <ul class="space-y-2">
            @if (subscription.subscriptionPlan === "free") {
              <li class="flex items-center gap-2 text-gray-400">
                <svg
                  class="w-5 h-5 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  ></path>
                </svg>
                Stream in 480p
              </li>
              <li class="flex items-center gap-2 text-gray-400">
                <svg
                  class="w-5 h-5 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  ></path>
                </svg>
                Watch on 1 device
              </li>
            } @else {
              <li class="flex items-center gap-2 text-white">
                <svg
                  class="w-5 h-5 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  ></path>
                </svg>
                Stream in up to 4K
              </li>
              <li class="flex items-center gap-2 text-white">
                <svg
                  class="w-5 h-5 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  ></path>
                </svg>
                Download for offline viewing
              </li>
              <li class="flex items-center gap-2 text-white">
                <svg
                  class="w-5 h-5 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  ></path>
                </svg>
                Multiple devices
              </li>
              <li class="flex items-center gap-2 text-white">
                <svg
                  class="w-5 h-5 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  ></path>
                </svg>
                No ads
              </li>
            }
          </ul>
        </div>

        <div class="mt-8 space-y-3">
          @if (subscription.subscriptionPlan === "free" || !subscription.isPremium) {
            <button
              (click)="goToPlans()"
              class="w-full py-3 bg-red-600 hover:bg-red-700 rounded font-bold transition focus:outline-none focus:ring-4 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
            >
              Upgrade Plan
            </button>
          } @else {
            <button
              (click)="goToPlans()"
              class="w-full py-3 bg-red-600 hover:bg-red-700 rounded font-bold transition focus:outline-none focus:ring-4 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
            >
              Change Plan
            </button>
          }
          @if (subscription.subscriptionStatus === 'active') {
            <p class="text-center text-xs text-gray-500">
              Need help? <a href="mailto:support@naijaspride.com" class="text-red-400 hover:underline">Contact support</a> to cancel or modify your subscription.
            </p>
          }
        </div>
        }
      }
    </div>
  `,
})
export class SubscriptionComponent implements OnInit {
  private profileQueryService = inject(ProfileQueryService);
  private router = inject(Router);
  query = this.profileQueryService.getSubscriptionQuery();

  data() {
    return this.query.data()?.data as SubscriptionData | undefined;
  }

  goToPlans() {
    this.router.navigate(['/profile/plans']);
  }

  ngOnInit() {}

  getStatusClass(status: string): string {
    switch (status) {
      case "active":
        return "bg-green-500/20 text-green-400";
      case "cancelled":
        return "bg-yellow-500/20 text-yellow-400";
      case "expired":
        return "bg-red-500/20 text-red-400";
      default:
        return "bg-gray-500/20 text-gray-400";
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
}
