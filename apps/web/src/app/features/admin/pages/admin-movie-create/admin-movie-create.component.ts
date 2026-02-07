import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormArray } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminMoviesService } from '../../services/admin-movies.service';
import { Genre, Quality } from '@naijaspride/types';

@Component({
  selector: 'app-admin-movie-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="max-w-4xl mx-auto bg-white rounded-xl shadow-md overflow-hidden">
      <div class="p-6 border-b border-gray-100 flex justify-between items-center">
        <h2 class="text-xl font-bold text-gray-800">Add New Movie</h2>
      </div>

      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="p-6 space-y-6">
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700">Title</label>
            <input formControlName="title" type="text" class="input-field" placeholder="e.g. The Black Book">
          </div>
          
          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700">Year</label>
            <input formControlName="year" type="number" class="input-field" [value]="2025">
          </div>
        </div>

        <div class="space-y-2">
          <label class="block text-sm font-medium text-gray-700">Description</label>
          <textarea formControlName="description" rows="3" class="input-field"></textarea>
        </div>

        <div class="space-y-2">
          <label class="block text-sm font-medium text-gray-700">Genres</label>
          <div class="flex flex-wrap gap-3">
            @for (g of genres; track g) {
              <label class="inline-flex items-center space-x-2 cursor-pointer bg-gray-50 px-3 py-1 rounded-full border hover:bg-gray-100">
                <input type="checkbox" [value]="g" (change)="onCheckboxChange($event, 'genre')" class="text-primary rounded focus:ring-primary">
                <span class="text-sm">{{ g }}</span>
              </label>
            }
          </div>
        </div>

        <div class="space-y-2">
          <label class="block text-sm font-medium text-gray-700">Available Qualities</label>
          <div class="flex flex-wrap gap-3">
            @for (q of qualities; track q) {
              <label class="inline-flex items-center space-x-2 cursor-pointer bg-gray-50 px-3 py-1 rounded-full border hover:bg-gray-100">
                <input type="checkbox" [value]="q" (change)="onCheckboxChange($event, 'quality')" class="text-secondary rounded focus:ring-secondary">
                <span class="text-sm">{{ q }}</span>
              </label>
            }
          </div>
        </div>

         <div class="p-4 bg-gray-50 rounded-lg space-y-4 border border-gray-200">
          <h3 class="font-bold text-gray-700">Download Links</h3>
          <div formGroupName="fileUrls" class="grid grid-cols-1 gap-4">
             @for (q of selectedQualities; track q) {
               <div>
                 <label class="block text-xs font-bold text-gray-500 uppercase mb-1">{{ q }} URL</label>
                 <input [formControlName]="q" type="url" class="input-field" placeholder="https://storage...">
               </div>
             }
             @if (selectedQualities.length === 0) {
               <p class="text-sm text-gray-400 italic">Select qualities above to add links.</p>
             }
          </div>
        </div>

        <div class="p-4 bg-blue-50 rounded-lg space-y-4 border border-blue-200">
          <h3 class="font-bold text-gray-700">Streaming Options</h3>
          
          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700">YouTube Video ID</label>
            <input formControlName="youtubeId" type="text" class="input-field" placeholder="e.g. dQw4w9WgXcQ">
            <p class="text-xs text-gray-500">Enter the YouTube video ID for streaming (optional)</p>
          </div>
          
          <div class="flex items-center gap-2">
            <input formControlName="isStreamOnly" type="checkbox" class="text-primary rounded focus:ring-primary">
            <label class="text-sm text-gray-700">Stream Only (No downloads available)</label>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700">Thumbnail URL</label>
            <input formControlName="thumbnailUrl" type="url" class="input-field">
          </div>
          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700">Cover URL (Optional)</label>
            <input formControlName="coverUrl" type="url" class="input-field">
          </div>
        </div>

        <div class="pt-6 border-t border-gray-100 flex justify-end gap-4">
           <button type="button" routerLink="/admin/movies" class="px-6 py-2 text-gray-600 hover:text-gray-900 font-medium">Cancel</button>
           <button 
            type="submit" 
            [disabled]="form.invalid || mutation.isPending()"
            class="px-8 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
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
          <div class="bg-red-50 text-red-600 p-4 rounded-lg">
            {{ mutation.error()?.message }}
          </div>
        }
      </form>
    </div>
  `,
  styles: [`
    .input-field {
      @apply w-full rounded-lg border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary/20 transition-shadow py-2 px-3 border;
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
    fileUrls: this.fb.group({}), // Dynamic keys
    thumbnailUrl: ['', [Validators.required]], // Temporarily required for demo
    coverUrl: [''],
    youtubeId: [''],
    isStreamOnly: [false]
  });

  onCheckboxChange(e: any, controlName: 'genre' | 'quality') {
    const value = e.target.value;
    const checked = e.target.checked;
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
      const fileUrlsGroup = this.form.get('fileUrls') as any;
      
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
      this.mutation.mutate(this.form.value as any, {
        onSuccess: () => {
          this.router.navigate(['/movies']); // Redirect to public list to see it
        }
      });
    }
  }
}
