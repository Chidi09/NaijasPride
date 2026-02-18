import { Injectable } from '@angular/core';

export interface ReaderGestureHandlers {
  onTapCenter?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

type PointerState = {
  id: number;
  x: number;
  y: number;
  at: number;
};

@Injectable({
  providedIn: 'root',
})
export class ReaderGesturesService {
  setup(target: HTMLElement, handlers: ReaderGestureHandlers): () => void {
    let state: PointerState | null = null;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      state = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        at: Date.now(),
      };
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!state) return;
      if (event.pointerId !== state.id) return;

      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      const dt = Date.now() - state.at;
      state = null;

      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      const isTap = absX < 10 && absY < 10 && dt < 260;
      if (isTap) {
        const rect = target.getBoundingClientRect();
        const xRatio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5;
        const isCenter = xRatio >= 0.32 && xRatio <= 0.68;
        if (isCenter) {
          handlers.onTapCenter?.();
        }
        return;
      }

      const isSwipe = dt < 520 && absX > 64 && absY < 48;
      if (!isSwipe) return;
      if (dx < 0) handlers.onSwipeLeft?.();
      else handlers.onSwipeRight?.();
    };

    target.addEventListener('pointerdown', onPointerDown, { passive: true });
    target.addEventListener('pointerup', onPointerUp, { passive: true });
    target.addEventListener('pointercancel', onPointerUp, { passive: true });

    return () => {
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerUp);
    };
  }
}
