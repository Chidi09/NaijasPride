import { Injectable, signal, inject } from "@angular/core";
import { ToastService } from "./toast.service";

export interface Milestone {
  id: string;
  type:
    | "first_watch"
    | "first_download"
    | "first_book"
    | "series_complete"
    | "streak"
    | "milestone_count";
  title: string;
  subtitle: string;
  icon: string;
  timestamp: number;
}

const STORAGE_KEY = "np_milestones";

@Injectable({ providedIn: "root" })
export class MilestoneService {
  private toast = inject(ToastService);

  readonly activeCelebration = signal<Milestone | null>(null);
  private achieved = new Set<string>();

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.achieved = new Set(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }

  /** Call after a user completes their first movie watch */
  checkFirstWatch() {
    this.trigger({
      id: "first_watch",
      type: "first_watch",
      title: "First Movie Watched!",
      subtitle: "Welcome to the NaijasPride experience",
      icon: "movie",
    });
  }

  /** Call after first download */
  checkFirstDownload() {
    this.trigger({
      id: "first_download",
      type: "first_download",
      title: "First Download!",
      subtitle: "Now you can watch offline anytime",
      icon: "download",
    });
  }

  /** Call after first book opened in reader */
  checkFirstBook() {
    this.trigger({
      id: "first_book",
      type: "first_book",
      title: "First Book Opened!",
      subtitle: "Your reading journey begins",
      icon: "book",
    });
  }

  /** Call when a full season or series is completed */
  celebrateSeriesComplete(seriesTitle: string) {
    const id = `series_${seriesTitle}`;
    this.trigger({
      id,
      type: "series_complete",
      title: "Series Complete!",
      subtitle: `You finished "${seriesTitle}"`,
      icon: "trophy",
    });
  }

  /** Call with total count to check round milestones */
  checkWatchCount(count: number) {
    const milestones = [5, 10, 25, 50, 100, 250, 500];
    for (const m of milestones) {
      if (count >= m) {
        this.trigger({
          id: `watch_${m}`,
          type: "milestone_count",
          title: `${m} Movies Watched!`,
          subtitle: `You've watched ${m} movies on NaijasPride`,
          icon: "star",
        });
      }
    }
  }

  dismissCelebration() {
    this.activeCelebration.set(null);
  }

  private trigger(milestone: Omit<Milestone, "timestamp">) {
    if (this.achieved.has(milestone.id)) return;
    this.achieved.add(milestone.id);
    this.persist();

    const full: Milestone = { ...milestone, timestamp: Date.now() };
    this.activeCelebration.set(full);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      if (this.activeCelebration()?.id === milestone.id) {
        this.activeCelebration.set(null);
      }
    }, 5000);
  }

  private persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.achieved]));
  }
}
