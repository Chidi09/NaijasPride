import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthStateService, AuthUser } from './auth-state.service';
import { ToastService } from '../services/toast.service';
import { captureSentryWebException } from '../services/sentry-web.service';

interface RefreshResponse {
  success: boolean;
  data: {
    user: AuthUser;
    token: string;
    refreshToken: string;
  };
}

let refreshInFlight: Promise<RefreshResponse['data'] | null> | null = null;

const refreshAccessToken = (authState: AuthStateService) => {
  const storedRefreshToken = authState.getRefreshToken();
  if (!storedRefreshToken) {
    return Promise.resolve(null);
  }
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ refreshToken: storedRefreshToken }),
  })
    .then(async (response) => {
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as RefreshResponse;
      if (!payload?.success || !payload.data?.token) {
        return null;
      }

      authState.setSession(payload.data);
      return payload.data;
    })
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
};

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authState = inject(AuthStateService);
  const router = inject(Router);
  const toast = inject(ToastService);
  const token = authState.getToken();
  const isAuthRequest = req.url.includes('/auth/login') || req.url.includes('/auth/refresh');

  const requestWithAuth = token
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      })
    : req;

  return next(requestWithAuth).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && token && !isAuthRequest) {
        return from(refreshAccessToken(authState)).pipe(
          switchMap((session) => {
            if (session?.token) {
              const retryRequest = req.clone({
                setHeaders: {
                  Authorization: `Bearer ${session.token}`,
                },
              });
              return next(retryRequest);
            }

            authState.clearSession();
            toast.error('Your session expired. Please sign in again.');
            router.navigate(['/login'], {
              queryParams: { returnUrl: router.url || '/movies' },
            });
            return throwError(() => error);
          })
        );
      } else if (error.status === 0) {
        toast.error('Network error. Check your connection and try again.');
        captureSentryWebException(error, { source: 'http-interceptor', status: 0, url: req.url });
      } else if (error.status >= 500) {
        toast.error('Server error. Please try again shortly.');
        captureSentryWebException(error, {
          source: 'http-interceptor',
          status: error.status,
          url: req.url,
        });
      }

      return throwError(() => error);
    })
  );
};
