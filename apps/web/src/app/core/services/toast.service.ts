import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  type: ToastType;
  text: string;
  durationMs: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly dedupeWindowMs = 1500;
  private readonly lastShown = new Map<string, number>();

  readonly toasts = signal<ToastMessage[]>([]);

  success(text: string, durationMs = 3500) {
    this.show('success', text, durationMs);
  }

  error(text: string, durationMs = 4500) {
    this.show('error', text, durationMs);
  }

  info(text: string, durationMs = 3000) {
    this.show('info', text, durationMs);
  }

  dismiss(id: number) {
    this.toasts.update((current) => current.filter((toast) => toast.id !== id));
  }

  private show(type: ToastType, text: string, durationMs: number) {
    const key = `${type}:${text}`;
    const now = Date.now();
    const previous = this.lastShown.get(key);
    if (previous && now - previous < this.dedupeWindowMs) {
      return;
    }
    this.lastShown.set(key, now);

    const toast: ToastMessage = {
      id: this.nextId++,
      type,
      text,
      durationMs,
    };

    this.toasts.update((current) => [...current, toast]);
    window.setTimeout(() => this.dismiss(toast.id), durationMs);
  }
}
