import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-premium-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen relative flex items-center justify-center bg-[#f7efe8] dark:bg-cinema-900 overflow-hidden">
      <!-- Noise texture overlay -->
      <div class="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNhKSIvPjwvc3ZnPg==')] opacity-5 pointer-events-none"></div>
      <div class="absolute inset-0 bg-vignette pointer-events-none dark:block hidden"></div>

      <div class="relative z-10 max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 p-8">
        
        <div class="flex flex-col justify-center space-y-6">
          <h1 class="text-5xl md:text-6xl font-serif text-[#24181b] dark:text-white leading-tight">
            Unlock the <br>
            <span class="text-cinema-500 italic">Cinematic</span> <br>
            Experience.
          </h1>
          <p class="text-[#6f5b54] dark:text-gray-400 text-lg font-light max-w-md">
            Access the largest library of 4K Nollywood & Bollywood masterpieces. No interruptions. Just pure cinema.
          </p>
          
          <div class="flex gap-8 text-sm text-[#3d2a2f] dark:text-cinema-100 mt-4">
            <div class="flex flex-col">
              <span class="font-bold text-2xl">4K</span>
              <span class="text-[#7f6a63] dark:text-gray-500 text-xs uppercase tracking-widest">Resolution</span>
            </div>
            <div class="flex flex-col">
              <span class="font-bold text-2xl">∞</span>
              <span class="text-[#7f6a63] dark:text-gray-500 text-xs uppercase tracking-widest">Downloads</span>
            </div>
            <div class="flex flex-col">
              <span class="font-bold text-2xl">0</span>
              <span class="text-[#7f6a63] dark:text-gray-500 text-xs uppercase tracking-widest">Ads</span>
            </div>
          </div>
        </div>

        <div class="bg-white/85 dark:bg-cinema-800/50 backdrop-blur-sm border border-[#dcc5b8] dark:border-white/5 p-8 rounded-sm shadow-2xl">
          <h3 class="font-serif text-2xl text-[#24181b] dark:text-white mb-6">Select Your Access</h3>
          
          <div class="space-y-4">
            <div 
              (click)="selectPlan('monthly')"
              class="group cursor-pointer border p-4 transition-all duration-300 flex justify-between items-center"
              [ngClass]="{
                'border-cinema-500 bg-cinema-500/10': plan === 'monthly',
                 'border-[#dcc5b8] dark:border-white/10': plan !== 'monthly'
              }"
            >
              <div>
                 <p class="font-bold text-[#24181b] dark:text-white group-hover:text-[#5f1327] dark:group-hover:text-cinema-100">Monthly Pass</p>
                 <p class="text-xs text-[#7f6a63] dark:text-gray-500">Flexible access, cancel anytime.</p>
              </div>
              <span class="text-xl font-serif">₦1,500</span>
            </div>

            <div 
              (click)="selectPlan('yearly')"
              class="group cursor-pointer border p-4 transition-all duration-300 flex justify-between items-center relative overflow-hidden"
              [ngClass]="{
                'border-cinema-500 bg-cinema-500/10': plan === 'yearly',
                 'border-[#dcc5b8] dark:border-white/10': plan !== 'yearly'
              }"
            >
              <div class="absolute top-0 right-0 bg-cinema-500 text-[9px] font-bold px-2 py-0.5 text-white uppercase">Best Value</div>
              <div>
                 <p class="font-bold text-[#24181b] dark:text-white group-hover:text-[#5f1327] dark:group-hover:text-cinema-100">Annual Membership</p>
                 <p class="text-xs text-[#7f6a63] dark:text-gray-500">12 months of uninterrupted access.</p>
              </div>
              <span class="text-xl font-serif">₦12,000</span>
            </div>
          </div>

          <button 
            (click)="subscribe()"
            [disabled]="loading || !plan"
            class="w-full mt-8 bg-cinema-500 hover:bg-cinema-400 disabled:bg-cinema-700 disabled:cursor-not-allowed text-white font-medium py-4 tracking-widest uppercase text-xs transition-colors"
          >
            {{ loading ? 'Processing...' : 'Begin Membership' }}
          </button>
          
          @if (error) {
            <p class="mt-4 text-red-400 text-xs text-center">{{ error }}</p>
          }
        </div>

      </div>
    </div>
  `
})
export class PremiumLandingComponent {
  private http = inject(HttpClient);
  
  plan: 'monthly' | 'yearly' | null = null;
  loading = false;
  error: string | null = null;

  selectPlan(plan: 'monthly' | 'yearly') {
    this.plan = plan;
    this.error = null;
  }

  subscribe() {
    if (!this.plan) return;
    
    this.loading = true;
    this.error = null;
    
    this.http.post('/api/v1/payments/subscribe', { plan: this.plan })
      .subscribe({
        next: (response: any) => {
          this.loading = false;
          if (response.data?.paymentUrl) {
            window.location.href = response.data.paymentUrl;
          }
        },
        error: (err) => {
          this.loading = false;
          this.error = err.error?.message || 'Payment failed. Please try again.';
        }
      });
  }
}
