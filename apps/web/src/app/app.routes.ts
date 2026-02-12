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
    path: 'movies/stream',
    loadComponent: () => import('./features/movies/pages/stream-only-movies/stream-only-movies.component')
      .then(m => m.StreamOnlyMoviesComponent)
  },
  // Legacy redirect
  {
    path: 'movies/youtube',
    redirectTo: 'movies/stream',
    pathMatch: 'full'
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
  
  // WATCH ROOM - Streaming experience (now open to guests)
  {
    path: 'watch/:slug',
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
    loadComponent: () => import('./features/books/pages/book-hub/book-hub.component')
      .then(m => m.BookHubComponent)
  },
  {
    path: 'books/all',
    loadComponent: () => import('./features/books/pages/book-list/book-list.component')
      .then(m => m.BookListComponent)
  },
  {
    path: 'books/comics',
    loadComponent: () => import('./features/books/pages/comics-library/comics-library.component')
      .then(m => m.ComicsLibraryComponent)
  },
  {
    path: 'books/comics/read/:chapterId',
    loadComponent: () => import('./features/books/pages/manga-reader/manga-reader.component')
      .then(m => m.MangaReaderComponent)
  },
  {
    path: 'books/comics/:mangaId',
    loadComponent: () => import('./features/books/pages/manga-detail/manga-detail.component')
      .then(m => m.MangaDetailComponent)
  },
  {
    path: 'books/manga',
    loadComponent: () => import('./features/books/pages/manga-library/manga-library.component')
      .then(m => m.MangaLibraryComponent)
  },
  {
    path: 'books/manga/read/:chapterId',
    loadComponent: () => import('./features/books/pages/manga-reader/manga-reader.component')
      .then(m => m.MangaReaderComponent)
  },
  {
    path: 'books/manga/:mangaId',
    loadComponent: () => import('./features/books/pages/manga-detail/manga-detail.component')
      .then(m => m.MangaDetailComponent)
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
        path: 'dashboard',
        loadComponent: () => import('./features/admin/pages/admin-dashboard/admin-dashboard.component')
          .then(m => m.AdminDashboardComponent)
      },
      {
        path: 'books',
        loadComponent: () => import('./features/admin/pages/admin-books/admin-books.component')
          .then(m => m.AdminBooksComponent)
      },
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
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  }
];
