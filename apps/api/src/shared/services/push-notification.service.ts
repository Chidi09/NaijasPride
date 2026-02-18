/**
 * PushNotificationService
 *
 * Wraps firebase-admin Messaging to send FCM push notifications to all active
 * devices registered by a user (or a batch of users).
 *
 * Initialisation is lazy and guarded: the service is a no-op when
 * FIREBASE_SERVICE_ACCOUNT_JSON is not set, so non-production environments
 * never crash.
 *
 * All send methods are fire-and-forget safe — callers should .catch(console.error)
 * rather than awaiting and risking request failures from downstream FCM errors.
 */

import { PrismaClient } from '@prisma/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushPayload {
  title: string;
  body: string;
  /** Deep-link URL opened when the user taps the notification */
  url?: string;
  /** Small icon badge / image URL */
  imageUrl?: string;
  /** Arbitrary key-value data attached to the notification */
  data?: Record<string, string>;
}

// ─── Lazy Firebase initialisation ─────────────────────────────────────────────

let _messaging: import('firebase-admin/messaging').Messaging | null = null;

async function getMessaging(): Promise<import('firebase-admin/messaging').Messaging | null> {
  if (_messaging) return _messaging;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    console.warn('[Push] FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled');
    return null;
  }

  try {
    const { initializeApp, getApps, cert } = await import('firebase-admin/app');
    const { getMessaging: _getMsg } = await import('firebase-admin/messaging');

    if (!getApps().length) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      initializeApp({ credential: cert(serviceAccount) });
    }

    _messaging = _getMsg();
    console.log('[Push] Firebase Admin SDK initialised');
    return _messaging;
  } catch (err) {
    console.error('[Push] Failed to initialise Firebase Admin SDK:', err);
    return null;
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class PushNotificationService {
  constructor(private prisma: PrismaClient) {}

  // ── Core: send to a specific user ───────────────────────────────────────────

  /**
   * Send a push notification to all active devices of a single user.
   * Returns the number of messages successfully sent.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    const messaging = await getMessaging();
    if (!messaging) return 0;

    const tokens = await this.prisma.pushNotificationToken.findMany({
      where: { userId, isActive: true },
      select: { id: true, token: true },
    });

    if (tokens.length === 0) return 0;

    return this._sendToTokens(tokens, payload, messaging);
  }

  /**
   * Send a push notification to all active devices of multiple users.
   */
  async sendToUsers(userIds: string[], payload: PushPayload): Promise<number> {
    if (userIds.length === 0) return 0;
    const messaging = await getMessaging();
    if (!messaging) return 0;

    const tokens = await this.prisma.pushNotificationToken.findMany({
      where: { userId: { in: userIds }, isActive: true },
      select: { id: true, token: true },
    });

    if (tokens.length === 0) return 0;

    return this._sendToTokens(tokens, payload, messaging);
  }

  // ── Notification scenarios ───────────────────────────────────────────────────

  /** 1. Welcome — sent on new account creation */
  async sendWelcome(userId: string, name?: string) {
    return this.sendToUser(userId, {
      title: 'Welcome to NaijasPride!',
      body: `Hi ${name ?? 'there'} — your account is live. Start streaming movies, music, books, and manga now.`,
      url: '/browse',
      data: { event: 'welcome' },
    });
  }

  /** 2. Email verified */
  async sendEmailVerified(userId: string) {
    return this.sendToUser(userId, {
      title: 'Email Verified',
      body: 'Your email address is confirmed. Your account is fully active.',
      url: '/browse',
      data: { event: 'email_verified' },
    });
  }

  /** 3. Subscription activated / renewed */
  async sendSubscriptionActivated(userId: string, planName: string, nextBillingDate: Date) {
    const renewalStr = nextBillingDate.toLocaleDateString('en-NG', {
      timeZone: 'Africa/Lagos',
      dateStyle: 'medium',
    });
    return this.sendToUser(userId, {
      title: 'PRO Activated!',
      body: `Your ${planName} subscription is live. 4K streaming, no ads, unlimited downloads. Renews ${renewalStr}.`,
      url: '/browse',
      data: { event: 'subscription_activated', plan: planName },
    });
  }

  /** 4. Payment received */
  async sendPaymentReceived(userId: string, amountFormatted: string, planName: string) {
    return this.sendToUser(userId, {
      title: 'Payment Received',
      body: `${amountFormatted} received for ${planName}. Your PRO benefits are now active.`,
      url: '/profile',
      data: { event: 'payment_received', plan: planName },
    });
  }

  /** 5. Subscription expiring soon (3 days) */
  async sendSubscriptionExpiringSoon(userId: string, daysLeft: number) {
    return this.sendToUser(userId, {
      title: 'Subscription Expiring Soon',
      body: `Your NaijasPride PRO expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Renew now to keep streaming.`,
      url: '/profile',
      data: { event: 'subscription_expiring', daysLeft: String(daysLeft) },
    });
  }

  /** 6. Subscription expired */
  async sendSubscriptionExpired(userId: string) {
    return this.sendToUser(userId, {
      title: 'Subscription Expired',
      body: 'Your PRO access has ended. Renew to regain 4K streaming, no ads, and downloads.',
      url: '/profile',
      data: { event: 'subscription_expired' },
    });
  }

  /** 7. Movie / content now available (watchlist / notification request) */
  async sendMovieAvailable(
    userIds: string[],
    movieTitle: string,
    movieSlug: string,
    quality: string,
    thumbnailUrl?: string,
  ) {
    return this.sendToUsers(userIds, {
      title: 'Now Available!',
      body: `${movieTitle} is now streaming in ${quality} on NaijasPride.`,
      url: `/movies/${movieSlug}`,
      imageUrl: thumbnailUrl,
      data: { event: 'movie_available', slug: movieSlug, quality },
    });
  }

  /** 8. New content added (genre-targeted, sent to users who watch that genre) */
  async sendNewContentAlert(
    userIds: string[],
    title: string,
    slug: string,
    genre: string,
    thumbnailUrl?: string,
  ) {
    return this.sendToUsers(userIds, {
      title: 'New on NaijasPride',
      body: `${title} just dropped in ${genre}. Watch it now!`,
      url: `/movies/${slug}`,
      imageUrl: thumbnailUrl,
      data: { event: 'new_content', slug, genre },
    });
  }

  /** 9. Watchlist item now available */
  async sendWatchlistAvailable(userId: string, movieTitle: string, movieSlug: string, thumbnailUrl?: string) {
    return this.sendToUser(userId, {
      title: 'Watchlist Alert',
      body: `${movieTitle} from your watchlist is now available to stream!`,
      url: `/movies/${movieSlug}`,
      imageUrl: thumbnailUrl,
      data: { event: 'watchlist_available', slug: movieSlug },
    });
  }

  /** 10. New music video from a favourite artist */
  async sendNewMusicVideo(userIds: string[], artist: string, title: string, slug: string, thumbnailUrl?: string) {
    return this.sendToUsers(userIds, {
      title: 'New Music Video',
      body: `${artist} just dropped "${title}" — watch it on NaijasPride.`,
      url: `/music/${slug}`,
      imageUrl: thumbnailUrl,
      data: { event: 'new_music_video', slug, artist },
    });
  }

  /** 11. Password changed security alert */
  async sendPasswordChanged(userId: string) {
    return this.sendToUser(userId, {
      title: 'Password Changed',
      body: 'Your NaijasPride password was just changed. If this wasn\'t you, contact support immediately.',
      url: '/profile',
      data: { event: 'password_changed' },
    });
  }

  /** 13. New manga chapter available for followed manga */
  async sendNewMangaChapter(
    userId: string,
    mangaTitle: string,
    mangaId: string,
    chapterLabel: string,
    coverUrl?: string,
  ) {
    return this.sendToUser(userId, {
      title: `New Chapter: ${mangaTitle}`,
      body: `${chapterLabel} is now available. Tap to read!`,
      url: `/books/manga/${encodeURIComponent(mangaId)}`,
      imageUrl: coverUrl,
      data: { event: 'new_manga_chapter', mangaId, chapter: chapterLabel },
    });
  }

  /** 14. New book added to the library */
  async sendNewBook(
    userIds: string[],
    bookTitle: string,
    bookSlug: string,
    author: string,
    coverUrl?: string,
  ) {
    return this.sendToUsers(userIds, {
      title: 'New Book in Library',
      body: `"${bookTitle}" by ${author} is now available to read on NaijasPride.`,
      url: `/books/${bookSlug}`,
      imageUrl: coverUrl,
      data: { event: 'new_book', slug: bookSlug, author },
    });
  }

  /** 15. Generic promotional / announcement message */
  async sendAnnouncement(userIds: string[], title: string, body: string, url?: string) {
    return this.sendToUsers(userIds, {
      title,
      body,
      url: url ?? '/browse',
      data: { event: 'announcement' },
    });
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  private async _sendToTokens(
    tokens: { id: string; token: string }[],
    payload: PushPayload,
    messaging: import('firebase-admin/messaging').Messaging,
  ): Promise<number> {
    const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://naijaspride.com';
    const clickUrl = payload.url
      ? payload.url.startsWith('http')
        ? payload.url
        : `${FRONTEND_URL}${payload.url}`
      : FRONTEND_URL;

    // FCM sendEachForMulticast accepts up to 500 tokens per batch.
    const BATCH = 500;
    const tokenList = tokens.map((t) => t.token);
    let successCount = 0;
    const staleIds: string[] = [];

    for (let i = 0; i < tokenList.length; i += BATCH) {
      const batch = tokenList.slice(i, i + BATCH);

      const message: import('firebase-admin/messaging').MulticastMessage = {
        tokens: batch,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
        },
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-96x96.png',
            image: payload.imageUrl,
            data: { url: clickUrl },
          },
          fcmOptions: { link: clickUrl },
        },
        android: {
          notification: {
            title: payload.title,
            body: payload.body,
            imageUrl: payload.imageUrl,
            clickAction: clickUrl,
          },
        },
        apns: {
          payload: {
            aps: {
              alert: { title: payload.title, body: payload.body },
              sound: 'default',
            },
          },
        },
        data: payload.data,
      };

      const result = await messaging.sendEachForMulticast(message);
      successCount += result.successCount;

      // Collect invalid / unregistered tokens for cleanup
      result.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = resp.error?.code ?? '';
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            const tokenObj = tokens[i + idx];
            if (tokenObj) staleIds.push(tokenObj.id);
          }
        }
      });
    }

    // Deactivate stale tokens in the background
    if (staleIds.length > 0) {
      this.prisma.pushNotificationToken
        .updateMany({ where: { id: { in: staleIds } }, data: { isActive: false } })
        .catch(console.error);
    }

    if (successCount > 0) {
      console.log(`[Push] Sent ${successCount}/${tokenList.length} notifications: "${payload.title}"`);
    }

    return successCount;
  }
}

// Singleton — lazily created with a PrismaClient on first use from each service
const _instances = new WeakMap<PrismaClient, PushNotificationService>();

export function getPushService(prisma: PrismaClient): PushNotificationService {
  if (!_instances.has(prisma)) {
    _instances.set(prisma, new PushNotificationService(prisma));
  }
  return _instances.get(prisma)!;
}
