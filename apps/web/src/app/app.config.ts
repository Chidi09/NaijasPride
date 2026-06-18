import { ApplicationConfig, ErrorHandler } from "@angular/core";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from "@angular/common/http";
import { provideAnimations } from "@angular/platform-browser/animations";
import { authInterceptor } from "./core/auth/auth.interceptor";
import { httpErrorInterceptor } from "./core/errors/http-error.interceptor";
import { GlobalErrorHandler } from "./core/errors/global-error.handler";
import {
  QueryClient,
  provideAngularQuery,
} from "@tanstack/angular-query-experimental";

import { routes } from "./app.routes";
import { provideClientHydration } from "@angular/platform-browser";

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimations(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor, httpErrorInterceptor]),
    ),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideAngularQuery(
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: 2,
          },
        },
      }),
    ),
    provideClientHydration(),
  ],
};
