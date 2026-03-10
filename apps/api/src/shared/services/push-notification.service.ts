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
import type { ServiceAccount } from 'firebase-admin/app';
import type { Messaging, MulticastMessage } from 'firebase-admin/messaging';

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

export const PUSH_EVENTS = {
  WELCOME: 'welcome',
  EMAIL_VERIFIED: 'email_verified',
  SUBSCRIPTION_ACTIVATED: 'subscription_activated',
  PAYMENT_RECEIVED: 'payment_received',
  SUBSCRIPTION_EXPIRING: 'subscription_expiring',
  SUBSCRIPTION_EXPIRED: 'subscription_expired',
  MOVIE_AVAILABLE: 'movie_available',
  NEW_CONTENT: 'new_content',
  WATCHLIST_AVAILABLE: 'watchlist_available',
  NEW_MUSIC_VIDEO: 'new_music_video',
  PASSWORD_CHANGED: 'password_changed',
  SECURITY_LOGIN: 'security_login',
  NEW_MANGA_CHAPTER: 'new_manga_chapter',
  NEW_BOOK: 'new_book',
  DOWNLOAD_COMPLETE: 'download_complete',
  DOWNLOAD_FAILED: 'download_failed',
  ANNOUNCEMENT: 'announcement',
  GENERIC: 'generic',
} as const;

export type PushEventType = (typeof PUSH_EVENTS)[keyof typeof PUSH_EVENTS];

// ─── Lazy Firebase initialisation ─────────────────────────────────────────────

let _messaging: Messaging | null = null;
let _messagingInitPromise: Promise<Messaging | null> | null = null;

const STALE_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

const TRANSIENT_ERROR_CODES = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/unknown-error',
  'app/network-error',
  'ETIMEDOUT',
  'ECONNRESET',
]);

const BATCH_SIZE = 500;
const MAX_BATCH_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const parseServiceAccount = (rawJson: string): ServiceAccount | null => {
  let raw: unknown;
  try {
    raw = JSON.parse(rawJson);
  } catch (error) {
    console.error('[Push] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON:', error);
    return null;
  }

  if (!raw || typeof raw !== 'object') {
    console.error('[Push] FIREBASE_SERVICE_ACCOUNT_JSON must be an object');
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const projectId = typeof obj.projectId === 'string'
    ? obj.projectId
    : typeof obj.project_id === 'string'
      ? obj.project_id
      : null;
  const clientEmail = typeof obj.clientEmail === 'string'
    ? obj.clientEmail
    : typeof obj.client_email === 'string'
      ? obj.client_email
      : null;
  const rawPrivateKey = typeof obj.privateKey === 'string'
    ? obj.privateKey
    : typeof obj.private_key === 'string'
      ? obj.private_key
      : null;

  if (!projectId || !clientEmail || !rawPrivateKey) {
    console.error('[Push] FIREBASE_SERVICE_ACCOUNT_JSON is missing required fields: project_id/projectId, client_email/clientEmail, private_key/privateKey');
    return null;
  }

  const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

  return {
    projectId,
    clientEmail,
    privateKey,
  };
};

const getErrorCode = (error: unknown): string | null => {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as { code?: unknown };
  return typeof candidate.code === 'string' ? candidate.code : null;
};

const isTransientError = (error: unknown): boolean => {
  const code = getErrorCode(error);
  return !!code && TRANSIENT_ERROR_CODES.has(code);
};

async function getMessaging(): Promise<Messaging | null> {
  if (_messaging) return _messaging;
  if (_messagingInitPromise) return _messagingInitPromise;

  _messagingInitPromise = (async () => {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      console.warn('[Push] FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled');
      return null;
    }

    const serviceAccount = parseServiceAccount(serviceAccountJson);
    if (!serviceAccount) return null;

    try {
      const { initializeApp, getApps, cert } = await import('firebase-admin/app');
      const { getMessaging: _getMsg } = await import('firebase-admin/messaging');

      if (!getApps().length) {
        initializeApp({ credential: cert(serviceAccount) });
      }

      _messaging = _getMsg();
      console.log('[Push] Firebase Admin SDK initialised');
      return _messaging;
    } catch (err) {
      console.error('[Push] Failed to initialise Firebase Admin SDK:', err);
      return null;
    }
  })();

  try {
    return await _messagingInitPromise;
  } finally {
    _messagingInitPromise = null;
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
      data: { event: PUSH_EVENTS.WELCOME },
    });
  }

  /** 2. Email verified */
  async sendEmailVerified(userId: string) {
    return this.sendToUser(userId, {
      title: 'Email Verified',
      body: 'Your email address is confirmed. Your account is fully active.',
      url: '/browse',
      data: { event: PUSH_EVENTS.EMAIL_VERIFIED },
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
      data: { event: PUSH_EVENTS.SUBSCRIPTION_ACTIVATED, plan: planName },
    });
  }

  /** 4. Payment received */
  async sendPaymentReceived(userId: string, amountFormatted: string, planName: string) {
    return this.sendToUser(userId, {
      title: 'Payment Received',
      body: `${amountFormatted} received for ${planName}. Your PRO benefits are now active.`,
      url: '/profile',
      data: { event: PUSH_EVENTS.PAYMENT_RECEIVED, plan: planName },
    });
  }

  /** 5. Subscription expiring soon (3 days) */
  async sendSubscriptionExpiringSoon(userId: string, daysLeft: number) {
    return this.sendToUser(userId, {
      title: 'Subscription Expiring Soon',
      body: `Your NaijasPride PRO expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Renew now to keep streaming.`,
      url: '/profile',
      data: { event: PUSH_EVENTS.SUBSCRIPTION_EXPIRING, daysLeft: String(daysLeft) },
    });
  }

  /** 6. Subscription expired */
  async sendSubscriptionExpired(userId: string) {
    return this.sendToUser(userId, {
      title: 'Subscription Expired',
      body: 'Your PRO access has ended. Renew to regain 4K streaming, no ads, and downloads.',
      url: '/profile',
      data: { event: PUSH_EVENTS.SUBSCRIPTION_EXPIRED },
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
      data: { event: PUSH_EVENTS.MOVIE_AVAILABLE, slug: movieSlug, quality },
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
      data: { event: PUSH_EVENTS.NEW_CONTENT, slug, genre },
    });
  }

  /** 9. Watchlist item now available */
  async sendWatchlistAvailable(userId: string, movieTitle: string, movieSlug: string, thumbnailUrl?: string) {
    return this.sendToUser(userId, {
      title: 'Watchlist Alert',
      body: `${movieTitle} from your watchlist is now available to stream!`,
      url: `/movies/${movieSlug}`,
      imageUrl: thumbnailUrl,
      data: { event: PUSH_EVENTS.WATCHLIST_AVAILABLE, slug: movieSlug },
    });
  }

  /** 10. New music video from a favourite artist */
  async sendNewMusicVideo(userIds: string[], artist: string, title: string, slug: string, thumbnailUrl?: string) {
    return this.sendToUsers(userIds, {
      title: 'New Music Video',
      body: `${artist} just dropped "${title}" — watch it on NaijasPride.`,
      url: `/music/${slug}`,
      imageUrl: thumbnailUrl,
      data: { event: PUSH_EVENTS.NEW_MUSIC_VIDEO, slug, artist },
    });
  }

  /** 11. Password changed security alert */
  async sendPasswordChanged(userId: string) {
    return this.sendToUser(userId, {
      title: 'Password Changed',
      body: 'Your NaijasPride password was just changed. If this wasn\'t you, contact support immediately.',
      url: '/profile',
      data: { event: PUSH_EVENTS.PASSWORD_CHANGED },
    });
  }

  /** 12. Security alert for new login */
  async sendSecurityLoginAlert(userId: string, ipAddress?: string, deviceLabel?: string) {
    const location = ipAddress ? `IP: ${ipAddress}` : 'Unknown location';
    const device = deviceLabel ? ` on ${deviceLabel}` : '';
    return this.sendToUser(userId, {
      title: 'Security Alert',
      body: `New sign-in detected${device}. ${location}. If this was not you, reset your password now.`,
      url: '/profile',
      data: {
        event: PUSH_EVENTS.SECURITY_LOGIN,
        ipAddress: ipAddress ?? 'unknown',
        deviceLabel: deviceLabel ?? 'unknown',
      },
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
      data: { event: PUSH_EVENTS.NEW_MANGA_CHAPTER, mangaId, chapter: chapterLabel },
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
      data: { event: PUSH_EVENTS.NEW_BOOK, slug: bookSlug, author },
    });
  }

  /** Download completed on this account (from another session/device) */
  async sendDownloadComplete(
    userId: string,
    contentType: 'movie' | 'manga' | 'book',
    contentTitle: string,
    targetUrl: string,
    imageUrl?: string,
  ) {
    return this.sendToUser(userId, {
      title: 'Download Complete',
      body: `${contentTitle} is ready for offline ${contentType === 'movie' ? 'playback' : 'reading'}.`,
      url: targetUrl,
      imageUrl,
      data: {
        event: PUSH_EVENTS.DOWNLOAD_COMPLETE,
        contentType,
        contentTitle,
      },
    });
  }

  /** Download failed */
  async sendDownloadFailed(
    userId: string,
    contentType: 'movie' | 'manga' | 'book',
    contentTitle: string,
    reason: string,
    targetUrl?: string,
  ) {
    return this.sendToUser(userId, {
      title: 'Download Failed',
      body: `${contentTitle} could not be saved offline (${reason}). Please retry.`,
      url: targetUrl ?? '/profile',
      data: {
        event: PUSH_EVENTS.DOWNLOAD_FAILED,
        contentType,
        contentTitle,
        reason,
      },
    });
  }

  /** 15. Generic promotional / announcement message */
  async sendAnnouncement(userIds: string[], title: string, body: string, url?: string) {
    return this.sendToUsers(userIds, {
      title,
      body,
      url: url ?? '/browse',
      data: { event: PUSH_EVENTS.ANNOUNCEMENT },
    });
  }

  /** Generic event payload */
  async sendGeneric(userId: string, title: string, body: string, url = '/browse', data?: Record<string, string>) {
    return this.sendToUser(userId, {
      title,
      body,
      url,
      data: { event: PUSH_EVENTS.GENERIC, ...(data || {}) },
    });
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  private async _sendToTokens(
    tokens: { id: string; token: string }[],
    payload: PushPayload,
    messaging: Messaging,
  ): Promise<number> {
    const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://naijaspride.com';
    const clickUrl = payload.url
      ? payload.url.startsWith('http')
        ? payload.url
        : `${FRONTEND_URL}${payload.url}`
      : FRONTEND_URL;

    const tokenList = tokens.map((t) => t.token);
    let successCount = 0;
    let failureCount = 0;
    let retriedCount = 0;
    let totalAttempts = 0;
    const staleIds = new Set<string>();

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      let pending = tokens.slice(i, i + BATCH_SIZE);
      let attempt = 0;

      while (pending.length > 0) {
        attempt += 1;
        totalAttempts += 1;

        const message = this._buildMessage(pending.map((item) => item.token), payload, clickUrl);

        try {
          const result = await messaging.sendEachForMulticast(message);
          const retryCandidates: { id: string; token: string }[] = [];

          result.responses.forEach((resp, idx) => {
            const tokenObj = pending[idx];
            if (!tokenObj) return;

            if (resp.success) {
              successCount += 1;
              return;
            }

            const code = resp.error?.code ?? '';
            if (STALE_TOKEN_ERROR_CODES.has(code)) {
              staleIds.add(tokenObj.id);
              failureCount += 1;
              return;
            }

            const canRetry = TRANSIENT_ERROR_CODES.has(code) && attempt < MAX_BATCH_ATTEMPTS;
            if (canRetry) {
              retryCandidates.push(tokenObj);
            } else {
              failureCount += 1;
            }
          });

          if (retryCandidates.length > 0 && attempt < MAX_BATCH_ATTEMPTS) {
            retriedCount += retryCandidates.length;
            pending = retryCandidates;
            await sleep(Math.min(1200, 250 * 2 ** (attempt - 1)));
            continue;
          }

          if (retryCandidates.length > 0) {
            failureCount += retryCandidates.length;
          }

          pending = [];
        } catch (error) {
          const canRetry = isTransientError(error) && attempt < MAX_BATCH_ATTEMPTS;
          if (canRetry) {
            retriedCount += pending.length;
            await sleep(Math.min(1200, 250 * 2 ** (attempt - 1)));
            continue;
          }
          failureCount += pending.length;
          console.error('[Push] Batch send failed:', error);
          pending = [];
        }
      }
    }

    // Deactivate stale tokens in the background
    if (staleIds.size > 0) {
      this.prisma.pushNotificationToken
        .updateMany({ where: { id: { in: [...staleIds] } }, data: { isActive: false } })
        .catch(console.error);
    }

    console.log(
      `[Push] Sent "${payload.title}": success=${successCount}, failed=${failureCount}, retried=${retriedCount}, stale=${staleIds.size}, tokens=${tokenList.length}, attempts=${totalAttempts}`,
    );

    return successCount;
  }

  private _buildMessage(tokens: string[], payload: PushPayload, clickUrl: string): MulticastMessage {
    return {
      tokens,
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

export async function getPushDiagnostics(
  prisma: PrismaClient,
  opts?: { userId?: string; email?: string }
): Promise<{
  firebaseConfigured: boolean;
  firebaseReady: boolean;
  tokenStats: {
    total: number;
    active: number;
    forUser?: {
      userId: string;
      email: string;
      total: number;
      active: number;
      latestTokenCreatedAt: string | null;
    };
  };
}> {
  const firebaseConfigured = !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const messaging = await getMessaging();
  const firebaseReady = !!messaging;

  const [total, active] = await Promise.all([
    prisma.pushNotificationToken.count(),
    prisma.pushNotificationToken.count({ where: { isActive: true } }),
  ]);

  let forUser:
    | {
        userId: string;
        email: string;
        total: number;
        active: number;
        latestTokenCreatedAt: string | null;
      }
    | undefined;

  if (opts?.userId || opts?.email) {
    const user = await prisma.user.findFirst({
      where: opts.userId ? { id: opts.userId } : { email: opts.email },
      select: { id: true, email: true },
    });

    if (user) {
      const tokens = await prisma.pushNotificationToken.findMany({
        where: { userId: user.id },
        select: { isActive: true, createdAt: true },
      });

      const latest = tokens
        .map((t) => t.createdAt)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      forUser = {
        userId: user.id,
        email: user.email,
        total: tokens.length,
        active: tokens.filter((t) => t.isActive).length,
        latestTokenCreatedAt: latest ? latest.toISOString() : null,
      };
    }
  }

  return {
    firebaseConfigured,
    firebaseReady,
    tokenStats: {
      total,
      active,
      ...(forUser ? { forUser } : {}),
    },
  };
}
