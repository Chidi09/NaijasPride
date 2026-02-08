import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { adminGuard } from './core/auth/admin.guard';
import { AuthStateService } from './core/auth/auth-state.service';
import { authGuard } from './core/auth/auth.guard';

const guestLandingGuard = () => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  if (authState.isAuthenticated()) {
    return router.createUrlTree(['/browse']);
  }

  return true;
};

export const routes: Routes = [
  {
    path: '',
    canActivate: [guestLandingGuard],
    loadComponent: () => import('./pages/landing/landing.component').then(m => m.LandingComponent)
  },
  {
    path: 'browse',
    loadComponent: () => import('./features/movies/pages/movie-list/movie-list.component')
      .then(m => m.MovieListComponent)
  },
  {
    path: 'movies',
    loadComponent: () => import('./features/movies/pages/movie-list/movie-list.component')
      .then(m => m.MovieListComponent)
  },
  {
    path: 'category/:slug',
    loadComponent: () => import('./features/movies/pages/movie-list/movie-list.component')
      .then(m => m.MovieListComponent)
  },
  {
    path: 'movies/:slug',
    loadComponent: () => import('./features/movies/pages/movie-detail/movie-detail.component')
      .then(m => m.MovieDetailComponent)
  },
  
  // WATCH ROOM - Streaming experience
  {
    path: 'watch/:slug',
    canActivate: [authGuard],
    loadComponent: () => import('./features/movies/pages/watch-room/watch-room.component')
      .then(m => m.WatchRoomComponent)
  },
  
  // PROFILE ROUTES
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/pages/profile-dashboard/profile-dashboard.component')
      .then(m => m.ProfileDashboardComponent)
  },

  // BOOK ROUTES
  {
    path: 'books',
    loadComponent: () => import('./features/books/pages/book-list/book-list.component')
      .then(m => m.BookListComponent)
  },
  {
    path: 'books/:slug',
    loadComponent: () => import('./features/books/pages/book-detail/book-detail.component')
      .then(m => m.BookDetailComponent)
  },

  // AUTH ROUTES
  {
    path: 'login',
    loadComponent: () => import('./features/auth/pages/login/login.component')
      .then(m => m.LoginComponent)
  },
  
  // PREMIUM ROUTES
  {
    path: 'premium',
    canActivate: [authGuard],
    loadComponent: () => import('./features/premium/pages/premium-landing/premium-landing.component')
      .then(m => m.PremiumLandingComponent)
  },
  
  // ADMIN ROUTES
  {
    path: 'admin',
    canActivate: [adminGuard], // The Lock 🔒
    loadComponent: () => import('./features/admin/layouts/admin-layout/admin-layout.component')
      .then(m => m.AdminLayoutComponent),
    children: [
      {
        path: 'movies',
        loadComponent: () => import('./features/admin/pages/admin-movie-list/admin-movie-list.component')
          .then(m => m.AdminMovieListComponent)
      },
      {
        path: 'movies/new',
        loadComponent: () => import('./features/admin/pages/admin-movie-create/admin-movie-create.component')
          .then(m => m.AdminMovieCreateComponent)
      },
      {
        path: 'discovery',
        loadComponent: () => import('./features/admin/pages/content-discovery/content-discovery.component')
          .then(m => m.ContentDiscoveryComponent)
      },
      { path: '', redirectTo: 'movies', pathMatch: 'full' }
    ]
  }
];
