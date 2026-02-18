import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-[#f7efe8] dark:bg-cinema-900 py-12 px-4">
      <div class="max-w-2xl mx-auto">
        <!-- Header -->
        <div class="mb-8">
          <a routerLink="/profile" class="text-[#9f7d73] hover:text-[#24181b] dark:hover:text-white text-sm mb-4 inline-block">
            ← Back to Profile
          </a>
          <h1 class="text-3xl font-serif font-bold text-[#24181b] dark:text-white">Account Settings</h1>
          <p class="text-[#9f7d73] mt-1">Manage your profile, password, and preferences</p>
        </div>

        <!-- Success Message -->
        @if (successMessage) {
          <div class="mb-6 bg-green-500/10 border border-green-500/20 rounded-lg p-4 flex items-center gap-3">
            <svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            <p class="text-green-700 dark:text-green-400">{{ successMessage }}</p>
          </div>
        }

        <!-- Error Message -->
        @if (errorMessage) {
          <div class="mb-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center gap-3">
            <svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
            </svg>
            <p class="text-red-700 dark:text-red-400">{{ errorMessage }}</p>
          </div>
        }

        <!-- Profile Information -->
        <div class="bg-white dark:bg-cinema-800 rounded-xl shadow-sm border border-[#dcc5b8] dark:border-white/5 p-6 mb-6">
          <h2 class="text-lg font-bold text-[#24181b] dark:text-white mb-4">Profile Information</h2>
          
          <form [formGroup]="profileForm" (ngSubmit)="updateProfile()">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-[#725f58] dark:text-gray-400 mb-1">Full Name</label>
                <input
                  type="text"
                  formControlName="name"
                  class="w-full px-4 py-2 bg-[#f8f0e9] dark:bg-cinema-900 border border-[#dcc5b8] dark:border-white/10 rounded-lg text-[#24181b] dark:text-white focus:border-cinema-500 focus:outline-none"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-[#725f58] dark:text-gray-400 mb-1">Email Address</label>
                <input
                  type="email"
                  formControlName="email"
                  class="w-full px-4 py-2 bg-[#f8f0e9] dark:bg-cinema-900 border border-[#dcc5b8] dark:border-white/10 rounded-lg text-[#24181b] dark:text-white focus:border-cinema-500 focus:outline-none"
                  placeholder="your@email.com"
                />
                @if (!currentUser()?.emailVerified) {
                  <p class="text-xs text-yellow-600 dark:text-yellow-400 mt-1">⚠ Email not verified. <a routerLink="/profile" class="underline">Resend verification</a></p>
                }
              </div>
            </div>

            <div class="mt-6 flex justify-end">
              <button
                type="submit"
                [disabled]="updating || profileForm.pristine"
                class="bg-cinema-500 hover:bg-cinema-400 disabled:bg-cinema-700 disabled:cursor-not-allowed text-white font-medium px-6 py-2 rounded-lg transition-colors"
              >
                {{ updating ? 'Saving...' : 'Save Changes' }}
              </button>
            </div>
          </form>
        </div>

        <!-- Change Password -->
        <div class="bg-white dark:bg-cinema-800 rounded-xl shadow-sm border border-[#dcc5b8] dark:border-white/5 p-6 mb-6">
          <h2 class="text-lg font-bold text-[#24181b] dark:text-white mb-4">Change Password</h2>
          
          <form [formGroup]="passwordForm" (ngSubmit)="changePassword()">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-[#725f58] dark:text-gray-400 mb-1">Current Password</label>
                <input
                  type="password"
                  formControlName="currentPassword"
                  class="w-full px-4 py-2 bg-[#f8f0e9] dark:bg-cinema-900 border border-[#dcc5b8] dark:border-white/10 rounded-lg text-[#24181b] dark:text-white focus:border-cinema-500 focus:outline-none"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-[#725f58] dark:text-gray-400 mb-1">New Password</label>
                <input
                  type="password"
                  formControlName="newPassword"
                  class="w-full px-4 py-2 bg-[#f8f0e9] dark:bg-cinema-900 border border-[#dcc5b8] dark:border-white/10 rounded-lg text-[#24181b] dark:text-white focus:border-cinema-500 focus:outline-none"
                  placeholder="Min 8 characters"
                />
                @if (passwordForm.get('newPassword')?.hasError('minlength') && passwordForm.get('newPassword')?.touched) {
                  <p class="text-xs text-red-500 mt-1">Password must be at least 8 characters</p>
                }
              </div>

              <div>
                <label class="block text-sm font-medium text-[#725f58] dark:text-gray-400 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  formControlName="confirmPassword"
                  class="w-full px-4 py-2 bg-[#f8f0e9] dark:bg-cinema-900 border border-[#dcc5b8] dark:border-white/10 rounded-lg text-[#24181b] dark:text-white focus:border-cinema-500 focus:outline-none"
                  placeholder="••••••••"
                />
                @if (passwordForm.hasError('mismatch') && passwordForm.get('confirmPassword')?.touched) {
                  <p class="text-xs text-red-500 mt-1">Passwords do not match</p>
                }
              </div>
            </div>

            <div class="mt-6 flex justify-end">
              <button
                type="submit"
                [disabled]="changingPassword || passwordForm.invalid"
                class="bg-cinema-500 hover:bg-cinema-400 disabled:bg-cinema-700 disabled:cursor-not-allowed text-white font-medium px-6 py-2 rounded-lg transition-colors"
              >
                {{ changingPassword ? 'Updating...' : 'Update Password' }}
              </button>
            </div>
          </form>
        </div>

        <!-- Account Info -->
        <div class="bg-white dark:bg-cinema-800 rounded-xl shadow-sm border border-[#dcc5b8] dark:border-white/5 p-6">
          <h2 class="text-lg font-bold text-[#24181b] dark:text-white mb-4">Account Information</h2>
          
          <div class="space-y-3 text-sm">
            <div class="flex justify-between py-2 border-b border-[#dcc5b8] dark:border-white/5">
              <span class="text-[#725f58] dark:text-gray-400">Member Since</span>
              <span class="text-[#24181b] dark:text-white">{{ currentUser()?.createdAt | date:'mediumDate' }}</span>
            </div>
            <div class="flex justify-between py-2 border-b border-[#dcc5b8] dark:border-white/5">
              <span class="text-[#725f58] dark:text-gray-400">Account Type</span>
              <span class="text-[#24181b] dark:text-white">{{ currentUser()?.isPremium ? 'Premium' : 'Free' }}</span>
            </div>
            <div class="flex justify-between py-2">
              <span class="text-[#725f58] dark:text-gray-400">Role</span>
              <span class="text-[#24181b] dark:text-white">{{ currentUser()?.role }}</span>
            </div>
          </div>

          <div class="mt-6 pt-6 border-t border-[#dcc5b8] dark:border-white/5">
            <p class="text-xs text-[#9f7d73]">
              Need help? Contact support at <a href="mailto:support&#64;naijaspride.com" class="text-cinema-500 hover:underline">support&#64;naijaspride.com</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  `
})
export class AccountSettingsComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);

  currentUser = this.auth.currentUser;
  updating = false;
  changingPassword = false;
  successMessage: string | null = null;
  errorMessage: string | null = null;

  profileForm = this.fb.group({
    name: [''],
    email: ['', [Validators.email]],
  });

  passwordForm = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  }, { validators: this.passwordMatchValidator });

  ngOnInit() {
    const user = this.currentUser();
    if (user) {
      this.profileForm.patchValue({
        name: user.name || '',
        email: user.email || '',
      });
    }
  }

  passwordMatchValidator(group: ReturnType<typeof this.fb.group>) {
    const newPass = group.get('newPassword')?.value;
    const confirmPass = group.get('confirmPassword')?.value;
    return newPass === confirmPass ? null : { mismatch: true };
  }

  updateProfile() {
    if (this.profileForm.invalid) return;

    this.updating = true;
    this.clearMessages();

    const data = this.profileForm.value;
    this.http.patch('/api/v1/profile', data).subscribe({
      next: (res: any) => {
        this.updating = false;
        this.successMessage = 'Profile updated successfully';
        // Update the local user state
        this.auth.refreshUser();
        this.profileForm.markAsPristine();
      },
      error: (err) => {
        this.updating = false;
        this.errorMessage = err.error?.message || 'Failed to update profile';
      },
    });
  }

  changePassword() {
    if (this.passwordForm.invalid) return;

    this.changingPassword = true;
    this.clearMessages();

    const { currentPassword, newPassword } = this.passwordForm.value;
    this.http.patch('/api/v1/profile', { currentPassword, newPassword }).subscribe({
      next: () => {
        this.changingPassword = false;
        this.successMessage = 'Password updated successfully';
        this.passwordForm.reset();
      },
      error: (err) => {
        this.changingPassword = false;
        this.errorMessage = err.error?.message || 'Failed to update password';
      },
    });
  }

  clearMessages() {
    this.successMessage = null;
    this.errorMessage = null;
  }
}
