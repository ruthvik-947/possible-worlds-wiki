import * as Sentry from '@sentry/node';

let sentryInitialized = false;

export function initSentry() {
  if (!sentryInitialized && process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      integrations: [],
      environment: process.env.NODE_ENV || 'production',
      tracesSampleRate: 1.0,
      sendDefaultPii: false
    });
    sentryInitialized = true;
  }
}

export { Sentry };