import { Component, input } from "@angular/core";

export interface ProfileStat {
  label: string;
  value: string | number;
  icon: string;
  accent?: string;
}

const ICON_PATHS: Record<string, string> = {
  movie:
    "M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z",
  book: "M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z",
  clock:
    "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
  heart:
    "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  calendar:
    "M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z",
  download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
};

@Component({
  selector: "app-profile-stats-card",
  standalone: true,
  template: `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      @for (stat of stats(); track stat.label) {
        <div
          class="bg-[#f1e5dd] dark:bg-zinc-800/60 border border-[#dcc5b8] dark:border-zinc-700/40 rounded-xl p-4 text-center group transition-colors"
        >
          <div
            class="w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center"
            [style.background]="
              stat.accent ? stat.accent + '1a' : 'rgba(128,0,32,0.1)'
            "
          >
            <svg
              class="w-5 h-5"
              [style.color]="stat.accent || '#800020'"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path [attr.d]="getIconPath(stat.icon)" />
            </svg>
          </div>
          <p class="text-2xl font-bold text-[#24181b] dark:text-white">
            {{ stat.value }}
          </p>
          <p class="text-xs text-[#8a756e] dark:text-gray-500 mt-0.5">
            {{ stat.label }}
          </p>
        </div>
      }
    </div>
  `,
})
export class ProfileStatsCardComponent {
  stats = input.required<ProfileStat[]>();

  getIconPath(name: string): string {
    return ICON_PATHS[name] || ICON_PATHS["clock"];
  }
}
