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
    loadComponent: () => import('./pages/landing/editorial-landing.component').then(m => m.EditorialLandingComponent)
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
    loadComponent: () => import('./pages/legal/legal-page.component').then(m => m.LegalPageComponent),
    data: {
      title: 'Privacy Policy',
      lastUpdated: 'February 2026',
      html: `
        <p>NaijasPride ("we", "us", "our") operates <strong>naijaspride.com</strong>. This Privacy Policy explains how we collect, use, and protect your personal information when you use our streaming and reading platform.</p>

        <h2>1. Information We Collect</h2>
        <p><strong>Account information:</strong> When you register, we collect your name and email address. Passwords are hashed using bcrypt and are never stored in plain text.</p>
        <p><strong>Usage data:</strong> We record which content you watch or read, your progress (e.g., watch position, reading page), and content you add to your watchlist. This is used to power the "Continue Watching" feature and personalised recommendations.</p>
        <p><strong>Payment information:</strong> Payments are processed by <strong>Paystack</strong>. We do not store your card details. We receive only a transaction reference and confirmation status from Paystack after a successful payment.</p>
        <p><strong>Device &amp; technical data:</strong> Standard web server logs (IP address, browser type, pages visited, timestamps). These logs are retained for a maximum of 30 days and used solely for security and debugging purposes.</p>

        <h2>2. Cookies</h2>
        <p>We use a single session cookie to keep you signed in. We do <strong>not</strong> use advertising cookies, third-party tracking pixels, or analytics services that send your data to external companies. See our <a href="/cookies">Cookie Policy</a> for full details.</p>

        <h2>3. How We Use Your Information</h2>
        <ul>
          <li>To provide and improve the service (streaming, reading, recommendations).</li>
          <li>To manage your subscription and process payments.</li>
          <li>To send transactional emails (account verification, password reset, subscription confirmation). We do not send marketing emails without your explicit consent.</li>
          <li>To detect and prevent fraud or abuse.</li>
        </ul>

        <h2>4. Data Sharing</h2>
        <p>We do <strong>not</strong> sell or rent your personal information. We share data only with:</p>
        <ul>
          <li><strong>Paystack</strong> — payment processing (governed by <a href="https://paystack.com/privacy" target="_blank" rel="noopener">Paystack's Privacy Policy</a>).</li>
          <li><strong>ZeptoMail</strong> — transactional email delivery.</li>
          <li><strong>Cloudflare</strong> — CDN and DDoS protection. Cloudflare may log request metadata per their <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener">Privacy Policy</a>.</li>
          <li><strong>Legal obligations</strong> — if required by Nigerian law or a valid court order.</li>
        </ul>

        <h2>5. Data Retention</h2>
        <p>Your account data is retained for as long as your account is active. Watch and reading progress is retained indefinitely to power your history. You may request deletion of your account and all associated data by emailing <a href="mailto:support@naijaspride.com">support@naijaspride.com</a>. We will process deletion requests within 30 days.</p>

        <h2>6. Security</h2>
        <p>We use industry-standard measures: HTTPS everywhere, bcrypt password hashing, JWT-based authentication with short-lived tokens, and Cloudflare DDoS protection. No system is 100% secure; please use a strong, unique password.</p>

        <h2>7. Children's Privacy</h2>
        <p>NaijasPride is not directed at children under 13. We do not knowingly collect data from children. If you believe a child has provided us with data, contact us and we will delete it promptly.</p>

        <h2>8. Your Rights</h2>
        <p>You may: access your data (from your Profile page), correct inaccurate data (from Account Settings), or request full deletion (by emailing support). Nigerian Data Protection Regulation (NDPR) rights apply to Nigerian residents.</p>

        <h2>9. Changes to This Policy</h2>
        <p>We may update this policy. We will notify you of significant changes by email or via an in-app notice. Continued use of the service after changes constitutes acceptance.</p>

        <h2>10. Contact</h2>
        <p>Questions? Email us at <a href="mailto:privacy@naijaspride.com">privacy@naijaspride.com</a>.</p>
      `
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
    loadComponent: () => import('./pages/legal/legal-page.component').then(m => m.LegalPageComponent),
    data: {
      title: 'Cookie Policy',
      lastUpdated: 'February 2026',
      html: `
        <p>This Cookie Policy explains how NaijasPride uses cookies and similar technologies on <strong>naijaspride.com</strong>.</p>

        <h2>What Are Cookies?</h2>
        <p>Cookies are small text files stored on your device when you visit a website. They allow the site to remember information about your visit.</p>

        <h2>Cookies We Use</h2>
        <p>We use only <strong>essential / strictly necessary cookies</strong>. These are required for the service to function and cannot be disabled without breaking core features.</p>

        <h3>Authentication Token</h3>
        <p><strong>Name:</strong> <code>np_token</code> (or stored in localStorage as a JWT). <br>
        <strong>Purpose:</strong> Keeps you signed in to your account. <br>
        <strong>Duration:</strong> 7 days (refreshed on each visit). <br>
        <strong>Type:</strong> Essential / First-party.</p>

        <h3>Cookie Consent Preference</h3>
        <p><strong>Name:</strong> <code>np_cookie_consent</code> (localStorage). <br>
        <strong>Purpose:</strong> Remembers whether you have acknowledged this notice. <br>
        <strong>Duration:</strong> Permanent (until you clear browser data). <br>
        <strong>Type:</strong> Essential / First-party.</p>

        <h2>Cookies We Do NOT Use</h2>
        <ul>
          <li>Advertising or retargeting cookies (Google Ads, Facebook Pixel, etc.)</li>
          <li>Analytics cookies (Google Analytics, Mixpanel, etc.)</li>
          <li>Third-party tracking pixels</li>
          <li>Social media widgets that track browsing across sites</li>
        </ul>

        <h2>Third-Party Services</h2>
        <p><strong>Cloudflare</strong> acts as our CDN and security layer. Cloudflare may set its own cookies for bot detection and performance optimisation. These are governed by <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener">Cloudflare's Privacy Policy</a>.</p>
        <p><strong>Paystack</strong> (payments) may set cookies on their payment pages. These are governed by <a href="https://paystack.com/privacy" target="_blank" rel="noopener">Paystack's Privacy Policy</a>.</p>

        <h2>Managing Cookies</h2>
        <p>Because we only use essential cookies, disabling them in your browser will prevent you from signing in. Most browsers allow you to view and delete cookies via their Settings &gt; Privacy menus.</p>
        <ul>
          <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener">Chrome</a></li>
          <li><a href="https://support.mozilla.org/en-US/kb/clear-cookies-and-site-data-firefox" target="_blank" rel="noopener">Firefox</a></li>
          <li><a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac" target="_blank" rel="noopener">Safari</a></li>
        </ul>

        <h2>Contact</h2>
        <p>Questions? Email <a href="mailto:privacy@naijaspride.com">privacy@naijaspride.com</a>.</p>
      `
    }
  },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/pages/account-settings/account-settings.component')
      .then(m => m.AccountSettingsComponent)
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
    loadComponent: () => import('./pages/legal/legal-page.component').then(m => m.LegalPageComponent),
    data: {
      title: 'Terms of Use',
      lastUpdated: 'February 2026',
      html: `
        <p>Welcome to NaijasPride. By accessing or using our platform at <strong>naijaspride.com</strong> ("the Service"), you agree to be bound by these Terms of Use. Please read them carefully.</p>

        <h2>1. Eligibility</h2>
        <p>You must be at least 13 years old to use NaijasPride. By creating an account, you confirm you meet this requirement. If you are under 18, you must have parental consent.</p>

        <h2>2. Your Account</h2>
        <p>You are responsible for maintaining the confidentiality of your password and for all activities that occur under your account. You must notify us immediately of any unauthorised use. Use a strong, unique password.</p>

        <h2>3. Subscriptions &amp; Payments</h2>
        <p>Subscription fees are charged in Nigerian Naira (NGN) via Paystack. Subscriptions are billed monthly. You may cancel at any time from your profile page — cancellation takes effect at the end of the current billing period. <strong>No refunds</strong> are provided for partial billing periods, except where required by Nigerian consumer law.</p>

        <h2>4. Content &amp; Intellectual Property</h2>
        <p>All content on NaijasPride (movies, books, manga, comics) is either licensed, user-uploaded under appropriate rights, or publicly available. You may stream and download content for personal, non-commercial use only. You may <strong>not</strong>:</p>
        <ul>
          <li>Copy, redistribute, or republish any content without our written permission.</li>
          <li>Use automated tools, scrapers, or bots to access the Service.</li>
          <li>Circumvent DRM, geo-restrictions, or access controls.</li>
          <li>Upload content you do not have the rights to distribute.</li>
        </ul>

        <h2>5. User Conduct</h2>
        <p>You agree not to use NaijasPride to:</p>
        <ul>
          <li>Violate any applicable Nigerian or international law.</li>
          <li>Harass, threaten, or harm other users.</li>
          <li>Upload malware, spam, or misleading content.</li>
          <li>Attempt to gain unauthorised access to any part of our systems.</li>
        </ul>
        <p>We reserve the right to suspend or terminate accounts that violate these rules without notice.</p>

        <h2>6. Free &amp; Premium Tiers</h2>
        <p>Free accounts can browse and stream content with ads. Premium accounts unlock ad-free streaming, higher quality, and downloads. Features may change over time — we will provide reasonable notice of material changes.</p>

        <h2>7. Third-Party Services</h2>
        <p>Our service uses Paystack for payments, ZeptoMail for emails, and Cloudflare for security. Your use of these services is subject to their respective terms.</p>

        <h2>8. Disclaimer of Warranties</h2>
        <p>The Service is provided "as is" without warranties of any kind, express or implied. We do not guarantee uninterrupted or error-free access. Streaming quality depends on your internet connection.</p>

        <h2>9. Limitation of Liability</h2>
        <p>To the maximum extent permitted by Nigerian law, NaijasPride shall not be liable for indirect, incidental, or consequential damages arising from your use of the Service. Our total liability to you for any claim shall not exceed the total subscription fees you paid in the 3 months preceding the claim.</p>

        <h2>10. Governing Law</h2>
        <p>These Terms are governed by the laws of the Federal Republic of Nigeria. Disputes shall be resolved in the courts of Lagos State, Nigeria.</p>

        <h2>11. Changes to These Terms</h2>
        <p>We may update these Terms. We will notify you of significant changes by email at least 14 days before they take effect. Continued use of the Service after that date constitutes acceptance.</p>

        <h2>12. Contact</h2>
        <p>Questions about these Terms? Email <a href="mailto:legal@naijaspride.com">legal@naijaspride.com</a>.</p>
      `
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
    loadComponent: () => import('./features/movies/pages/movies-editorial-landing/movies-editorial-landing.component')
      .then(m => m.MoviesEditorialLandingComponent)
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
    loadComponent: () => import('./features/books/pages/books-editorial-landing/books-editorial-landing.component')
      .then(m => m.BooksEditorialLandingComponent)
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
    path: 'books/read/:slug',
    loadComponent: () => import('./features/books/pages/book-reader/book-reader.component')
      .then(m => m.BookReaderComponent)
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
  {
    path: 'register',
    loadComponent: () => import('./features/auth/pages/register/register.component')
      .then(m => m.RegisterComponent)
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/auth/pages/forgot-password/forgot-password.component')
      .then(m => m.ForgotPasswordComponent)
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./features/auth/pages/reset-password/reset-password.component')
      .then(m => m.ResetPasswordComponent)
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./features/auth/pages/verify-email/verify-email.component')
      .then(m => m.VerifyEmailComponent)
  },
  
  // PREMIUM ROUTES
  {
    path: 'premium',
    canActivate: [authGuard],
    loadComponent: () => import('./features/premium/pages/premium-landing/premium-landing.component')
      .then(m => m.PremiumLandingComponent)
  },
  {
    path: 'payment/callback',
    canActivate: [authGuard],
    loadComponent: () => import('./features/premium/pages/payment-callback/payment-callback.component')
      .then(m => m.PaymentCallbackComponent)
  },
  
  // MUSIC ROUTES
  {
    path: 'music',
    loadComponent: () => import('./features/music/pages/music-editorial-landing/music-editorial-landing.component')
      .then(m => m.MusicEditorialLandingComponent),
  },
  {
    path: 'music/browse',
    loadComponent: () => import('./features/music/pages/music-browse/music-browse.component')
      .then(m => m.MusicBrowseComponent),
  },
  {
    path: 'music/artist/:slug',
    loadComponent: () => import('./features/music/pages/artist-detail/artist-detail.component')
      .then(m => m.ArtistDetailComponent),
  },
  {
    path: 'music/:slug',
    loadComponent: () => import('./features/music/pages/music-watch/music-watch.component')
      .then(m => m.MusicWatchComponent),
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
        path: 'movies/:id/edit',
        loadComponent: () => import('./features/admin/pages/admin-movie-edit/admin-movie-edit.component')
          .then(m => m.AdminMovieEditComponent)
      },
      {
        path: 'discovery',
        loadComponent: () => import('./features/admin/pages/content-discovery/content-discovery.component')
          .then(m => m.ContentDiscoveryComponent)
      },
      {
        path: 'queues',
        loadComponent: () => import('./features/admin/pages/admin-job-queue/admin-job-queue.component')
          .then(m => m.AdminJobQueueComponent)
      },
      {
        path: 'users',
        loadComponent: () => import('./features/admin/pages/admin-users/admin-users.component')
          .then(m => m.AdminUsersComponent)
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  
  // 404 - Wildcard route must be last
  {
    path: '**',
    loadComponent: () => import('./features/errors/pages/not-found/not-found.component')
      .then(m => m.NotFoundComponent)
  }
];
