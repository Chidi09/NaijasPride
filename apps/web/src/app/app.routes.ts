import { inject } from "@angular/core";
import { Router, Routes } from "@angular/router";
import { adminGuard } from "./core/auth/admin.guard";
import { AuthStateService } from "./core/auth/auth-state.service";
import { authGuard } from "./core/auth/auth.guard";

const guestLandingGuard = () => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  if (authState.isAuthenticated()) {
    return router.createUrlTree(["/home"]);
  }

  return true;
};

export const routes: Routes = [
  // ──────────────────────────────────────────────────────────────
  // 1. ENTRY & ONBOARDING
  // ──────────────────────────────────────────────────────────────
  {
    path: "",
    canActivate: [guestLandingGuard],
    loadComponent: () =>
      import("./pages/landing/editorial-landing.component").then(
        (m) => m.EditorialLandingComponent,
      ),
  },
  {
    path: "auth",
    children: [
      {
        path: "login",
        loadComponent: () =>
          import("./features/auth/pages/login/login.component").then(
            (m) => m.LoginComponent,
          ),
      },
      {
        path: "register",
        loadComponent: () =>
          import("./features/auth/pages/register/register.component").then(
            (m) => m.RegisterComponent,
          ),
      },
      {
        path: "forgot-password",
        loadComponent: () =>
          import("./features/auth/pages/forgot-password/forgot-password.component").then(
            (m) => m.ForgotPasswordComponent,
          ),
      },
      {
        path: "reset-password",
        loadComponent: () =>
          import("./features/auth/pages/reset-password/reset-password.component").then(
            (m) => m.ResetPasswordComponent,
          ),
      },
      {
        path: "verify-email",
        loadComponent: () =>
          import("./features/auth/pages/verify-email/verify-email.component").then(
            (m) => m.VerifyEmailComponent,
          ),
      },
    ],
  },
  // Legacy auth redirects (keep old URLs working)
  { path: "login", redirectTo: "auth/login", pathMatch: "full" },
  { path: "register", redirectTo: "auth/register", pathMatch: "full" },
  {
    path: "forgot-password",
    redirectTo: "auth/forgot-password",
    pathMatch: "full",
  },
  {
    path: "reset-password",
    redirectTo: "auth/reset-password",
    pathMatch: "full",
  },
  { path: "verify-email", redirectTo: "auth/verify-email", pathMatch: "full" },

  // ──────────────────────────────────────────────────────────────
  // 2. MAIN DASHBOARD (Cross-Content Continue Watching/Reading)
  // ──────────────────────────────────────────────────────────────
  {
    path: "home",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/home/home.component").then((m) => m.HomeComponent),
  },

  // ──────────────────────────────────────────────────────────────
  // 3. SEARCH (Global, cross-content)
  // ──────────────────────────────────────────────────────────────
  {
    path: "search",
    loadComponent: () =>
      import("./features/search/pages/global-search/global-search.component").then(
        (m) => m.GlobalSearchComponent,
      ),
  },

  // ──────────────────────────────────────────────────────────────
  // 4. MOVIES HUB (The Spoke Center for all Video)
  // ──────────────────────────────────────────────────────────────
  {
    path: "movies",
    canActivate: [authGuard],
    children: [
      // Editorial landing — curated stream-first movie rows
      {
        path: "",
        loadComponent: () =>
          import("./features/movies/pages/movies-editorial-landing/movies-editorial-landing.component").then(
            (m) => m.MoviesEditorialLandingComponent,
          ),
      },
      // Stream-only full library (YouTube / hosted streams)
      {
        path: "stream",
        loadComponent: () =>
          import("./features/movies/pages/stream-only-movies/stream-only-movies.component").then(
            (m) => m.StreamOnlyMoviesComponent,
          ),
      },
      {
        path: "youtube",
        loadComponent: () =>
          import("./features/movies/pages/stream-only-movies/stream-only-movies.component").then(
            (m) => m.StreamOnlyMoviesComponent,
          ),
      },
      {
        path: "library",
        loadComponent: () =>
          import("./features/movies/pages/movie-list/movie-list.component").then(
            (m) => m.MovieListComponent,
          ),
      },
      // Legacy download route redirected (embed-first policy)
      { path: "downloads", redirectTo: "stream", pathMatch: "full" },
      // Single detail page (synopsis, cast, and stream action)
      {
        path: ":slug",
        loadComponent: () =>
          import("./features/movies/pages/movie-detail/movie-detail.component").then(
            (m) => m.MovieDetailComponent,
          ),
      },
      // Player (activated from detail page)
      {
        path: ":slug/watch",
        loadComponent: () =>
          import("./features/movies/pages/watch-room/watch-room.component").then(
            (m) => m.WatchRoomComponent,
          ),
      },
    ],
  },
  { path: "browse", redirectTo: "movies", pathMatch: "full" },
  {
    path: "category/:slug",
    loadComponent: () =>
      import("./features/movies/pages/movie-list/movie-list.component").then(
        (m) => m.MovieListComponent,
      ),
  },
  // Legacy watch route redirect
  { path: "watch/:slug", redirectTo: "movies/:slug/watch", pathMatch: "full" },

  {
    path: "tv-shows",
    canActivate: [authGuard],
    children: [
      {
        path: "",
        loadComponent: () =>
          import("./features/tv-shows/pages/tv-shows-list/tv-shows-list.component").then(
            (m) => m.TvShowsListComponent,
          ),
      },
      {
        path: ":slug/watch",
        loadComponent: () =>
          import("./features/tv-shows/pages/tv-watch-room/tv-watch-room.component").then(
            (m) => m.TvWatchRoomComponent,
          ),
      },
      {
        path: ":slug",
        loadComponent: () =>
          import("./features/tv-shows/pages/tv-show-detail/tv-show-detail.component").then(
            (m) => m.TvShowDetailComponent,
          ),
      },
    ],
  },

  {
    path: "anime",
    canActivate: [authGuard],
    children: [
      {
        path: "",
        loadComponent: () =>
          import("./features/anime/pages/anime-list/anime-list.component").then(
            (m) => m.AnimeListComponent,
          ),
      },
      {
        path: ":id/watch/:episodeNumber",
        loadComponent: () =>
          import("./features/anime/pages/anime-watch/anime-watch.component").then(
            (m) => m.AnimeWatchComponent,
          ),
      },
      {
        path: ":id",
        loadComponent: () =>
          import("./features/anime/pages/anime-detail/anime-detail.component").then(
            (m) => m.AnimeDetailComponent,
          ),
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  // 5. BOOKS & MANGA HUB
  //    Tabs for Novels, Manga, Comics within the hub
  // ──────────────────────────────────────────────────────────────
  {
    path: "books",
    canActivate: [authGuard],
    children: [
      // Main reading dashboard (tabs for Novels, Manga, Comics)
      {
        path: "",
        loadComponent: () =>
          import("./features/books/pages/book-hub/book-hub.component").then(
            (m) => m.BookHubComponent,
          ),
      },
      // Library views
      {
        path: "all",
        loadComponent: () =>
          import("./features/books/pages/book-list/book-list.component").then(
            (m) => m.BookListComponent,
          ),
      },
      {
        path: "light-novels",
        loadComponent: () =>
          import("./features/books/pages/light-novels-library/light-novels-library.component").then(
            (m) => m.LightNovelsLibraryComponent,
          ),
      },
      {
        path: "comics",
        loadComponent: () =>
          import("./features/books/pages/comics-library/comics-library.component").then(
            (m) => m.ComicsLibraryComponent,
          ),
      },
      {
        path: "manga",
        loadComponent: () =>
          import("./features/books/pages/manga-library/manga-library.component").then(
            (m) => m.MangaLibraryComponent,
          ),
      },
      // Book detail & reader
      {
        path: "novel/:slug",
        loadComponent: () =>
          import("./features/books/pages/book-detail/book-detail.component").then(
            (m) => m.BookDetailComponent,
          ),
      },
      {
        path: "novel/:slug/read",
        loadComponent: () =>
          import("./features/books/pages/book-reader/book-reader.component").then(
            (m) => m.BookReaderComponent,
          ),
      },
      // Manga detail & reader
      {
        path: "manga/:mangaId",
        loadComponent: () =>
          import("./features/books/pages/manga-detail/manga-detail.component").then(
            (m) => m.MangaDetailComponent,
          ),
      },
      {
        path: "manga/:mangaId/read/:chapter",
        loadComponent: () =>
          import("./features/books/pages/manga-reader/manga-reader.component").then(
            (m) => m.MangaReaderComponent,
          ),
      },
      // Comics detail & reader (same components as manga)
      {
        path: "comics/:mangaId",
        loadComponent: () =>
          import("./features/books/pages/manga-detail/manga-detail.component").then(
            (m) => m.MangaDetailComponent,
          ),
      },
      {
        path: "comics/:mangaId/read/:chapter",
        loadComponent: () =>
          import("./features/books/pages/manga-reader/manga-reader.component").then(
            (m) => m.MangaReaderComponent,
          ),
      },
      // Legacy short book route
      {
        path: ":slug",
        loadComponent: () =>
          import("./features/books/pages/book-detail/book-detail.component").then(
            (m) => m.BookDetailComponent,
          ),
      },
    ],
  },
  // Legacy book redirects
  { path: "books/:slug", redirectTo: "books/novel/:slug", pathMatch: "full" },
  // Legacy reader redirects
  {
    path: "books/read/:slug",
    redirectTo: "books/novel/:slug/read",
    pathMatch: "full",
  },
  {
    path: "books/comics/read/:chapterId",
    redirectTo: "books/comics/:chapterId/read/1",
    pathMatch: "full",
  },
  {
    path: "books/manga/read/:chapterId",
    redirectTo: "books/manga/:chapterId/read/1",
    pathMatch: "full",
  },

  // ──────────────────────────────────────────────────────────────
  // 6. MUSIC HUB
  //    Music plays in the persistent MiniPlayer/Global Service
  // ──────────────────────────────────────────────────────────────
  {
    path: "music",
    canActivate: [authGuard],
    children: [
      // Main music discovery dashboard
      {
        path: "",
        loadComponent: () =>
          import("./features/music/pages/music-landing/music-landing.component").then(
            (m) => m.MusicLandingComponent,
          ),
      },
      // Browse/explore
      {
        path: "browse",
        loadComponent: () =>
          import("./features/music/pages/music-browse/music-browse.component").then(
            (m) => m.MusicBrowseComponent,
          ),
      },
      // Artist profile view
      {
        path: "artist/:slug",
        loadComponent: () =>
          import("./features/music/pages/artist-detail/artist-detail.component").then(
            (m) => m.ArtistDetailComponent,
          ),
      },
      // Music video watch (kept for direct music video content)
      {
        path: ":slug",
        loadComponent: () =>
          import("./features/music/pages/music-watch/music-watch.component").then(
            (m) => m.MusicWatchComponent,
          ),
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  // 7. PROFILE & LIBRARY
  // ──────────────────────────────────────────────────────────────
  {
    path: "profile",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/profile/pages/profile-dashboard/profile-dashboard.component").then(
        (m) => m.ProfileDashboardComponent,
      ),
  },
  {
    path: "library",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/library/pages/unified-library/unified-library.component").then(
        (m) => m.UnifiedLibraryComponent,
      ),
  },
  {
    path: "downloads",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/profile/pages/profile-dashboard/profile-dashboard.component").then(
        (m) => m.ProfileDashboardComponent,
      ),
  },
  {
    path: "account",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/profile/pages/account-settings/account-settings.component").then(
        (m) => m.AccountSettingsComponent,
      ),
  },
  {
    path: "settings",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/profile/pages/account-settings/account-settings.component").then(
        (m) => m.AccountSettingsComponent,
      ),
  },

  {
    path: "profile/plans",
    loadComponent: () =>
      import("./features/profile/components/plans/plans.component").then(
        (m) => m.PlansComponent,
      ),
  },

  // ──────────────────────────────────────────────────────────────
  // 8. PREMIUM & PAYMENTS
  // ──────────────────────────────────────────────────────────────
  {
    path: "premium",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/premium/pages/premium-landing/premium-landing.component").then(
        (m) => m.PremiumLandingComponent,
      ),
  },
  {
    path: "payment/callback",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/premium/pages/payment-callback/payment-callback.component").then(
        (m) => m.PaymentCallbackComponent,
      ),
  },

  // ──────────────────────────────────────────────────────────────
  // 9. WRAPPED (Monthly/Annual Stats)
  // ──────────────────────────────────────────────────────────────
  {
    path: "wrapped",
    loadChildren: () =>
      import("./features/wrapped/wrapped.routes").then((m) => m.WRAPPED_ROUTES),
  },

  // ──────────────────────────────────────────────────────────────
  // 10. STATIC & LEGAL PAGES
  // ──────────────────────────────────────────────────────────────
  {
    path: "faq",
    loadComponent: () =>
      import("./pages/static/static-page.component").then(
        (m) => m.StaticPageComponent,
      ),
    data: {
      title: "FAQ",
      body: 'Answers to common questions about NaijasPride.\n\n1) Do I need an account to browse?\nYou can browse as a guest. You need an account to save progress, manage profile settings, and use premium features.\n\n2) How do I install the app?\nOn mobile, use "Add to Home Screen" from your browser menu. On desktop, use the install icon in Chrome or Edge.\n\n3) How do subscriptions work?\nPremium billing is monthly in NGN. You can manage your plan from your profile and account settings pages.\n\n4) Where can I get support?\nUse the Help Center and Contact pages for account, playback, and payment support.',
    },
  },
  {
    path: "investors",
    loadComponent: () =>
      import("./pages/static/static-page.component").then(
        (m) => m.StaticPageComponent,
      ),
    data: {
      title: "Investor Relations",
      body: "Investor relations information will appear here.\n\nFor now, contact us via the Contact page.",
    },
  },
  {
    path: "privacy",
    loadComponent: () =>
      import("./pages/legal/legal-page.component").then(
        (m) => m.LegalPageComponent,
      ),
    data: { documentId: "privacy" },
  },
  {
    path: "help",
    loadComponent: () =>
      import("./pages/static/static-page.component").then(
        (m) => m.StaticPageComponent,
      ),
    data: {
      title: "Help Center",
      body: 'Need help? Start with this checklist.\n\n1) Playback issues\n- Check connection speed and refresh the page.\n- Try lowering quality in the player settings.\n\n2) Sign-in issues\n- Confirm your email and password.\n- Use "Forgot Password" if needed.\n\n3) Book/Comics reader issues\n- Reload the chapter/page.\n- Reopen from your library to resume progress sync.\n\n4) Still stuck?\nContact support via the Contact page with your browser/device details and screenshots.',
    },
  },
  {
    path: "jobs",
    loadComponent: () =>
      import("./pages/static/static-page.component").then(
        (m) => m.StaticPageComponent,
      ),
    data: {
      title: "Jobs",
      body: "We are hiring.\n\nOpen roles will be listed here soon.",
    },
  },
  {
    path: "cookies",
    loadComponent: () =>
      import("./pages/legal/legal-page.component").then(
        (m) => m.LegalPageComponent,
      ),
    data: { documentId: "cookies" },
  },
  {
    path: "ways-to-watch",
    loadComponent: () =>
      import("./pages/static/static-page.component").then(
        (m) => m.StaticPageComponent,
      ),
    data: {
      title: "Ways to Watch",
      body: "NaijasPride works across web, mobile, and TV setups.\n\nDesktop\n- Open in Chrome or Edge.\n- Install as an app from the address bar install icon for a native-like experience.\n\nMobile\n- iPhone/iPad: Safari → Share → Add to Home Screen.\n- Android: Chrome menu → Install App / Add to Home Screen.\n\nTV\n- Open naijaspride.com in your smart TV browser.\n- You can also cast from desktop or mobile when supported.",
    },
  },
  {
    path: "corporate",
    loadComponent: () =>
      import("./pages/static/static-page.component").then(
        (m) => m.StaticPageComponent,
      ),
    data: {
      title: "Corporate Information",
      body: "NaijasPride Music Group\n\nNaijasPride is a digital culture platform focused on movies, books/comics, and music experiences for African and global audiences.\n\nBusiness Inquiries\n- Partnerships and licensing: business@naijaspride.com\n- Press and media: media@naijaspride.com\n\nOperational Base\n- Lagos, Nigeria\n\nFor user support, please use the Contact and Help Center pages.",
    },
  },
  {
    path: "media",
    loadComponent: () =>
      import("./pages/static/static-page.component").then(
        (m) => m.StaticPageComponent,
      ),
    data: {
      title: "Media Center",
      body: "Press and media resources will be available here.",
    },
  },
  {
    path: "terms",
    loadComponent: () =>
      import("./pages/legal/legal-page.component").then(
        (m) => m.LegalPageComponent,
      ),
    data: { documentId: "terms" },
  },
  {
    path: "contact",
    loadComponent: () =>
      import("./pages/static/static-page.component").then(
        (m) => m.StaticPageComponent,
      ),
    data: {
      title: "Contact Us",
      body: "Contact us for support, content requests, or business inquiries.\n\nSupport\n- support@naijaspride.com\n\nPrivacy\n- privacy@naijaspride.com\n\nLegal\n- legal@naijaspride.com\n\nBusiness\n- business@naijaspride.com\n\nPlease include your account email and device/browser details for faster help.",
    },
  },

  // ──────────────────────────────────────────────────────────────
  // 11. ADMIN (Layout with child routes)
  // ──────────────────────────────────────────────────────────────
  {
    path: "admin",
    canActivate: [adminGuard],
    loadComponent: () =>
      import("./features/admin/layouts/admin-layout/admin-layout.component").then(
        (m) => m.AdminLayoutComponent,
      ),
    children: [
      {
        path: "dashboard",
        loadComponent: () =>
          import("./features/admin/pages/admin-dashboard/admin-dashboard.component").then(
            (m) => m.AdminDashboardComponent,
          ),
      },
      {
        path: "books",
        loadComponent: () =>
          import("./features/admin/pages/admin-books/admin-books.component").then(
            (m) => m.AdminBooksComponent,
          ),
      },
      {
        path: "movies",
        loadComponent: () =>
          import("./features/admin/pages/admin-movie-list/admin-movie-list.component").then(
            (m) => m.AdminMovieListComponent,
          ),
      },
      {
        path: "movies/new",
        loadComponent: () =>
          import("./features/admin/pages/admin-movie-create/admin-movie-create.component").then(
            (m) => m.AdminMovieCreateComponent,
          ),
      },
      {
        path: "movies/upload",
        loadComponent: () =>
          import("./features/admin/pages/admin-movie-upload/admin-movie-upload.component").then(
            (m) => m.AdminMovieUploadComponent,
          ),
      },
      {
        path: "movies/:id/edit",
        loadComponent: () =>
          import("./features/admin/pages/admin-movie-edit/admin-movie-edit.component").then(
            (m) => m.AdminMovieEditComponent,
          ),
      },
      {
        path: "discovery",
        loadComponent: () =>
          import("./features/admin/pages/content-discovery/content-discovery.component").then(
            (m) => m.ContentDiscoveryComponent,
          ),
      },
      {
        path: "queues",
        loadComponent: () =>
          import("./features/admin/pages/admin-job-queue/admin-job-queue.component").then(
            (m) => m.AdminJobQueueComponent,
          ),
      },
      {
        path: "users",
        loadComponent: () =>
          import("./features/admin/pages/admin-users/admin-users.component").then(
            (m) => m.AdminUsersComponent,
          ),
      },
      { path: "", redirectTo: "dashboard", pathMatch: "full" },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  // 404 FALLBACK - Must be last
  // ──────────────────────────────────────────────────────────────
  {
    path: "**",
    loadComponent: () =>
      import("./features/errors/pages/not-found/not-found.component").then(
        (m) => m.NotFoundComponent,
      ),
  },
];
