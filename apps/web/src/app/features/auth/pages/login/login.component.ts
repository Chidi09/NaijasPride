import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../../core/auth/auth.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div class="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg">
        <div>
          <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to NaijasPride
          </h2>
          <p class="mt-2 text-center text-sm text-gray-600">
            Or <a href="#" class="font-medium text-primary hover:text-primary-dark">create a new account</a>
          </p>
        </div>
        
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="mt-8 space-y-6">
          <div class="rounded-md shadow-sm -space-y-px">
            <div>
              <label for="email-address" class="sr-only">Email address</label>
              <input formControlName="email" type="email" required 
                class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm" 
                placeholder="Email address">
            </div>
            <div>
              <label for="password" class="sr-only">Password</label>
              <input formControlName="password" type="password" required 
                class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm" 
                placeholder="Password">
            </div>
          </div>

          @if (error) {
            <div class="text-red-500 text-sm text-center bg-red-50 p-2 rounded">
              {{ error }}
            </div>
          }

          <div>
            <button type="submit" [disabled]="form.invalid || isLoading" 
              class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50">
              @if (isLoading) {
                Processing...
              } @else {
                Sign in
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  isLoading = false;
  error = '';

  onSubmit() {
    if (this.form.valid) {
      this.isLoading = true;
      this.error = '';
      
      this.authService.login(this.form.value as any).subscribe({
        next: () => {
          // Navigation handles in service
        },
        error: (err) => {
          this.isLoading = false;
          this.error = err.error?.error || 'Login failed. Please check your credentials.';
        }
      });
    }
  }
}
