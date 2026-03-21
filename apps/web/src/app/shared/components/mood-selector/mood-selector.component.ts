import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserPreferencesService, FeedMood } from '../../../core/services/user-preferences.service';

interface MoodOption {
  value: FeedMood;
  label: string;
  emoji: string;
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
          <span>{{ mood.emoji }}</span>
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
    { value: 'all', label: 'All', emoji: '\u2728', description: 'Show everything' },
    { value: 'chill', label: 'Chill', emoji: '\uD83C\uDF3F', description: 'Relaxing, feel-good vibes' },
    { value: 'intense', label: 'Intense', emoji: '\uD83D\uDD25', description: 'Action, thriller, drama' },
    { value: 'family', label: 'Family', emoji: '\uD83C\uDFE0', description: 'Safe for everyone' },
    { value: 'nollywood', label: 'Nollywood', emoji: '\uD83C\uDDF3\uD83C\uDDEC', description: 'Nigerian cinema only' },
  ];
}
