import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ProfileQueryService } from '../../services/profile-query.service';
import { AuthStateService } from '../../../../core/auth/auth-state.service';

interface ApiPlan {
  id: string;
  name: string;
  slug: string;
  price: number;
  currency: string;
  durationDays: number;
  maxScreens: number;
  maxQuality: string;
  download: boolean;
  ads: boolean;
  priority: number;
}

@Component({
  selector: 'app-plans',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-black min-h-screen py-20 px-4 text-white font-sans">
      <div class="text-center max-w-2xl mx-auto mb-16">
        <h2 class="text-4xl font-bold mb-4">Go ad-free on NaijasPride</h2>
        <p class="text-gray-400">Watch everything without interruptions. Cancel anytime.</p>
      </div>

      @if (isSubscribed()) {
        <div class="max-w-xl mx-auto mb-10 rounded-xl border border-green-700/40 bg-green-900/20 px-5 py-4 text-center">
          <p class="text-green-300 font-semibold text-sm">
            ✓ You're currently on the <strong>{{ subscriptionPlanName() }}</strong> plan
          </p>
          @if (renewalDate()) {
            <p class="text-green-400/70 text-xs mt-1">
              Active until <strong>{{ renewalDate() }}</strong>
              @if (daysRemaining() !== null) { · {{ daysRemaining() }} day{{ daysRemaining() === 1 ? '' : 's' }} remaining }
            </p>
          }
        </div>
      }

      @if (loadingPlans()) {
        <div class="flex justify-center py-16">
          <div class="w-10 h-10 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin"></div>
        </div>
      } @else if (plansError()) {
        <p class="text-red-400 text-center">{{ plansError() }}</p>
      } @else {
        <div class="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          @for (plan of plans(); track plan.slug) {
            <div
              class="rounded-2xl p-8 transition duration-300 relative"
              [ngClass]="isAnnual(plan) ? 'border-2 border-red-600 shadow-2xl bg-zinc-900' : 'border border-gray-700 bg-zinc-900/50'"
            >
              @if (isAnnual(plan)) {
                <div class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-600 px-4 py-1 rounded-full text-xs font-bold tracking-wider whitespace-nowrap">
                  BEST VALUE
                </div>
              }

              @if (isCurrentPlan(plan)) {
                <div class="absolute top-3 right-3 bg-green-600/20 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-600/40">
                  CURRENT PLAN
                </div>
              }

              <h3 class="text-xl font-bold text-white mb-1">{{ plan.name }}</h3>
              <p class="text-gray-500 text-sm mb-6">{{ isAnnual(plan) ? 'Billed once a year' : 'Billed every month' }}</p>

              <div class="mb-6">
                <span class="text-4xl font-bold text-white">{{ formatPrice(plan.price) }}</span>
                <span class="text-gray-500 ml-1">{{ isAnnual(plan) ? '/year' : '/month' }}</span>
                @if (isAnnual(plan)) {
                  <div class="mt-1 text-sm text-red-400 font-medium">Save ₦3,000 vs monthly</div>
                }
              </div>

              <ul class="space-y-3 text-sm text-gray-300 mb-8">
                <li class="flex gap-2 items-center">
                  <svg class="w-5 h-5 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                  </svg>
                  No ads — ever
                </li>
                <li class="flex gap-2 items-center">
                  <svg class="w-5 h-5 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                  </svg>
                  Full access to all movies, music & books
                </li>
                <li class="flex gap-2 items-center">
                  <svg class="w-5 h-5 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                  </svg>
                  Cancel anytime
                </li>
              </ul>

              @if (isCurrentPlan(plan) && renewalDate()) {
                <div class="mb-4 rounded-lg bg-green-900/20 border border-green-700/30 px-3 py-2 text-xs text-green-400/80 text-center">
                  Active until {{ renewalDate() }}
                </div>
              }

              <button
                class="w-full py-3 rounded-xl font-bold transition focus:outline-none focus:ring-4 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
                [ngClass]="isAnnual(plan) ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-white'"
                [disabled]="loading() === plan.slug || isCurrentPlan(plan)"
                (click)="subscribe(plan)"
              >
                @if (loading() === plan.slug) { Redirecting... }
                @else if (isCurrentPlan(plan)) { Current Plan }
                @else if (isSubscribed()) { Switch to {{ plan.name }} }
                @else { Get {{ plan.name }} }
              </button>
            </div>
          }
        </div>

        @if (error()) {
          <p class="text-red-400 text-sm text-center mt-6">{{ error() }}</p>
        }
      }
    </div>
  `,
})
export class PlansComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private authState = inject(AuthStateService);
  private profileQuery = inject(ProfileQueryService);
  private subscriptionQuery = this.profileQuery.getSubscriptionQuery();

  plans = signal<ApiPlan[]>([]);
  loadingPlans = signal(true);
  plansError = signal<string | null>(null);
  loading = signal<string | null>(null);
  error = signal<string | null>(null);

  isSubscribed = computed(() => {
    const data = this.subscriptionQuery.data()?.data;
    return !!data?.isPremium && data.subscriptionStatus === 'active';
  });

  subscriptionPlanName = computed(() => {
    const data = this.subscriptionQuery.data()?.data;
    return data?.subscriptionPlan ?? 'Premium';
  });

  renewalDate = computed((): string | null => {
    const data = this.subscriptionQuery.data()?.data;
    if (!data?.subscriptionExpiresAt) return null;
    return new Date(data.subscriptionExpiresAt).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  });

  daysRemaining = computed((): number | null => {
    const data = this.subscriptionQuery.data()?.data;
    if (typeof data?.daysRemaining !== 'number') return null;
    return Math.max(0, data.daysRemaining);
  });

  get currentPlanSlug(): string | null {
    const data = this.subscriptionQuery.data()?.data;
    if (!data?.isPremium) return null;
    return data.subscriptionPlan ?? null;
  }

  isCurrentPlan(plan: ApiPlan): boolean {
    return this.currentPlanSlug === plan.slug;
  }

  isAnnual(plan: ApiPlan): boolean {
    return plan.durationDays >= 365;
  }

  ngOnInit() {
    this.http.get<{ success: boolean; data: ApiPlan[] }>('/api/v1/plans').subscribe({
      next: (res) => {
        this.plans.set(res.data ?? []);
        this.loadingPlans.set(false);
      },
      error: () => {
        this.plansError.set('Failed to load plans. Please refresh.');
        this.loadingPlans.set(false);
      },
    });
  }

  formatPrice(price: number): string {
    return `₦${price.toLocaleString()}`;
  }

  subscribe(plan: ApiPlan) {
    if (!this.authState.isAuthenticated()) {
      this.router.navigate(['/register'], { queryParams: { redirect: '/profile/plans' } });
      return;
    }

    this.loading.set(plan.slug);
    this.error.set(null);

    this.http.post<{ success: boolean; data: { authorization_url: string } }>(
      '/api/v1/payments/initialize',
      { plan: plan.slug }
    ).subscribe({
      next: (res) => {
        this.loading.set(null);
        if (res.data?.authorization_url) {
          window.location.href = res.data.authorization_url;
        }
      },
      error: (err) => {
        this.loading.set(null);
        this.error.set(err?.error?.message || 'Could not start payment. Please try again.');
      },
    });
  }
}
