import { Injectable, computed, signal } from "@angular/core";
import { MusicVideoSummary } from "@naijaspride/types";

export type RepeatMode = "none" | "one" | "all";

@Injectable({ providedIn: "root" })
export class MusicPlayerService {
  // ── State signals ─────────────────────────────────────────────────────
  readonly currentTrack = signal<MusicVideoSummary | null>(null);
  readonly queue = signal<MusicVideoSummary[]>([]);
  readonly queueIndex = signal<number>(-1);
  readonly isPlaying = signal(false);
  readonly isShuffle = signal(false);
  readonly repeatMode = signal<RepeatMode>("none");
  readonly isMinimized = signal(false);

  // ── Computed ──────────────────────────────────────────────────────────
  readonly hasNext = computed(() => {
    const q = this.queue();
    const i = this.queueIndex();
    if (this.repeatMode() === "all") return q.length > 0;
    return i < q.length - 1;
  });

  readonly hasPrev = computed(() => this.queueIndex() > 0);

  // ── Playback ──────────────────────────────────────────────────────────

  play(track: MusicVideoSummary, queue?: MusicVideoSummary[]): void {
    if (queue) {
      this.queue.set(queue);
      const idx = queue.findIndex((t) => t.id === track.id);
      this.queueIndex.set(idx >= 0 ? idx : 0);
    } else {
      // Single track — add to queue at current position
      const current = this.queue();
      if (!current.some((t) => t.id === track.id)) {
        this.queue.update((q) => [...q, track]);
        this.queueIndex.set(this.queue().length - 1);
      }
    }
    this.currentTrack.set(track);
    this.isPlaying.set(true);
    this.isMinimized.set(false);
  }

  pause(): void {
    this.isPlaying.set(false);
  }

  resume(): void {
    if (this.currentTrack()) this.isPlaying.set(true);
  }

  togglePlay(): void {
    if (this.isPlaying()) this.pause();
    else this.resume();
  }

  next(): void {
    const q = this.queue();
    if (q.length === 0) return;

    if (this.isShuffle()) {
      const idx = Math.floor(Math.random() * q.length);
      this.queueIndex.set(idx);
      this.currentTrack.set(q[idx]);
      return;
    }

    const current = this.queueIndex();
    if (current < q.length - 1) {
      const next = current + 1;
      this.queueIndex.set(next);
      this.currentTrack.set(q[next]);
    } else if (this.repeatMode() === "all") {
      this.queueIndex.set(0);
      this.currentTrack.set(q[0]);
    }
  }

  prev(): void {
    const q = this.queue();
    const current = this.queueIndex();
    if (current > 0) {
      const prev = current - 1;
      this.queueIndex.set(prev);
      this.currentTrack.set(q[prev]);
    }
  }

  onTrackEnd(): void {
    if (this.repeatMode() === "one") {
      // Signal the player to restart — just keep isPlaying true
      this.isPlaying.set(false);
      setTimeout(() => this.isPlaying.set(true), 50);
      return;
    }
    if (this.hasNext()) {
      this.next();
    } else {
      this.isPlaying.set(false);
    }
  }

  toggleShuffle(): void {
    this.isShuffle.update((v) => !v);
  }

  cycleRepeat(): void {
    const modes: RepeatMode[] = ["none", "all", "one"];
    const current = modes.indexOf(this.repeatMode());
    this.repeatMode.set(modes[(current + 1) % modes.length]);
  }

  addToQueue(track: MusicVideoSummary): void {
    if (!this.queue().some((t) => t.id === track.id)) {
      this.queue.update((q) => [...q, track]);
    }
  }

  clearQueue(): void {
    this.queue.set([]);
    this.queueIndex.set(-1);
    this.currentTrack.set(null);
    this.isPlaying.set(false);
  }

  minimize(): void {
    this.isMinimized.set(true);
  }

  expand(): void {
    this.isMinimized.set(false);
  }
}
