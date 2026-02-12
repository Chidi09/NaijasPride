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

  // Static/footer pages
  {
    path: 'faq',
    loadComponent: () => import('./pages/static/static-page.component').then(m => m.StaticPageComponent),
    data: {
      title: 'FAQ',
      body: 'Answers to common questions about NaijasPride.\n\nWe are building this page out now.'
    }
  },
  {
    path: 'investors',
    loadComponent: () => import('./pages/static/static-page.component').then(m => m.StaticPageComponent),
    data: {
      title: 'Investor Relations',
      body: 'Investor relations information will appear here.\n\nFor now, contact us via the Contact page.'
    }
  },
  {
    path: 'privacy',
    loadComponent: () => import('./pages/static/static-page.component').then(m => m.StaticPageComponent),
    data: {
      title: 'Privacy',
      body: 'Privacy policy details will appear here.\n\nWe are finalizing the policy text.'
    }
  },
  {
    path: 'help',
    loadComponent: () => import('./pages/static/static-page.component').then(m => m.StaticPageComponent),
    data: {
      title: 'Help Center',
      body: 'Need help?\n\n1) Check your internet connection\n2) Try refreshing\n3) If the issue persists, contact support.'
    }
  },
  {
    path: 'jobs',
    loadComponent: () => import('./pages/static/static-page.component').then(m => m.StaticPageComponent),
    data: {
      title: 'Jobs',
      body: 'We are hiring.\n\nOpen roles will be listed here soon.'
    }
  },
  {
    path: 'cookies',
    loadComponent: () => import('./pages/static/static-page.component').then(m => m.StaticPageComponent),
    data: {
      title: 'Cookie Preferences',
      body: 'Cookie preferences and controls will be added here.\n\nAt the moment, we only use cookies needed for authentication/session where applicable.'
    }
  },
  {
    path: 'account',
    loadComponent: () => import('./pages/static/static-page.component').then(m => m.StaticPageComponent),
    data: {
      title: 'Account',
      body: 'Manage your account from the Profile page.\n\nGo to Profile to see your watchlist and history.'
    }
  },
  {
    path: 'ways-to-watch',
    loadComponent: () => import('./pages/static/static-page.component').then(m => m.StaticPageComponent),
    data: {
      title: 'Ways to Watch',
      body: 'Watch on web, mobile, and TV.\n\nWe are improving device support and performance.'
    }
  },
  {
    path: 'corporate',
    loadComponent: () => import('./pages/static/static-page.component').then(m => m.StaticPageComponent),
    data: {
      title: 'Corporate Information',
      body: 'Corporate information will be published here.'
    }
  },
  {
    path: 'media',
    loadComponent: () => import('./pages/static/static-page.component').then(m => m.StaticPageComponent),
    data: {
      title: 'Media Center',
      body: 'Press and media resources will be available here.'
    }
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/static/static-page.component').then(m => m.StaticPageComponent),
    data: {
      title: 'Terms of Use',
      body: 'Terms of use will appear here.\n\nWe are finalizing the legal text.'
    }
  },
  {
    path: 'contact',
    loadComponent: () => import('./pages/static/static-page.component').then(m => m.StaticPageComponent),
    data: {
      title: 'Contact Us',
      body: 'Contact us for support, content requests, or business inquiries.\n\nEmail: support@naijaspride.com (placeholder)'
    }
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
