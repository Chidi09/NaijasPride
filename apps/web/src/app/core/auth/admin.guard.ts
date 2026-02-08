import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from './auth-state.service';

export const adminGuard: CanActivateFn = (_route, state) => {
  const authState = inject(AuthStateService);
  const router = inject(Router);
  const user = authState.currentUser();

  if (!authState.isAuthenticated()) {
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  // Check if user exists and has ADMIN role
  if (user && user.role === 'ADMIN') {
    return true;
  }

  // Authenticated but not authorized.
  router.navigate(['/movies']);
  return false;
};
