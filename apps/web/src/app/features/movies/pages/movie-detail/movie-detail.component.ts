import { Component, effect, inject, input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Location } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { MoviesQueryService } from '../../services/movies-query.service';
import { ProfileQueryService } from '../../../profile/services/profile-query.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { OfflineStorageService } from '../../../../core/services/offline-storage.service';
import { EffectivegateBannerComponent } from '../../../../shared/components/effectivegate-banner/effectivegate-banner.component';
import { CastMember, Quality, Movie } from '@naijaspride/types';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';

@Component({
  selector: 'app-movie-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, EffectivegateBannerComponent],
  template: `
    @if (query.isPending()) {
      <div class="animate-pulse">
        <div class="h-[400px] bg-[#e5d2c6] dark:bg-cinema-800 w-full mb-8"></div>
        <div class="container mx-auto px-4">
          <div class="h-8 bg-[#e5d2c6] dark:bg-cinema-800 w-1/3 mb-4"></div>
          <div class="h-4 bg-[#e5d2c6] dark:bg-cinema-800 w-1/2 mb-8"></div>
        </div>
      </div>
    }

    @if (query.isError()) {
      <div class="container mx-auto px-4 py-20 text-center">
        <h2 class="text-2xl font-serif font-bold text-[#24181b] dark:text-white">Movie not found</h2>
        <button type="button" (click)="goBack()" class="text-cinema-500 hover:text-cinema-100 mt-4 block mx-auto">← Back</button>
      </div>
    }

    @if (query.isSuccess(); as success) {
      @if (query.data()?.data; as movie) {
        
        <div class="relative w-full bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden mb-8">
          
          <div 
            class="absolute inset-0 bg-cover bg-center opacity-20 blur-xl scale-110"
            [style.backgroundImage]="'url(' + getHeroBackdrop(movie) + ')'"
          ></div>
          <div class="absolute inset-0 bg-gradient-to-t from-[#f8f0e9] via-[#f8f0e9]/70 to-white/20 dark:from-cinema-900 dark:via-cinema-900/70 dark:to-black/20"></div>

           <div class="relative container mx-auto px-4 py-12 md:py-20 flex flex-col md:flex-row gap-8 items-center md:items-end">
            <button
              type="button"
              (click)="goBack()"
              class="absolute top-4 left-4 inline-flex items-center gap-2 text-[#8a756e] hover:text-[#24181b] dark:text-gray-400 dark:hover:text-white text-sm transition-colors"
              aria-label="Go back"
            >
              <span aria-hidden="true">←</span>
              Back
            </button>
             
             <div class="w-48 md:w-64 flex-shrink-0 rounded-sm shadow-2xl overflow-hidden border-2 border-white/10">
               <img [src]="movie.posterUrl || movie.thumbnailUrl" [alt]="movie.title" class="w-full h-auto">
             </div>

            <div class="flex-grow text-center md:text-left space-y-4">
              <div class="flex flex-wrap gap-2 justify-center md:justify-start">
                @if (movie.metadata?.nollywood) {
                  <span class="bg-cinema-500 text-white text-xs font-bold px-2 py-1 rounded-sm">Nollywood</span>
                }
                <span class="bg-black/10 text-[#24181b] dark:bg-white/10 dark:text-white text-xs font-bold px-2 py-1 rounded-sm">{{ movie.year }}</span>
                <span class="bg-green-500/20 text-green-400 text-xs font-bold px-2 py-1 rounded-sm">{{ movie.rating }}% Match</span>
                @if (movie.isStreamOnly) {
                  <span class="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-sm">STREAM ONLY</span>
                }
              </div>

              <h1 class="text-3xl md:text-5xl font-serif font-bold leading-tight">{{ movie.title }}</h1>
              @if (movie.tagline) {
                <p class="text-base md:text-lg text-[#6f5b54] dark:text-gray-300 italic">{{ movie.tagline }}</p>
              }
              
              <div class="text-[#725f58] dark:text-gray-400 text-sm md:text-base flex flex-wrap gap-x-4 gap-y-1 justify-center md:justify-start">
                <span>{{ getDuration(movie.durationMinutes) }}</span>
                <span>•</span>
                <span>{{ movie.genre.join(', ') }}</span>
                <span>•</span>
                <span>{{ movie.language }}</span>
              </div>

              <div class="flex flex-wrap gap-2 justify-center md:justify-start">
                @if (movie.imdbRating) {
                  <span class="bg-yellow-400 text-black text-xs font-bold px-3 py-1 rounded-sm">IMDb {{ movie.imdbRating.toFixed(1) }}</span>
                }
                @if (movie.rottenTomatoes) {
                  <span class="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-sm">Tomatometer {{ movie.rottenTomatoes }}</span>
                }
                @if (movie.tmdbRating) {
                  <span class="bg-sky-500 text-white text-xs font-bold px-3 py-1 rounded-sm">TMDB {{ movie.tmdbRating.toFixed(1) }}</span>
                }
              </div>

               <!-- Action Buttons -->
               <div class="flex flex-wrap gap-3 pt-4">
                @if (canWatch(movie)) {
                  <a
                    [routerLink]="['/watch', movie.slug]"
                    class="inline-flex items-center gap-2 bg-white text-cinema-900 px-6 py-3 rounded-full font-bold hover:bg-gray-100 transition-colors"
                  >
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                     Watch Now
                   </a>
                } @else if (hasDownloadOption(movie)) {
                  <a
                    [href]="primaryDownloadUrl(movie) || '#'"
                    [attr.download]="isMagnetUrl(primaryDownloadUrl(movie) || '') ? null : ''"
                    class="inline-flex items-center gap-2 bg-cinema-500 text-white px-6 py-3 rounded-full font-bold hover:bg-cinema-400 transition-colors"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                    {{ isMagnetUrl(primaryDownloadUrl(movie) || '') ? 'Open Torrent' : 'Download' }}
                  </a>
                }
                @if (movie.trailerUrl) {
                  <a
                    [href]="movie.trailerUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-2 border border-cinema-500/60 text-cinema-100 px-6 py-3 rounded-full font-bold hover:bg-cinema-500/15 transition-colors"
                  >
                    Watch Trailer
                  </a>
                }
                
                @if (auth.currentUser()) {
                  <button 
                    (click)="toggleWatchlist()"
                    [disabled]="watchlistMutation.isPending()"
                    class="inline-flex items-center gap-2 border border-white/30 text-white px-6 py-3 rounded-full font-bold hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    @if (watchlistMutation.isPending()) {
                      <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    } @else {
                      <svg class="w-5 h-5" [class.text-red-500]="isInWatchlist(movie.id)" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" />
                      </svg>
                    }
                    {{ isInWatchlist(movie.id) ? 'In Watchlist' : 'Add to Watchlist' }}
                  </button>

                  <!-- Notification Bell -->
                  <button
                    (click)="toggleNotification(movie.id)"
                    [disabled]="updatingNotification()"
                    class="inline-flex items-center gap-2 border border-white/30 text-white px-4 py-3 rounded-full font-bold hover:bg-white/10 transition-colors disabled:opacity-50"
                    [title]="isSubscribedToNotifications() ? 'Unsubscribe from notifications' : 'Notify me when available in HD'"
                  >
                    @if (updatingNotification()) {
                      <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    } @else {
                      @if (isSubscribedToNotifications()) {
                        <svg class="w-5 h-5 text-cinema-500" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                        </svg>
                      } @else {
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      }
                    }
                  </button>
                }
              </div>
            </div>
          </div>
        </div>

        <div class="container mx-auto px-4 pb-20 grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div class="lg:col-span-2 space-y-8">
            <section>
               <h3 class="text-xl font-serif font-bold text-[#24181b] dark:text-white mb-3">Synopsis</h3>
               <p class="text-[#725f58] dark:text-gray-400 leading-relaxed">{{ movie.overview || movie.description || 'No description available.' }}</p>
            </section>

            <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 class="font-bold text-[#24181b] dark:text-white mb-2">Director</h4>
                <p class="text-[#725f58] dark:text-gray-500">{{ movie.metadata?.director || 'Unknown' }}</p>
              </div>
              <div>
                <h4 class="font-bold text-[#24181b] dark:text-white mb-2">Top Cast</h4>
                @if ((movie.cast || []).length > 0) {
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    @for (actor of movie.cast; track actor.id) {
                      <div class="bg-[#f0e4da] dark:bg-cinema-800/70 border border-[#d9c4b7] dark:border-white/10 rounded-lg p-3 text-center">
                        @if (actor.photoUrl) {
                          <img [src]="actor.photoUrl" [alt]="actor.name" class="w-14 h-14 rounded-full object-cover mx-auto mb-2 border border-[#d9c4b7] dark:border-white/10">
                        } @else {
                          <div class="w-14 h-14 rounded-full bg-[#dfc8bb] dark:bg-cinema-700 text-[#6b3d2e] dark:text-cinema-200 mx-auto mb-2 flex items-center justify-center text-xs font-bold">
                            {{ actorInitials(actor.name) }}
                          </div>
                        }
                        <p class="text-sm text-[#24181b] dark:text-white font-semibold leading-tight">{{ actor.name }}</p>
                        <p class="text-xs text-[#725f58] dark:text-gray-400 leading-tight">{{ actor.character || 'Cast' }}</p>
                      </div>
                    }
                  </div>
                } @else {
                  <div class="flex flex-wrap gap-2">
                    @for (actor of movie.metadata?.cast || []; track actor) {
                      <span class="bg-[#f0e4da] dark:bg-cinema-800 text-[#24181b] dark:text-gray-300 text-sm px-3 py-1 rounded-sm">{{ actor }}</span>
                    }
                  </div>
                }
              </div>
            </section>
          </div>

          <div class="lg:col-span-1">
            <div class="bg-[#f8f0e9] dark:bg-cinema-800/50 backdrop-blur-sm border border-[#d9c4b7] dark:border-white/5 p-6 sticky top-24">
              @if (movie.isStreamOnly) {
                <!-- Stream Only Card -->
                <div class="text-center py-6">
                  <div class="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  </div>
                  <h3 class="text-lg font-serif font-bold text-[#24181b] dark:text-white mb-2">Stream Only</h3>
                  <p class="text-[#725f58] dark:text-gray-400 text-sm mb-4">This movie is available for streaming only.</p>
                  @if (canWatch(movie)) {
                    <a 
                      [routerLink]="['/watch', movie.slug]" 
                      class="inline-block bg-cinema-500 hover:bg-cinema-400 text-white font-bold px-6 py-3 rounded-full transition-colors w-full"
                    >
                      ▶ Watch Now
                    </a>
                  }
                </div>
              } @else {
                <!-- Watch Now button for non-stream movies that have playable content -->
                @if (canWatch(movie)) {
                  <a 
                    [routerLink]="['/watch', movie.slug]" 
                    class="flex items-center justify-center gap-2 bg-cinema-500 hover:bg-cinema-400 text-white font-bold px-6 py-3 rounded-full transition-colors w-full mb-5"
                  >
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                    Watch Now
                  </a>
                }

                <!-- Download Options Card -->
                <h3 class="text-lg font-serif font-bold text-[#24181b] dark:text-white mb-4 flex items-center gap-2">
                  <svg class="w-5 h-5 text-cinema-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                  Download Options
                </h3>

                <div class="space-y-3">
                  @for (q of movie.quality; track q) {
                    @if (getQualityAccess(movie, q); as qualityAccess) {
                    <div class="flex items-center justify-between p-3 rounded-sm border border-[#d9c4b7] dark:border-white/10 hover:border-cinema-500/50 hover:bg-cinema-500/10 transition-colors group">
                      <div class="min-w-0 flex-1 mr-2">
                        <div class="font-bold text-[#24181b] dark:text-white">{{ q }}</div>
                        <div class="text-xs text-[#725f58] dark:text-gray-500">
                          {{ getFileSize(movie.fileSizes, q) }}
                        </div>
                        @if (!qualityAccess.link) {
                          <div class="text-[11px] text-[#8a756e] dark:text-gray-500 mt-1">
                            Source is still being prepared for this quality.
                          </div>
                        }
                        <!-- Offline download progress bar -->
                        @if (getOfflineStatus(movie.id, q) === 'downloading' || getOfflineStatus(movie.id, q) === 'queued') {
                          <div class="mt-1 h-1 bg-[#d9c4b7] dark:bg-white/10 rounded-full overflow-hidden">
                            <div
                              class="h-full bg-cinema-500 transition-all duration-300"
                              [style.width.%]="getOfflineProgress(movie.id, q) ?? 0"
                            ></div>
                          </div>
                          <div class="text-[10px] text-cinema-500 mt-0.5">
                            {{ getOfflineStatus(movie.id, q) === 'queued' ? 'Queued…' : '' }} {{ getOfflineProgress(movie.id, q) }}%
                          </div>
                        }
                        @if (getOfflineStatus(movie.id, q) === 'error') {
                          <div class="text-[10px] text-red-400 mt-0.5">Download failed — tap retry</div>
                        }
                      </div>

                      <div class="flex gap-1.5 flex-shrink-0">
                        <!-- External download link -->
                        @if (qualityAccess.link) {
                          <a
                            [href]="qualityAccess.link"
                            [attr.download]="isMagnetUrl(qualityAccess.link) ? null : ''"
                            class="bg-cinema-500 hover:bg-cinema-400 text-white text-xs font-bold px-3 py-2 rounded-sm transition-colors"
                            [title]="qualityAccess.label"
                          >
                            {{ qualityAccess.label }}
                          </a>
                        } @else {
                          <button
                            type="button"
                            disabled
                            class="bg-gray-400/40 text-gray-700 dark:text-gray-300 text-xs font-bold px-3 py-2 rounded-sm cursor-not-allowed"
                            title="Not available yet"
                          >
                            Not Ready
                          </button>
                        }

                        <!-- Save for offline (PWA) — only for authenticated premium users -->
                        @if (auth.currentUser() && offline.isSupported) {
                          @if (getOfflineStatus(movie.id, q) === 'complete') {
                            <!-- Saved — tap to remove -->
                            <button
                              (click)="removeOffline(movie.id, q)"
                              class="bg-green-600/20 border border-green-500/40 text-green-400 text-xs font-bold px-3 py-2 rounded-sm transition-colors hover:bg-red-600/20 hover:border-red-500/40 hover:text-red-400"
                              title="Saved offline — tap to remove"
                            >
                              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                              </svg>
                            </button>
                          } @else if (getOfflineStatus(movie.id, q) === 'downloading' || getOfflineStatus(movie.id, q) === 'queued') {
                            <!-- Downloading spinner -->
                            <button disabled class="border border-cinema-500/40 text-cinema-400 text-xs font-bold px-3 py-2 rounded-sm opacity-60 cursor-not-allowed">
                              <span class="w-3.5 h-3.5 border-2 border-cinema-400/30 border-t-cinema-400 rounded-full animate-spin inline-block"></span>
                            </button>
                          } @else {
                            <!-- Save for offline button -->
                            <button
                              (click)="saveOffline(movie, q)"
                              class="border border-[#d9c4b7] dark:border-white/20 text-[#725f58] dark:text-gray-400 text-xs font-bold px-3 py-2 rounded-sm transition-colors hover:border-cinema-500/50 hover:text-cinema-500"
                              title="Save for offline viewing"
                            >
                              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                              </svg>
                            </button>
                          }
                        }
                      </div>
                    </div>
                    }
                  }
                </div>

                <!-- Offline library link -->
                @if (auth.currentUser() && offline.isSupported && hasOfflineSaves(movie.id)) {
                  <div class="mt-3 p-3 rounded-sm bg-green-500/10 border border-green-500/20 text-sm text-green-400 flex items-center gap-2">
                    <svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M3 12v3c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3H3zm13-9H4C3.45 3 3 3.45 3 4v6h14V4c0-.55-.45-1-1-1z"/>
                    </svg>
                    Available offline
                  </div>
                }

                <div class="mt-6 pt-4 border-t border-[#d9c4b7] dark:border-white/5 text-center">
                   <p class="text-xs text-[#725f58] dark:text-gray-500 mb-2">Premium Quality Downloads</p>
                   <div class="flex justify-center gap-4 text-[#a08070] dark:text-gray-600 text-xs">
                      <span>Secure</span>
                      <span>Fast</span>
                      <span>4K</span>
                   </div>
                </div>

                <app-effectivegate-banner></app-effectivegate-banner>

                @if (!auth.currentUser()?.isPremium) {
                  <div class="mt-3 text-center">
                    <a
                      [href]="smartlinkUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-2 rounded-full border border-[#d9c4b7] px-4 py-2 text-xs font-semibold text-[#725f58] transition-colors hover:border-cinema-500/60 hover:text-cinema-500"
                    >
                      Sponsor offers
                    </a>
                  </div>
                }
              }
            </div>
          </div>

        </div>

        <!-- Related Movies Section -->
        @if (similarMoviesSignal() && similarMoviesSignal().length > 0) {
          <div class="mt-12 border-t border-[#d9c4b7] dark:border-white/5 pt-8">
            <h2 class="text-2xl font-serif font-bold text-[#24181b] dark:text-white mb-6">More Like This</h2>
            
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              @for (movie of similarMoviesSignal(); track movie.id) {
                <a [routerLink]="['/movies', movie.slug]" class="group block">
                  <div class="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#e5d2c6] dark:bg-cinema-800">
                    @if (movie.posterUrl || movie.thumbnailUrl) {
                      <img 
                        [src]="movie.posterUrl || movie.thumbnailUrl" 
                        [alt]="movie.title"
                        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    } @else {
                      <div class="w-full h-full flex items-center justify-center text-[#9f7d73] dark:text-gray-600">
                        <svg class="w-12 h-12" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 100 4v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2a2 2 0 100-4V6z"/>
                        </svg>
                      </div>
                    }
                    
                    @if (movie.isStreamOnly) {
                      <span class="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">STREAM</span>
                    }
                  </div>
                  
                  <div class="mt-2">
                    <h3 class="text-sm font-medium text-[#24181b] dark:text-white line-clamp-1 group-hover:text-cinema-500 transition-colors">{{ movie.title }}</h3>
                    <p class="text-xs text-[#9f7d73]">{{ movie.year }} • {{ movie.rating || '0' }}% Match</p>
                  </div>
                </a>
              }
            </div>
          </div>
        }
      }
    }
  `
})
export class MovieDetailComponent {
  readonly smartlinkUrl = 'https://www.effectivegatecpm.com/qm7irj9i?key=106d46d6ef4f93102f2d54643357b11c';
  slug = input<string>('');
  
  private moviesService = inject(MoviesQueryService);
  private profileService = inject(ProfileQueryService);
  private meta = inject(Meta);
  private title = inject(Title);
  private location = inject(Location);
  private http = inject(HttpClient);
  auth = inject(AuthService);
  offline = inject(OfflineStorageService);
  
  query = this.moviesService.getMovieDetailQuery(this.slug);
  watchlistMutation = this.profileService.toggleWatchlistMutation();
  profileQuery = this.profileService.getProfileQuery();

  // Similar/Related movies - fetch when slug changes
  similarMoviesSignal = toSignal(
    toObservable(this.slug).pipe(
      switchMap((slug) =>
        !slug
          ? of([] as Movie[])
          : this.http.get<{ data: Movie[] }>(`/api/v1/movies/${slug}/similar`).pipe(
              map((response) => response.data || []),
              catchError(() => of([] as Movie[]))
            )
      )
    ),
    { initialValue: [] as Movie[] }
  );

  // Notification subscription state
  notificationSubscribed = signal<boolean>(false);
  updatingNotification = signal<boolean>(false);

  constructor() {
    // Automatically update SEO tags and check notification status when data arrives
    effect(() => {
      const movie = this.query.data()?.data;
      if (movie) {
        // 1. Browser Title
        this.title.setTitle(`${movie.title} (${movie.year}) | NaijasPride`);

        // 2. OpenGraph (Facebook/WhatsApp)
        this.meta.updateTag({ property: 'og:title', content: movie.title });
        this.meta.updateTag({ property: 'og:description', content: movie.description || 'Watch now on NaijasPride.' });
        this.meta.updateTag({ property: 'og:image', content: movie.thumbnailUrl || '' });
        this.meta.updateTag({ property: 'og:url', content: `https://naijaspride.com/movies/${movie.slug}` });
        this.meta.updateTag({ property: 'og:type', content: 'video.movie' });

        // 3. Twitter Card
        this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
        this.meta.updateTag({ name: 'twitter:title', content: movie.title });
        this.meta.updateTag({ name: 'twitter:description', content: movie.description || '' });
        this.meta.updateTag({ name: 'twitter:image', content: movie.thumbnailUrl || '' });

        // 4. Check notification subscription status
        if (this.auth.currentUser()) {
          this.checkNotificationStatus(movie.id);
        }
      }
    });
  }

  private checkNotificationStatus(movieId: string) {
    this.http.get<{ data: { subscribed: boolean } }>(`/api/v1/movies/notifications/check/${movieId}`)
      .subscribe({
        next: (res) => this.notificationSubscribed.set(res.data.subscribed),
        error: () => this.notificationSubscribed.set(false)
      });
  }

  toggleNotification(movieId: string) {
    if (this.updatingNotification()) return;

    this.updatingNotification.set(true);
    const isSubscribed = this.notificationSubscribed();

    if (isSubscribed) {
      // Unsubscribe
      this.http.delete(`/api/v1/movies/notifications/${movieId}`).subscribe({
        next: () => {
          this.notificationSubscribed.set(false);
          this.updatingNotification.set(false);
        },
        error: () => {
          this.updatingNotification.set(false);
        }
      });
    } else {
      // Subscribe
      this.http.post('/api/v1/movies/notifications', { movieId }).subscribe({
        next: () => {
          this.notificationSubscribed.set(true);
          this.updatingNotification.set(false);
        },
        error: () => {
          this.updatingNotification.set(false);
        }
      });
    }
  }

  isSubscribedToNotifications(): boolean {
    return this.notificationSubscribed();
  }

  goBack() {
    this.location.back();
  }

  isInWatchlist(movieId: string): boolean {
    const profile = this.profileQuery.data()?.data;
    if (!profile) return false;
    return profile.watchlist.some((movie: { id: string }) => movie.id === movieId);
  }

  toggleWatchlist() {
    const movie = this.query.data()?.data;
    if (movie) {
      this.watchlistMutation.mutate(movie.id);
    }
  }

  getDuration(mins: number | null) {
    if (!mins) return 'Unknown';
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  getFileSize(sizes: Record<string, number>, quality: string) {
    const size = sizes[quality];
    if (!size) return 'Unknown size';
    const gb = size / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = size / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  }

  getHeroBackdrop(movie: Movie) {
    return movie.backdropUrl || movie.coverUrl || movie.posterUrl || movie.thumbnailUrl || '';
  }

  actorInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  // ── Offline / Save for offline ────────────────────────────────────────────

  getOfflineStatus(movieId: string, quality: string) {
    return this.offline.getStatus(movieId, quality);
  }

  getOfflineProgress(movieId: string, quality: string): number | null {
    return this.offline.getProgress(movieId, quality);
  }

  hasOfflineSaves(movieId: string): boolean {
    return this.offline.downloads().some(d => d.movieId === movieId && d.status === 'complete');
  }

  saveOffline(movie: Movie, quality: string) {
    const fileUrl = this.resolveQualityUrl(movie, quality);
    if (!fileUrl || this.isMagnetUrl(fileUrl)) return;
    const fileSizeBytes = (movie.fileSizes as Record<string, number>)[quality];
    this.offline.download({
      movieId: movie.id,
      movieTitle: movie.title,
      movieSlug: movie.slug,
      quality,
      fileUrl,
      fileSizeBytes,
      thumbnailUrl: movie.thumbnailUrl ?? undefined,
    }).catch(err => console.error('[Offline] Download failed:', err));
  }

  removeOffline(movieId: string, quality: string) {
    this.offline.remove(movieId, quality).catch(console.error);
  }

  private isStreamableVideoUrl(url: string): boolean {
    const raw = (url || '').trim();
    if (!raw) return false;
    if (/^magnet:\?/i.test(raw)) return false;
    if (/\.torrent(\?|#|$)/i.test(raw)) return false;

    const withoutHash = raw.split('#')[0] || raw;
    try {
      const parsed = new URL(withoutHash, 'http://localhost');
      const key = parsed.searchParams.get('key');
      const target = (key || parsed.pathname || '').toLowerCase();
      if (target.endsWith('.mp4') || target.endsWith('.m3u8')) return true;
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      const clean = (withoutHash.split('?')[0] || '').toLowerCase();
      if (clean.endsWith('.mp4') || clean.endsWith('.m3u8')) return true;
      return /^https?:\/\//i.test(raw);
    }
  }

  canWatch(movie: Movie): boolean {
    if (movie.youtubeId) return true;
    const urls = movie.fileUrls || {};
    return Object.values(urls).some(
      (value) => typeof value === 'string' && value.trim().length > 0 && this.isStreamableVideoUrl(value)
    );
  }

  isMagnetUrl(url: string): boolean {
    return /^magnet:\?/i.test((url || '').trim());
  }

  hasDownloadOption(movie: Movie): boolean {
    const urls = movie.fileUrls || {};
    return Object.values(urls).some((value) => typeof value === 'string' && value.trim().length > 0);
  }

  primaryDownloadUrl(movie: Movie): string | null {
    const urls = movie.fileUrls || {};
    const qualityFirst = movie.quality
      .map((q) => this.resolveQualityUrl(movie, q))
      .find((value) => !!value);
    if (qualityFirst) return this.toDirectDownloadLink(qualityFirst);

    const firstAny = Object.values(urls).find((value) => typeof value === 'string' && value.trim().length > 0);
    return typeof firstAny === 'string' ? this.toDirectDownloadLink(firstAny) : null;
  }

  resolveQualityUrl(movie: Movie, quality: string): string | null {
    const urls = movie.fileUrls || {};
    const exact = urls[quality];
    if (typeof exact === 'string' && exact.trim().length > 0) {
      return exact;
    }

    const hls = urls['hls'];
    if (typeof hls === 'string' && hls.trim().length > 0) {
      return hls;
    }

    return null;
  }

  getQualityAccess(movie: Movie, quality: string): { link: string | null; label: string } {
    const rawLink = this.resolveQualityUrl(movie, quality);
    const link = rawLink ? this.toDirectDownloadLink(rawLink) : null;
    if (!link) {
      return { link: null, label: 'Not Ready' };
    }

    if (this.isMagnetUrl(link)) {
      return { link, label: 'Open Torrent' };
    }

    return { link, label: 'Download' };
  }

  private toDirectDownloadLink(url: string): string {
    const raw = (url || '').trim();
    if (!raw) return raw;
    if (this.isMagnetUrl(raw)) return raw;

    try {
      const parsed = new URL(raw);
      const isMediaHost = /(^|\.)media\.naijaspride\.com$/i.test(parsed.hostname);
      if (isMediaHost) {
        const key = parsed.pathname.replace(/^\/+/, '');
        if (key.startsWith('movies/')) {
          return `/api/v1/movies/download?key=${encodeURIComponent(key)}`;
        }
      }
    } catch {
      // fall through
    }

    if (raw.startsWith('movies/')) {
      return `/api/v1/movies/download?key=${encodeURIComponent(raw)}`;
    }

    return raw;
  }
}
