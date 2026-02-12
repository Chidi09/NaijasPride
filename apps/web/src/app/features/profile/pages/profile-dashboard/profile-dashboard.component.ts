import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { ProfileQueryService } from '../../services/profile-query.service';

@Component({
  selector: 'app-profile-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
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
          (click)="activeTab = 'watchlist'"
          [class.border-cinema-500]="activeTab === 'watchlist'"
          [class.text-white]="activeTab === 'watchlist'"
           class="pb-4 text-[#8a756e] hover:text-[#24181b] dark:text-gray-500 dark:hover:text-white border-b-2 border-transparent transition-all"
        >
          My Watchlist
        </button>
        <button 
          (click)="activeTab = 'history'"
          [class.border-cinema-500]="activeTab === 'history'"
          [class.text-white]="activeTab === 'history'"
           class="pb-4 text-[#8a756e] hover:text-[#24181b] dark:text-gray-500 dark:hover:text-white border-b-2 border-transparent transition-all"
        >
          Download History
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
          
          <!-- Watchlist Tab -->
          @if (activeTab === 'watchlist') {
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              @for (movie of profile.watchlist; track movie.id) {
                <a [routerLink]="['/movies', movie.id]" class="group">
                  <div class="bg-[#f1e5dd] dark:bg-cinema-800 rounded overflow-hidden transition-transform group-hover:scale-105">
                    <img 
                      [src]="movie.thumbnailUrl || movie.coverUrl" 
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
                        <a [routerLink]="['/movies', item.movie.id]" class="text-[#24181b] dark:text-white font-medium hover:text-cinema-500">
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

          <!-- Recommendations Section -->
          @if (profile.recommendations.length > 0) {
            <div class="mt-12">
              <h2 class="text-xl font-serif text-[#24181b] dark:text-white mb-6">Recommended for You</h2>
              <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                @for (movie of profile.recommendations; track movie.id) {
                  <a [routerLink]="['/movies', movie.id]" class="group">
                    <div class="bg-[#f1e5dd] dark:bg-cinema-800 rounded overflow-hidden transition-transform group-hover:scale-105">
                      <img 
                        [src]="movie.thumbnailUrl || movie.coverUrl" 
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
              </div>
            </div>
          }
        }
      }
    </div>
  `
})
export class ProfileDashboardComponent {
  auth = inject(AuthService);
  profileService = inject(ProfileQueryService);
  query = this.profileService.getProfileQuery();
  activeTab: 'watchlist' | 'history' = 'watchlist';
}
