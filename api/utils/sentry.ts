import * as Sentry from '@sentry/node';

let sentryInitialized = false;

export function initSentry() {
  if (!sentryInitialized && process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'production',
      tracesSampleRate: 1.0,
      sendDefaultPii: true
    });
    sentryInitialized = true;
  }
}

export { Sentry };