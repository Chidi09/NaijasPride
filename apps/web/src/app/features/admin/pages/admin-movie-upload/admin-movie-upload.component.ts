import { Component, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { HttpEvent, HttpEventType } from "@angular/common/http";
import { AdminMoviesService } from "../../services/admin-movies.service";
import { Movie } from "@naijaspride/types";

@Component({
  selector: "app-admin-movie-upload",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="max-w-4xl mx-auto space-y-6">
      <div
        class="bg-[#fffdf8] border border-[#dcc5b8] rounded-xl shadow-2xl overflow-hidden dark:bg-[#140d11] dark:border-[#2d1a21]"
      >
        <div class="p-6 border-b border-[#dcc5b8] dark:border-[#2d1a21]">
          <h2 class="text-xl font-bold text-[#24181b] dark:text-white">
            Upload New Movie
          </h2>
          <p class="text-[#7b6660] text-sm mt-1 dark:text-[#9f7d73]">
            Directly upload high-quality video files to NaijasPride storage.
          </p>
        </div>

        <div class="p-6 space-y-8">
          <!-- Step 1: File Selection -->
          <div class="space-y-4">
            <h3
              class="text-lg font-semibold text-[#d6b87a] flex items-center gap-2"
            >
              <span
                class="w-7 h-7 rounded-full bg-cinema-500 text-white flex items-center justify-center text-xs"
                >1</span
              >
              Select Video File
            </h3>

            <div
              class="border-2 border-dashed border-[#dcc5b8] rounded-xl p-10 text-center transition-colors hover:border-cinema-500/50 dark:border-[#2d1a21]"
              [class.border-cinema-500]="selectedFile()"
              (dragover)="$event.preventDefault()"
              (drop)="onFileDrop($event)"
            >
              @if (!selectedFile()) {
                <div class="space-y-4">
                  <div
                    class="mx-auto w-16 h-16 bg-[#fff7f0] rounded-full flex items-center justify-center text-cinema-500 dark:bg-[#1b1014]"
                  >
                    <svg
                      class="w-8 h-8"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </div>
                  <div>
                    <label
                      class="cursor-pointer bg-cinema-500 hover:bg-cinema-400 text-white px-6 py-2 rounded-lg font-medium inline-block transition-colors"
                    >
                      Choose Video File
                      <input
                        type="file"
                        class="hidden"
                        (change)="onFileSelect($event)"
                        accept="video/*"
                      />
                    </label>
                    <p class="mt-2 text-sm text-[#7b6660] dark:text-[#9f7d73]">
                      or drag and drop files here (Max 5GB)
                    </p>
                  </div>
                </div>
              } @else {
                <div
                  class="flex items-center justify-between bg-[#fff7f0] p-4 rounded-lg border border-[#dcc5b8] dark:bg-[#1b1014] dark:border-[#2d1a21]"
                >
                  <div class="flex items-center gap-4 text-left">
                    <div
                      class="w-12 h-12 bg-cinema-500/10 rounded flex items-center justify-center text-cinema-500"
                    >
                      <svg
                        class="w-6 h-6"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          d="M2 6a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 100 4v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2a2 2 0 100-4V6z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p
                        class="text-[#24181b] font-medium truncate max-w-xs dark:text-white"
                      >
                        {{ selectedFile()?.name }}
                      </p>
                      <p class="text-xs text-[#7b6660] dark:text-[#9f7d73]">
                        {{ formatFileSize(selectedFile()?.size || 0) }}
                      </p>
                    </div>
                  </div>
                  <button
                    (click)="removeFile()"
                    class="text-[#9f7d73] hover:text-red-400 transition-colors"
                  >
                    <svg
                      class="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              }
            </div>
          </div>

          <!-- Step 2: Metadata -->
          @if (selectedFile()) {
            <div class="space-y-6">
              <h3
                class="text-lg font-semibold text-[#d6b87a] flex items-center gap-2"
              >
                <span
                  class="w-7 h-7 rounded-full bg-cinema-500 text-white flex items-center justify-center text-xs"
                  >2</span
                >
                Content Details
              </h3>

              <form
                [formGroup]="form"
                class="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                <div class="space-y-2 md:col-span-2">
                  <label class="block text-sm font-medium text-[#c5aea5]"
                    >Movie Title</label
                  >
                  <input
                    formControlName="title"
                    type="text"
                    class="input-field"
                    placeholder="Full title of the movie"
                  />
                </div>

                <div class="space-y-2">
                  <label class="block text-sm font-medium text-[#c5aea5]"
                    >Release Year</label
                  >
                  <input
                    formControlName="year"
                    type="number"
                    class="input-field"
                  />
                </div>

                <div class="space-y-2">
                  <label class="block text-sm font-medium text-[#c5aea5]"
                    >Genres (Comma separated)</label
                  >
                  <input
                    formControlName="genre"
                    type="text"
                    class="input-field"
                    placeholder="Drama, Action, Nollywood"
                  />
                </div>

                <div class="space-y-2 md:col-span-2">
                  <label class="flex items-center gap-2 cursor-pointer group">
                    <input
                      formControlName="fetchMetadata"
                      type="checkbox"
                      class="text-cinema-500 rounded focus:ring-cinema-500 bg-white border-[#dcc5b8] dark:bg-[#0f0f11] dark:border-[#2d1a21]"
                    />
                    <span
                      class="text-sm text-[#24181b] group-hover:text-cinema-400 transition-colors dark:text-white"
                      >Auto-enrich with TMDB metadata (highly recommended)</span
                    >
                  </label>
                  <p class="text-xs text-[#7b6660] ml-6 dark:text-[#9f7d73]">
                    Fetches poster, backdrop, synopsis and cast automatically.
                  </p>
                </div>
              </form>
            </div>

            <!-- Step 3: Action -->
            <div class="pt-6 border-t border-[#dcc5b8] dark:border-[#2d1a21]">
              @if (isUploading()) {
                <div class="space-y-4">
                  <div class="flex justify-between items-center text-sm">
                    <span class="text-[#24181b] font-medium dark:text-white">{{
                      uploadStatus()
                    }}</span>
                    <span class="text-[#d6b87a]">{{ uploadProgress() }}%</span>
                  </div>
                  <div
                    class="w-full bg-white rounded-full h-2 overflow-hidden border border-[#dcc5b8] dark:bg-[#1b1014] dark:border-[#2d1a21]"
                  >
                    <div
                      class="bg-gradient-to-r from-cinema-600 to-cinema-400 h-full transition-all duration-300 shadow-[0_0_10px_rgba(128,0,32,0.5)]"
                      [style.width.%]="uploadProgress()"
                    ></div>
                  </div>
                  <p
                    class="text-xs text-center text-[#7b6660] dark:text-[#9f7d73]"
                  >
                    Do not close this tab until the upload is complete.
                  </p>
                </div>
              } @else {
                <button
                  (click)="startUpload()"
                  [disabled]="form.invalid"
                  class="w-full bg-cinema-500 hover:bg-cinema-400 disabled:opacity-50 disabled:grayscale text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-cinema-500/20 flex items-center justify-center gap-2"
                >
                  <svg
                    class="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  Finalize and Upload Movie
                </button>
              }
            </div>
          }
        </div>
      </div>

      <!-- Success Card -->
      @if (uploadedMovie()) {
        <div
          class="bg-green-100/70 border border-green-300 rounded-xl p-6 flex items-center gap-6 animate-in fade-in slide-in-from-bottom-4 dark:bg-green-900/20 dark:border-green-500/30"
        >
          <div
            class="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center text-green-500"
          >
            <svg
              class="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div class="flex-1">
            <h3 class="text-[#1d3b2d] font-bold text-lg dark:text-white">
              Upload Successful!
            </h3>
            <p class="text-green-900/70 text-sm dark:text-green-200/70">
              "{{ uploadedMovie()?.title }}" has been added to the library.
            </p>
          </div>
          <div class="flex gap-3">
            <a
              [routerLink]="['/movies', uploadedMovie()?.slug]"
              class="px-4 py-2 bg-white/80 hover:bg-white text-[#1d3b2d] text-sm font-medium rounded-lg transition-colors dark:bg-white/10 dark:hover:bg-white/20 dark:text-white"
              >View Movie</a
            >
            <button
              (click)="resetAll()"
              class="px-4 py-2 bg-green-500 hover:bg-green-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Upload Another
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .input-field {
        @apply w-full rounded-lg border-[#dcc5b8] bg-white text-[#24181b] placeholder-[#8a756e] shadow-sm focus:border-cinema-500 focus:ring focus:ring-cinema-500/20 transition-all py-3 px-4 border dark:border-[#2d1a21] dark:bg-[#0f0f11] dark:text-[#f7eee7] dark:placeholder-[#5a4a42];
      }
    `,
  ],
})
export class AdminMovieUploadComponent {
  private fb = inject(FormBuilder);
  private adminService = inject(AdminMoviesService);
  private router = inject(Router);

  selectedFile = signal<File | null>(null);
  isUploading = signal(false);
  uploadProgress = signal(0);
  uploadStatus = signal("");
  uploadedMovie = signal<Movie | null>(null);

  form = this.fb.group({
    title: ["", [Validators.required]],
    year: [new Date().getFullYear(), [Validators.required]],
    genre: ["Drama, Nollywood", [Validators.required]],
    fetchMetadata: [true],
  });

  onFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      this.selectedFile.set(file);
      // Try to guess title from filename
      const title = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      this.form.patchValue({ title });
    }
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("video/")) {
      this.selectedFile.set(file);
      const title = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      this.form.patchValue({ title });
    }
  }

  removeFile() {
    this.selectedFile.set(null);
    this.uploadedMovie.set(null);
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  async startUpload() {
    const file = this.selectedFile();
    if (!file || this.form.invalid) return;

    this.isUploading.set(true);
    this.uploadStatus.set("Requesting secure upload tunnel...");
    this.uploadProgress.set(5);

    try {
      // 1. Get signed URL
      const urlRes = await this.adminService
        .getUploadUrl({
          fileName: file.name,
          contentType: file.type,
        })
        .toPromise();

      if (!urlRes?.success) throw new Error("Failed to get upload URL");

      const { uploadUrl, storageKey } = urlRes.data;
      this.uploadStatus.set("Uploading video to Cloudflare R2...");

      // 2. Upload to R2
      this.adminService.uploadToR2(uploadUrl, file).subscribe({
        next: (event: HttpEvent<unknown>) => {
          if (event.type === HttpEventType.UploadProgress) {
            const percentDone = Math.round(
              (100 * event.loaded) / (event.total || file.size),
            );
            this.uploadProgress.set(5 + percentDone * 0.85); // Map 0-100 to 5-90 range
          } else if (event.type === HttpEventType.Response) {
            this.uploadStatus.set("Processing and enriching movie data...");
            this.finalizeMovie(storageKey, file.size, file.type);
          }
        },
        error: (err) => {
          this.uploadStatus.set("Upload failed. Please try again.");
          this.isUploading.set(false);
        },
      });
    } catch (error) {
      this.uploadStatus.set("Initialization failed.");
      this.isUploading.set(false);
    }
  }

  private async finalizeMovie(
    storageKey: string,
    fileSize: number,
    contentType: string,
  ) {
    const raw = this.form.getRawValue();

    try {
      const res = await this.adminService
        .adminCreateMovie({
          title: raw.title!,
          year: Number(raw.year),
          genre: raw.genre!.split(",").map((g) => g.trim()),
          storageKey,
          fileSize,
          contentType,
          fetchMetadata: !!raw.fetchMetadata,
          isStreamOnly: true,
        })
        .toPromise();

      if (res?.success) {
        this.uploadProgress.set(100);
        this.uploadStatus.set("Completed");
        this.uploadedMovie.set(res.data);
        this.isUploading.set(false);
      } else {
        throw new Error("Failed to create movie record");
      }
    } catch {
      this.uploadStatus.set("Database registration failed.");
      this.isUploading.set(false);
    }
  }

  resetAll() {
    this.selectedFile.set(null);
    this.uploadedMovie.set(null);
    this.isUploading.set(false);
    this.uploadProgress.set(0);
    this.form.reset({
      year: new Date().getFullYear(),
      genre: "Drama, Nollywood",
      fetchMetadata: true,
    });
  }
}
