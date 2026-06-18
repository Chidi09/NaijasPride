import { mergeApplicationConfig, ApplicationConfig } from "@angular/core";
import { provideServerRendering } from "@angular/platform-server";
import { appConfig } from "./app.config";
import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpResponse,
  provideHttpClient,
  withInterceptors,
} from "@angular/common/http";
import { of } from "rxjs";

const mockApiInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  if (req.url.startsWith("/api/")) {
    return of(new HttpResponse({ status: 200, body: { data: [] } }));
  }
  return next(req);
};

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    provideHttpClient(withInterceptors([mockApiInterceptor])),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
