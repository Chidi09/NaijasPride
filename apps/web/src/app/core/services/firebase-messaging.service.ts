import { Injectable, signal } from '@angular/core';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import {
  MessagePayload,
  Messaging,
  GetTokenOptions,
  getMessaging,
  getToken,
  isSupported as isMessagingSupported,
  onMessage,
} from 'firebase/messaging';

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

type WindowFirebaseConfig = Window & {
  __FIREBASE_CONFIG__?: Partial<FirebaseWebConfig>;
  __FIREBASE_VAPID_KEY__?: string;
};

const readMeta = (name: string): string | undefined =>
  document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || undefined;

const readFirebaseConfig = (): FirebaseWebConfig | null => {
  const win = window as WindowFirebaseConfig;
  const runtimeConfig = win.__FIREBASE_CONFIG__ || {};

  const apiKey = runtimeConfig.apiKey || readMeta('firebase-api-key');
  const authDomain = runtimeConfig.authDomain || readMeta('firebase-auth-domain');
  const projectId = runtimeConfig.projectId || readMeta('firebase-project-id');
  const messagingSenderId = runtimeConfig.messagingSenderId || readMeta('firebase-messaging-sender-id');
  const appId = runtimeConfig.appId || readMeta('firebase-app-id');

  if (!apiKey || !authDomain || !projectId || !messagingSenderId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    messagingSenderId,
    appId,
    storageBucket: runtimeConfig.storageBucket || readMeta('firebase-storage-bucket'),
    measurementId: runtimeConfig.measurementId || readMeta('firebase-measurement-id'),
  };
};

const readVapidKey = (): string | undefined => {
  const win = window as WindowFirebaseConfig;
  return win.__FIREBASE_VAPID_KEY__ || readMeta('firebase-vapid-key') || undefined;
};

@Injectable({ providedIn: 'root' })
export class FirebaseMessagingService {
  private app: FirebaseApp | null = null;
  private messaging: Messaging | null = null;
  private vapidKey: string | undefined;

  readonly initialized = signal(false);
  readonly messagingReady = signal(false);
  readonly configReady = signal(false);
  readonly notificationPermission = signal<NotificationPermission>('default');
  readonly lastForegroundMessage = signal<MessagePayload | null>(null);

  async init() {
    if (typeof window === 'undefined') {
      return;
    }

    if ('Notification' in window) {
      this.notificationPermission.set(Notification.permission);
    }

    const firebaseConfig = readFirebaseConfig();
    if (!firebaseConfig) {
      this.messagingReady.set(false);
      this.configReady.set(false);
      this.initialized.set(true);
      console.warn('[FirebaseMessaging] Firebase web config missing. Set firebase-* meta tags.');
      return;
    }

    this.vapidKey = readVapidKey();
    this.configReady.set(true);
    this.app = getApps().length ? getApp() : initializeApp(firebaseConfig);

    try {
      if (await isAnalyticsSupported()) {
        getAnalytics(this.app);
      }
    } catch {
      // Ignore analytics init errors in unsupported environments.
    }

    try {
      if (await isMessagingSupported()) {
        this.messaging = getMessaging(this.app);
        this.messagingReady.set(true);
        onMessage(this.messaging, (payload) => {
          this.lastForegroundMessage.set(payload);
        });
      }
    } catch {
      this.messagingReady.set(false);
    }

    this.initialized.set(true);
  }

  async requestPermissionAndGetToken(vapidKey?: string): Promise<string | null> {
    if (!this.messaging || typeof window === 'undefined') {
      return null;
    }

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return null;
    }

    const permission = await Notification.requestPermission();
    this.notificationPermission.set(permission);

    if (permission !== 'granted') {
      return null;
    }

    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = await navigator.serviceWorker.register('/sw.js');
    }

    const effectiveVapidKey = vapidKey || this.vapidKey;
    const options: GetTokenOptions = {
      serviceWorkerRegistration: registration,
      ...(effectiveVapidKey ? { vapidKey: effectiveVapidKey } : {}),
    };

    return getToken(this.messaging, options);
  }
}
