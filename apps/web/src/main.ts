import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import {
  captureSentryWebException,
  initSentryWebHandlers,
  isSentryWebEnabled,
} from './app/core/services/sentry-web.service';

initSentryWebHandlers();

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => {
    captureSentryWebException(err, { phase: 'bootstrap' });
    console.error(err);
  });

if (isSentryWebEnabled()) {
  console.info('Sentry web error tracking enabled');
}

if ('serviceWorker' in navigator) {
  const isSecureContext = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  if (isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        captureSentryWebException(err, { phase: 'service-worker-register' });
        console.error('Service worker registration failed', err);
      });
    });
  }
}
