import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = authService.currentUser();

  // Check if user exists and has ADMIN role
  if (user && user.role === 'ADMIN') {
    return true;
  }

  // Not authorized? Redirect to login
  router.navigate(['/login']);
  return false;
};
