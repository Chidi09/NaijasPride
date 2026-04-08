import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserPreferencesService, FeedMood } from '../../../core/services/user-preferences.service';

interface MoodOption {
  value: FeedMood;
  label: string;
  icon: string;
  description: string;
}

@Component({
  selector: 'app-mood-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      @for (mood of moods; track mood.value) {
        <button
          (click)="prefs.setFeedMood(mood.value)"
          class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border whitespace-nowrap"
          [ngClass]="prefs.feedMood() === mood.value
            ? 'bg-cinema-500/20 border-cinema-500/50 text-cinema-400'
            : 'bg-zinc-800/60 border-zinc-700/50 text-gray-400 hover:border-zinc-500'"
          [title]="mood.description"
        >
          <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" [innerHTML]="mood.icon"></svg>
          <span>{{ mood.label }}</span>
        </button>
      }
    </div>
  `,
  styles: [`.scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }`],
})
export class MoodSelectorComponent {
  prefs = inject(UserPreferencesService);

  moods: MoodOption[] = [
    {
      value: 'all',
      label: 'All',
      // grid / apps icon
      icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      description: 'Show everything',
    },
    {
      value: 'chill',
      label: 'Chill',
      // coffee cup icon
      icon: '<path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
      description: 'Relaxing, feel-good vibes',
    },
    {
      value: 'intense',
      label: 'Intense',
      // zap / lightning icon
      icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
      description: 'Action, thriller, drama',
    },
    {
      value: 'family',
      label: 'Family',
      // users icon
      icon: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
      description: 'Safe for everyone',
    },
    {
      value: 'nollywood',
      label: 'Nollywood',
      // film / clapperboard icon
      icon: '<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>',
      description: 'Nigerian cinema only',
    },
  ];
}
