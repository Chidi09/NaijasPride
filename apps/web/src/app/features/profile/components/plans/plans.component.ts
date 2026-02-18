import { Component, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { ProfileQueryService } from "../../services/profile-query.service";

interface Plan {
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
  features: string[];
  popular?: boolean;
}

@Component({
  selector: "app-plans",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-black min-h-screen py-20 px-4 text-white font-sans">
      <div class="text-center max-w-3xl mx-auto mb-16">
        <h2 class="text-4xl font-bold mb-4">Choose the plan that's right for you</h2>
        <p class="text-gray-400">Downgrade or cancel at any time.</p>
      </div>

      <div class="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        @for (plan of plans; track plan.slug) {
          <div
            class="border rounded-xl p-8 transition duration-300 relative"
            [class.border-gray-700]="!plan.popular"
            [class.hover:border-red-600]="!plan.popular"
            [class.border-2]="plan.popular"
            [class.border-red-600]="plan.popular"
            [class.scale-105]="plan.popular"
            [class.shadow-2xl]="plan.popular"
            [class.bg-zinc-900]="plan.popular"
            [ngClass]="{
              'bg-zinc-900/50': !plan.popular,
              'shadow-red-900/20': plan.popular
            }"
          >
            @if (plan.popular) {
              <div
                class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-600 px-4 py-1 rounded-full text-xs font-bold tracking-wider"
              >
                MOST POPULAR
              </div>
            }

            <h3
              class="text-xl font-bold"
              [class.text-white]="plan.popular"
              [class.text-gray-400]="!plan.popular"
            >
              {{ plan.name }}
            </h3>

            <div class="my-4">
              <span class="text-3xl font-bold"></span
              >
              <span
                class="font-bold"
                [class.text-4xl]="plan.popular"
                [class.text-3xl]="!plan.popular"
              >
                {{ formatPrice(plan.price) }}
              </span>
              <span class="text-gray-500">/mo</span>
            </div>

            <ul class="space-y-4 text-sm text-gray-300 mb-8">
              @for (feature of plan.features; track feature) {
                <li class="flex gap-2">
                  <svg
                    class="w-5 h-5 flex-shrink-0"
                    [class.text-red-500]="!plan.popular || (plan.popular && !feature.includes('No Ads'))"
                    [class.text-green-400]="plan.popular && feature.includes('No Ads')"
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
                  {{ feature }}
                </li>
              }
            </ul>

            <button
              class="w-full py-3 rounded font-bold transition focus:outline-none focus:ring-4 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
              [class.bg-red-600]="!plan.popular"
              [class.hover:bg-red-700]="!plan.popular"
              [class.bg-white]="plan.popular"
              [class.text-red-600]="plan.popular"
              [class.hover:bg-gray-200]="plan.popular"
              [disabled]="loading === plan.slug"
              (click)="subscribe(plan)"
            >
              {{ loading === plan.slug ? 'Redirecting...' : 'Subscribe' }}
            </button>
          </div>
        }
      </div>

      @if (error) {
        <p class="text-red-400 text-sm text-center mt-6">{{ error }}</p>
      }

      <!-- Compare Plans Section -->
      <div class="max-w-6xl mx-auto mt-20">
        <h3 class="text-2xl font-bold text-center mb-8">Compare Plans</h3>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-gray-800">
                <th class="py-4 px-4">Feature</th>
                <th class="py-4 px-4 text-center">Mobile</th>
                <th class="py-4 px-4 text-center">Standard</th>
                <th class="py-4 px-4 text-center">Family</th>
              </tr>
            </thead>
            <tbody class="text-gray-400">
              <tr class="border-b border-gray-800">
                <td class="py-4 px-4">Price</td>
                <td class="py-4 px-4 text-center">₦1,000/mo</td>
                <td class="py-4 px-4 text-center">₦2,500/mo</td>
                <td class="py-4 px-4 text-center">₦4,500/mo</td>
              </tr>
              <tr class="border-b border-gray-800">
                <td class="py-4 px-4">Video Quality</td>
                <td class="py-4 px-4 text-center">480p</td>
                <td class="py-4 px-4 text-center">1080p</td>
                <td class="py-4 px-4 text-center">4K+HDR</td>
              </tr>
              <tr class="border-b border-gray-800">
                <td class="py-4 px-4">Devices</td>
                <td class="py-4 px-4 text-center">Phone & Tablet</td>
                <td class="py-4 px-4 text-center">All Devices</td>
                <td class="py-4 px-4 text-center">All Devices</td>
              </tr>
              <tr class="border-b border-gray-800">
                <td class="py-4 px-4">Screens</td>
                <td class="py-4 px-4 text-center">1</td>
                <td class="py-4 px-4 text-center">2</td>
                <td class="py-4 px-4 text-center">4</td>
              </tr>
              <tr class="border-b border-gray-800">
                <td class="py-4 px-4">Downloads</td>
                <td class="py-4 px-4 text-center"><span class="text-red-500">✓</span></td>
                <td class="py-4 px-4 text-center"><span class="text-red-500">✓</span></td>
                <td class="py-4 px-4 text-center"><span class="text-red-500">✓</span></td>
              </tr>
              <tr class="border-b border-gray-800">
                <td class="py-4 px-4">Advertisements</td>
                <td class="py-4 px-4 text-center">Yes</td>
                <td class="py-4 px-4 text-center text-green-400">No on TV</td>
                <td class="py-4 px-4 text-center text-green-400">None</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class PlansComponent implements OnInit {
  private profileQueryService = inject(ProfileQueryService);

  plans: Plan[] = [
    {
      id: "mobile",
      name: "Mobile",
      slug: "mobile",
      price: 1000,
      currency: "NGN",
      durationDays: 30,
      maxScreens: 1,
      maxQuality: "480p",
      download: true,
      ads: true,
      features: [
        "Good video quality (480p)",
        "Phone & Tablet only",
        "1 Screen at a time",
        "Download for offline",
      ],
    },
    {
      id: "standard",
      name: "Standard",
      slug: "standard",
      price: 2500,
      currency: "NGN",
      durationDays: 30,
      maxScreens: 2,
      maxQuality: "1080p",
      download: true,
      ads: false,
      features: [
        "Great video quality (1080p)",
        "Phone, Tablet, Laptop, TV",
        "2 Screens at a time",
        "Download for offline",
        "No Ads on TV",
      ],
      popular: true,
    },
    {
      id: "family",
      name: "Family",
      slug: "family",
      price: 4500,
      currency: "NGN",
      durationDays: 30,
      maxScreens: 4,
      maxQuality: "4K",
      download: true,
      ads: false,
      features: [
        "Best video quality (4K+HDR)",
        "All devices included",
        "4 Screens at a time",
        "Download for offline",
        "Zero Ads Everywhere",
      ],
    },
  ];

  private http = inject(HttpClient);
  loading: string | null = null;
  error: string | null = null;

  ngOnInit() {}

  formatPrice(price: number): string {
    return `₦${price.toLocaleString()}`;
  }

  subscribe(plan: Plan) {
    this.loading = plan.slug;
    this.error = null;

    this.http.post<{ success: boolean; data: { authorization_url: string } }>(
      '/api/v1/payments/initialize',
      { plan: plan.slug }
    ).subscribe({
      next: (res) => {
        this.loading = null;
        if (res.data?.authorization_url) {
          window.location.href = res.data.authorization_url;
        }
      },
      error: (err) => {
        this.loading = null;
        this.error = err?.error?.message || 'Could not start payment. Please try again.';
      }
    });
  }
}
