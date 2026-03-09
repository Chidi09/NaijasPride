import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../../core/auth/auth.service';
import { ProfileQueryService } from '../../services/profile-query.service';
import { WatchApiService, WatchHistoryItem } from '../../../watch/services/watch-api.service';
import { SubscriptionComponent } from '../../components/subscription/subscription.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { MovieSummary } from '@naijaspride/types';

@Component({
    selector: 'app-profile-dashboard',
    standalone: true,
    imports: [CommonModule, RouterLink, SubscriptionComponent],
    template: `
      <div class="container mx-auto px-4 py-12 text-[var(--text-primary)]">
        <!-- User Header -->
        <div class="flex items-center gap-6 mb-12">
          <div class="w-20 h-20 rounded-full bg-cinema-500 flex items-center justify-center text-3xl font-serif text-white">
            {{ auth.currentUser()?.email?.charAt(0) | uppercase }}
          </div>
          <div>
            <h1 class="text-3xl font-serif text-[#24181b] dark:text-white">My Library</h1>
            <p class="text-[#7b6660] dark:text-gray-400">{{ auth.currentUser()?.email }}</p>
            @if (auth.currentUser()?.role === 'ADMIN') {
               <span class="text-xs bg-red-600 text-white px-2 py-0.5 rounded">ADMIN</span>
            }
          </div>
        </div>

        <!-- Tabs -->
        <div class="border-b border-[#d8c2b8] dark:border-gray-800 mb-8 flex gap-8">
          <button 
            (click)="activeTab = 'continue'"
            [class.border-cinema-500]="activeTab === 'continue'"
            [class.text-cinema-500]="activeTab === 'continue'"
             class="pb-4 text-[#8a756e] hover:text-[#24181b] dark:text-gray-500 dark:hover:text-white border-b-2 border-transparent transition-all font-medium"
          >
            Continue Watching
            @if (continueWatching.length > 0) {
              <span class="ml-2 bg-cinema-500 text-white text-xs px-2 py-0.5 rounded-full">{{ continueWatching.length }}</span>
            }
          </button>
          <button 
            (click)="activeTab = 'watchlist'"
            [class.border-cinema-500]="activeTab === 'watchlist'"
            [class.text-cinema-500]="activeTab === 'watchlist'"
             class="pb-4 text-[#8a756e] hover:text-[#24181b] dark:text-gray-500 dark:hover:text-white border-b-2 border-transparent transition-all font-medium"
          >
            My Watchlist
          </button>
          <button 
            (click)="activeTab = 'history'"
            [class.border-cinema-500]="activeTab === 'history'"
            [class.text-cinema-500]="activeTab === 'history'"
             class="pb-4 text-[#8a756e] hover:text-[#24181b] dark:text-gray-500 dark:hover:text-white border-b-2 border-transparent transition-all font-medium"
          >
            Download History
          </button>
          
          <button 
            (click)="activeTab = 'subscription'"
            [class.border-cinema-500]="activeTab === 'subscription'"
            [class.text-cinema-500]="activeTab === 'subscription'"
             class="pb-4 text-[#8a756e] hover:text-[#24181b] dark:text-gray-500 dark:hover:text-white border-b-2 border-transparent transition-all font-medium"
          >
            Subscription
            @if (auth.currentUser()?.isPremium) {
              <span class="ml-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">PRO</span>
            }
          </button>
        </div>

      @if (query.isPending()) {
        <div class="animate-pulse space-y-4">
          <div class="h-64 bg-[#e5d2c6] dark:bg-cinema-800 rounded"></div>
        </div>
      }

      @if (query.isError()) {
        <div class="text-center py-20 text-[#8a756e] dark:text-gray-500">
          Failed to load profile. Please try again.
        </div>
      }

      @if (query.data(); as response) {
        @if (response.data; as profile) {
          
          <!-- Continue Watching Tab -->
          @if (activeTab === 'continue') {
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              @for (item of continueWatching; track item.id) {
                <div class="group">
                  <div class="bg-[#f1e5dd] dark:bg-cinema-800 rounded overflow-hidden transition-transform group-hover:scale-105">
                     <a [routerLink]="['/watch', item.movie.slug || item.movie.id]" class="relative block">
                       <img 
                         [src]="item.movie.thumbnailUrl"
                         [alt]="item.movie.title"
                         class="w-full aspect-[2/3] object-cover"
                       >
                      <!-- Progress Bar -->
                      <div class="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                        <div 
                          class="h-full bg-cinema-500"
                          [style.width.%]="item.progressPercentage"
                        ></div>
                      </div>
                      <!-- Play Icon -->
                      <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                        <div class="w-12 h-12 rounded-full bg-cinema-500 flex items-center justify-center">
                          <svg class="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                    </a>
                    <div class="p-3">
                      <a [routerLink]="['/movies', item.movie.slug || item.movie.id]" class="block">
                        <h3 class="text-[#24181b] dark:text-white font-medium text-sm truncate group-hover:text-cinema-500 transition-colors">{{ item.movie.title }}</h3>
                      </a>
                      <p class="text-[#8a756e] dark:text-gray-500 text-xs mt-1">
                        @if (item.progressPercentage && item.progressPercentage > 0) {
                          {{ item.progressPercentage | number:'1.0-0' }}% watched
                        } @else {
                          In progress
                        }
                      </p>
                    </div>
                  </div>
                </div>
              }
              
              @if (continueWatching.length === 0) {
                <div class="col-span-full text-center py-20 text-[#8a756e] dark:text-gray-500">
                  <div class="mb-4 text-6xl">🎬</div>
                  <p class="text-lg mb-4">No movies in progress.</p>
                  <a routerLink="/movies" class="text-cinema-500 hover:text-cinema-400">Start watching something →</a>
                </div>
              }
            </div>
          }
          
          <!-- Watchlist Tab -->
          @if (activeTab === 'watchlist') {
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              @for (movie of profile.watchlist; track movie.id) {
                <a [routerLink]="['/movies', movie.slug || movie.id]" class="group">
                  <div class="bg-[#f1e5dd] dark:bg-cinema-800 rounded overflow-hidden transition-transform group-hover:scale-105">
                     <img 
                      [src]="movie.thumbnailUrl"
                      [alt]="movie.title"
                      class="w-full aspect-[2/3] object-cover"
                    >
                    <div class="p-3">
                      <h3 class="text-[#24181b] dark:text-white font-medium text-sm truncate">{{ movie.title }}</h3>
                      <p class="text-[#8a756e] dark:text-gray-500 text-xs">{{ movie.year }}</p>
                    </div>
                  </div>
                </a>
              }
              
              @if (profile.watchlist.length === 0) {
                <div class="col-span-full text-center py-20 text-[#8a756e] dark:text-gray-500">
                  <p class="text-lg mb-4">Your watchlist is empty.</p>
                  <a routerLink="/movies" class="text-cinema-500 hover:text-cinema-400">Browse movies →</a>
                </div>
              }
            </div>
          }

          <!-- History Tab -->
          @if (activeTab === 'history') {
            <div class="bg-[#f1e5dd] dark:bg-cinema-800 rounded-lg overflow-hidden">
              <table class="w-full text-left text-sm text-[#735f58] dark:text-gray-400">
                <thead class="bg-[#ead7cc] dark:bg-black/20 text-[#2a1c1f] dark:text-gray-200">
                  <tr>
                    <th class="p-4">Movie</th>
                    <th class="p-4">Date</th>
                    <th class="p-4">Quality</th>
                    <th class="p-4">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-[#dcc5b8] dark:divide-gray-700">
                  @for (item of profile.downloadHistory; track item.id) {
                    <tr class="hover:bg-[#ead7cc] dark:hover:bg-white/5 transition-colors">
                      <td class="p-4">
                        <a [routerLink]="['/movies', item.movie.slug || item.movie.id]" class="text-[#24181b] dark:text-white font-medium hover:text-cinema-500">
                          {{ item.movie.title }}
                        </a>
                      </td>
                      <td class="p-4">{{ item.timestamp | date:'mediumDate' }}</td>
                      <td class="p-4">
                          <span class="bg-[#dcc5b8] dark:bg-gray-700 px-2 py-1 rounded text-xs">{{ item.quality }}</span>
                      </td>
                      <td class="p-4">
                        <a 
                          [href]="item.movie.fileUrls[item.quality]" 
                          target="_blank"
                          class="text-cinema-500 hover:text-cinema-400 text-sm"
                        >
                          Download Again →
                        </a>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              
              @if (profile.downloadHistory.length === 0) {
                <div class="text-center py-20 text-[#8a756e] dark:text-gray-500">
                  <p class="text-lg mb-4">No download history yet.</p>
                  <a routerLink="/movies" class="text-cinema-500 hover:text-cinema-400">Browse movies →</a>
                </div>
              }
            </div>
          }

          <!-- Subscription Tab -->
          @if (activeTab === 'subscription') {
            <app-subscription />
          }

          <!-- ML Recommendations Section -->
          @if (mlRecommendations().length > 0) {
            <div class="mt-12 border-t border-[#dcc5b8] dark:border-zinc-800 pt-10">
              <div class="flex items-center justify-between mb-6">
                <div>
                  <h2 class="text-xl font-serif text-[#24181b] dark:text-white">
                    {{ recommendationReason() === 'trending' ? 'Trending for You' : 'Recommended for You' }}
                  </h2>
                  <p class="text-xs text-[#8a756e] dark:text-gray-500 mt-1">
                    {{ recommendationReason() === 'trending' ? 'Start watching to get personalised picks' : 'Based on what you love' }}
                  </p>
                </div>
                <a routerLink="/movies" class="text-[#800020] text-sm font-medium hover:underline">Browse all →</a>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                @for (movie of mlRecommendations(); track movie.id) {
                  <a [routerLink]="['/movies', movie.slug || movie.id]" class="group">
                    <div class="bg-[#f1e5dd] dark:bg-cinema-800 rounded-lg overflow-hidden transition-transform duration-300 group-hover:scale-105 group-hover:shadow-xl">
                      @if (movie.thumbnailUrl) {
                        <img
                          [src]="movie.thumbnailUrl"
                          [alt]="movie.title"
                          class="w-full aspect-[2/3] object-cover"
                        >
                      } @else {
                        <div class="w-full aspect-[2/3] flex items-center justify-center bg-[#dfc8bb] dark:bg-cinema-700">
                          <span class="text-3xl">🎬</span>
                        </div>
                      }
                      <div class="p-2">
                        <h3 class="text-[#24181b] dark:text-white font-medium text-xs truncate group-hover:text-[#800020] dark:group-hover:text-[#d6b87a] transition-colors">{{ movie.title }}</h3>
                        <p class="text-[#8a756e] dark:text-gray-500 text-[11px]">{{ movie.year }}</p>
                      </div>
                    </div>
                  </a>
                }
              </div>
            </div>
          }

          @if (isLoadingRecommendations()) {
            <div class="mt-12 border-t border-[#dcc5b8] dark:border-zinc-800 pt-10">
              <div class="h-5 w-48 bg-[#e5d2c6] dark:bg-cinema-800 rounded animate-pulse mb-6"></div>
              <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                @for (i of [1,2,3,4,5,6]; track i) {
                  <div class="aspect-[2/3] bg-[#e5d2c6] dark:bg-cinema-800 rounded-lg animate-pulse"></div>
                }
              </div>
            </div>
          }
        }
      }
    </div>
  `
})
export class ProfileDashboardComponent implements OnInit {
  auth = inject(AuthService);
  profileService = inject(ProfileQueryService);
  watchApi = inject(WatchApiService);
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  query = this.profileService.getProfileQuery();
  activeTab: 'continue' | 'watchlist' | 'history' | 'subscription' = 'continue';

  // ML Recommendations
  mlRecommendations = signal<MovieSummary[]>([]);
  isLoadingRecommendations = signal(true);
  recommendationReason = signal<'personalised' | 'trending'>('trending');
  
  // Load continue watching entries — map to filtered array before toSignal
  continueWatchingSignal = toSignal(
    this.watchApi.getWatchHistory({ page: 1, limit: 20 }).pipe(
      map(res => res.data.filter(
        (item) => (item.progressPercentage ?? 0) > 0 && (item.progressPercentage ?? 0) < 95
      ))
    ),
    { initialValue: [] as WatchHistoryItem[] }
  );

  get continueWatching(): WatchHistoryItem[] {
    return this.continueWatchingSignal();
  }

  ngOnInit() {
    const routePath = this.route.routeConfig?.path;
    if (routePath === 'library') {
      this.activeTab = 'watchlist';
    } else if (routePath === 'downloads') {
      this.activeTab = 'history';
    }

    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab');
      if (tab === 'continue' || tab === 'watchlist' || tab === 'history' || tab === 'subscription') {
        this.activeTab = tab;
      }
    });

    this.loadRecommendations();
  }

  private loadRecommendations() {
    this.http.get<{ success: boolean; data: MovieSummary[]; reason: string }>(
      '/api/v1/profile/recommendations',
      { params: { limit: '12' } }
    ).subscribe({
      next: (res) => {
        this.mlRecommendations.set(res.data ?? []);
        this.recommendationReason.set(
          res.reason === 'personalised' ? 'personalised' : 'trending'
        );
        this.isLoadingRecommendations.set(false);
      },
      error: () => {
        this.isLoadingRecommendations.set(false);
      }
    });
  }
}
