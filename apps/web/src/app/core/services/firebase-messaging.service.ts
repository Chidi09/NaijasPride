import { Injectable, signal } from '@angular/core';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import {
  MessagePayload,
  Messaging,
  getMessaging,
  getToken,
  isSupported as isMessagingSupported,
  onMessage,
} from 'firebase/messaging';

const firebaseConfig = {
  apiKey: 'AIzaSyAa6aCnmD2xjrYiV3TRrbk3rVfuCAV4b0o',
  authDomain: 'naijaspride.firebaseapp.com',
  projectId: 'naijaspride',
  storageBucket: 'naijaspride.firebasestorage.app',
  messagingSenderId: '1030111619631',
  appId: '1:1030111619631:web:1c953b7e01d9aa7319b4da',
  measurementId: 'G-LBMPYGX0T3',
};

@Injectable({ providedIn: 'root' })
export class FirebaseMessagingService {
  private app: FirebaseApp | null = null;
  private messaging: Messaging | null = null;

  readonly initialized = signal(false);
  readonly messagingReady = signal(false);
  readonly notificationPermission = signal<NotificationPermission>('default');
  readonly lastForegroundMessage = signal<MessagePayload | null>(null);

  async init() {
    if (typeof window === 'undefined') {
      return;
    }

    if ('Notification' in window) {
      this.notificationPermission.set(Notification.permission);
    }

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

    return getToken(this.messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
  }
}
