import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'movies',
    pathMatch: 'full'
  },
  {
    path: 'movies',
    loadComponent: () => import('./features/movies/pages/movie-list/movie-list.component')
      .then(m => m.MovieListComponent)
  },
  {
    path: 'movies/:slug',
    loadComponent: () => import('./features/movies/pages/movie-detail/movie-detail.component')
      .then(m => m.MovieDetailComponent)
  },
  
  // ADMIN ROUTES
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/layouts/admin-layout/admin-layout.component')
      .then(m => m.AdminLayoutComponent),
    children: [
      {
        path: 'movies',
        loadComponent: () => import('./features/admin/pages/admin-movie-create/admin-movie-create.component')
          .then(m => m.AdminMovieCreateComponent)
      },
      { path: '', redirectTo: 'movies', pathMatch: 'full' }
    ]
  }
];
