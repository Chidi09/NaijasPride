import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminMoviesService } from '../../services/admin-movies.service';
import { CreateMovieRequest, Genre, Quality } from '@naijaspride/types';

@Component({
  selector: 'app-admin-movie-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="max-w-4xl mx-auto space-y-6">
      <div class="bg-[#fffdf8] border border-[#dcc5b8] rounded-xl shadow-2xl overflow-hidden dark:bg-[#140d11] dark:border-[#2d1a21]">
        <div class="p-6 border-b border-[#dcc5b8] flex justify-between items-center bg-yellow-100/70 dark:bg-yellow-900/5 dark:border-[#2d1a21]">
          <div>
            <h2 class="text-xl font-bold text-[#24181b] dark:text-white">Manual Movie Registration</h2>
            <p class="text-xs text-[#7b6660] mt-1 dark:text-[#9f7d73]">Register external video links or YouTube embeds.</p>
          </div>
          <a routerLink="/admin/movies/upload" class="px-4 py-2 bg-cinema-500 text-white text-xs font-bold rounded-lg hover:bg-cinema-400">Switch to File Upload</a>
        </div>

        <div class="px-6 py-4 bg-yellow-100/80 border-b border-[#dcc5b8] flex items-start gap-4 dark:bg-yellow-900/10 dark:border-[#2d1a21]">
          <svg class="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <p class="text-xs text-yellow-900/80 leading-relaxed dark:text-yellow-200/70">
            <strong>Use this only for External Links:</strong> If you have a video file (MP4, MKV) on your computer, please use the <strong class="text-[#24181b] dark:text-white">Upload Movie</strong> section instead. This form is for movies already hosted elsewhere.
          </p>
        </div>

      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="p-6 space-y-6">
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-2">
              <label class="block text-sm font-medium text-[#d6b87a]">Title</label>
            <input formControlName="title" type="text" class="input-field" placeholder="e.g. The Black Book">
          </div>
          
          <div class="space-y-2">
              <label class="block text-sm font-medium text-[#d6b87a]">Year</label>
            <input formControlName="year" type="number" class="input-field" [value]="2025">
          </div>
        </div>

        <div class="space-y-2">
          <label class="block text-sm font-medium text-[#d6b87a]">Description</label>
          <textarea formControlName="description" rows="3" class="input-field"></textarea>
        </div>

        <div class="space-y-2">
          <label class="block text-sm font-medium text-[#d6b87a]">Genres</label>
          <div class="flex flex-wrap gap-3">
            @for (g of genres; track g) {
              <label class="inline-flex items-center space-x-2 cursor-pointer bg-[#fff7f0] px-3 py-1 rounded-full border border-[#d6b87a]/40 hover:bg-[#f6e4d7] dark:bg-[#1b1014] dark:border-[#5f1327] dark:hover:bg-[#26141a]">
                <input type="checkbox" [value]="g" (change)="onCheckboxChange($event, 'genre')" class="text-cinema-500 rounded focus:ring-cinema-500">
                <span class="text-sm">{{ g }}</span>
              </label>
            }
          </div>
        </div>

        <div class="space-y-2">
          <label class="block text-sm font-medium text-[#d6b87a]">Available Qualities</label>
          <div class="flex flex-wrap gap-3">
            @for (q of qualities; track q) {
              <label class="inline-flex items-center space-x-2 cursor-pointer bg-[#fff7f0] px-3 py-1 rounded-full border border-[#d6b87a]/40 hover:bg-[#f6e4d7] dark:bg-[#1b1014] dark:border-[#5f1327] dark:hover:bg-[#26141a]">
                <input type="checkbox" [value]="q" (change)="onCheckboxChange($event, 'quality')" class="text-cinema-500 rounded focus:ring-cinema-500">
                <span class="text-sm">{{ q }}</span>
              </label>
            }
          </div>
        </div>

         <div class="p-4 bg-[#fff7f0] rounded-lg space-y-4 border border-[#dcc5b8] dark:bg-[#1b1014] dark:border-[#2d1a21]">
          <h3 class="font-bold text-[#24181b] dark:text-white">Download Links</h3>
          <div formGroupName="fileUrls" class="grid grid-cols-1 gap-4">
             @for (q of selectedQualities; track q) {
               <div>
                 <label class="block text-xs font-bold text-[#9f7d73] uppercase mb-1">{{ q }} URL</label>
                 <input [formControlName]="q" type="url" class="input-field" placeholder="https://storage...">
               </div>
             }
             @if (selectedQualities.length === 0) {
               <p class="text-sm text-[#9f7d73] italic">Select qualities above to add links.</p>
             }
          </div>
        </div>

         <div class="p-4 bg-[#fff7f0] rounded-lg space-y-4 border border-[#dcc5b8] dark:bg-[#1b1014] dark:border-[#2d1a21]">
          <h3 class="font-bold text-[#24181b] dark:text-white">Streaming Options</h3>
          
          <div class="space-y-2">
            <label class="block text-sm font-medium text-[#d6b87a]">YouTube Video ID</label>
            <input formControlName="youtubeId" type="text" class="input-field" placeholder="e.g. dQw4w9WgXcQ">
            <p class="text-xs text-[#9f7d73]">Enter the YouTube video ID for streaming (optional)</p>
          </div>
          
          <div class="flex items-center gap-2">
            <input formControlName="isStreamOnly" type="checkbox" class="text-cinema-500 rounded focus:ring-cinema-500">
            <label class="text-sm text-[#6f5b54] dark:text-[#c5aea5]">Stream Only (No downloads available)</label>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-2">
            <label class="block text-sm font-medium text-[#d6b87a]">Thumbnail URL</label>
            <input formControlName="thumbnailUrl" type="url" class="input-field">
          </div>
          <div class="space-y-2">
            <label class="block text-sm font-medium text-[#d6b87a]">Cover URL (Optional)</label>
            <input formControlName="coverUrl" type="url" class="input-field">
          </div>
        </div>

        <div class="pt-6 border-t border-[#dcc5b8] flex justify-end gap-4 dark:border-[#2d1a21]">
           <button type="button" routerLink="/admin/movies" class="px-6 py-2 text-[#7b6660] hover:text-[#24181b] dark:text-[#9f7d73] dark:hover:text-white font-medium">Cancel</button>
           <button 
            type="submit" 
            [disabled]="form.invalid || mutation.isPending()"
            class="px-8 py-2 bg-cinema-500 text-white rounded-lg hover:bg-cinema-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
           >
             @if (mutation.isPending()) {
               <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
               Saving...
             } @else {
               Create Movie
             }
           </button>
        </div>

        @if (mutation.isError()) {
          <div class="bg-red-900/30 text-red-300 p-4 rounded-lg border border-red-700/60">
            {{ mutation.error()?.message }}
          </div>
        }
      </form>
    </div>
  `,
  styles: [`
    .input-field {
      @apply w-full rounded-lg border-[#dcc5b8] bg-white text-[#24181b] placeholder-[#8a756e] shadow-sm focus:border-cinema-500 focus:ring focus:ring-cinema-500/20 transition-shadow py-2 px-3 border dark:border-[#5f1327] dark:bg-[#1b1014] dark:text-[#f7eee7] dark:placeholder-[#a88a78];
    }
  `]
})
export class AdminMovieCreateComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private adminService = inject(AdminMoviesService);

  mutation = this.adminService.createMovieMutation();

  genres = Object.values(Genre);
  qualities = Object.values(Quality);
  
  // Track selected qualities to show inputs dynamically
  selectedQualities: string[] = [];

  form = this.fb.group({
    title: ['', [Validators.required]],
    year: [new Date().getFullYear(), [Validators.required]],
    description: [''],
    genre: [[] as string[], [Validators.required]],
    quality: [[] as string[], [Validators.required]],
    fileUrls: this.createFileUrlsGroup(), // Dynamic keys
    thumbnailUrl: ['', [Validators.required]], // Temporarily required for demo
    coverUrl: [''],
    youtubeId: [''],
    isStreamOnly: [false]
  });

  private createFileUrlsGroup(): FormGroup<Record<string, AbstractControl>> {
    return new FormGroup<Record<string, AbstractControl>>({});
  }

  onCheckboxChange(e: Event, controlName: 'genre' | 'quality') {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    const checked = target.checked;
    const control = this.form.get(controlName);
    let current: string[] = control?.value || [];

    if (checked) {
      current = [...current, value];
    } else {
      current = current.filter(item => item !== value);
    }
    
    control?.setValue(current);

    // If quality changed, update fileUrl controls
    if (controlName === 'quality') {
      this.selectedQualities = current;
      const fileUrlsGroup = this.form.controls.fileUrls as FormGroup<Record<string, AbstractControl>>;
      
      // Add control if missing
      if (checked && !fileUrlsGroup.contains(value)) {
        fileUrlsGroup.addControl(value, this.fb.control('', Validators.required));
      }
      // Remove control if unchecked
      if (!checked && fileUrlsGroup.contains(value)) {
        fileUrlsGroup.removeControl(value);
      }
    }
  }

  onSubmit() {
    if (this.form.valid) {
      const raw = this.form.getRawValue();
      const payload: CreateMovieRequest & { thumbnailUrl?: string; coverUrl?: string } = {
        title: raw.title || '',
        description: raw.description || undefined,
        year: Number(raw.year),
        genre: (raw.genre ?? []).map((value) => value as Genre),
        quality: (raw.quality ?? []).map((value) => value as Quality),
        fileUrls: Object.fromEntries(
          Object.entries(raw.fileUrls || {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1])
        ),
        youtubeId: raw.youtubeId || undefined,
        isStreamOnly: !!raw.isStreamOnly,
        thumbnailUrl: raw.thumbnailUrl || undefined,
        coverUrl: raw.coverUrl || undefined,
      };

      this.mutation.mutate(payload, {
        onSuccess: () => {
          this.router.navigate(['/movies']); // Redirect to public list to see it
        }
      });
    }
  }
}
