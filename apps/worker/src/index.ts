import { waitForDatabaseIdentity } from '@repo/db';
import { workerConfig } from './config';
import { startWorkers } from './start';

// Entry point of the worker. The api applies database migrations on startup.
await waitForDatabaseIdentity({
  retryDelayMs: workerConfig().pollIntervalMs,
  onRetry: () => console.error('[worker] waiting for the configured database'),
});
startWorkers();
