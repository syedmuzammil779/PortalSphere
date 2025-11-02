import * as Sentry from '@sentry/remix';

export function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,  // Your Sentry DSN (usually stored in an environment variable)
    tracesSampleRate: 1.0,  // Adjust this to sample fewer transactions if needed
    environment: process.env.NODE_ENV,  // Set the environment to 'production', 'staging', etc.
  });
}