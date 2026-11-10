import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  assertDatabaseIdentity,
  DatabaseEnvironmentError,
  readDatabaseEnvironment,
} from './environment';
import * as schema from './schema';

const environment = readDatabaseEnvironment(process.env);

// One connection per process. postgres-js manages the pool internally.
const queryClient = postgres(environment.connectionString, { prepare: false });
let identityVerified = false;

export async function verifyDatabaseIdentity(): Promise<void> {
  if (identityVerified) return;
  const [{ name }] = await queryClient<{ name: string }[]>`
    select current_database() as name
  `;
  assertDatabaseIdentity(environment, name);
  identityVerified = true;
}

export async function waitForDatabaseIdentity({
  retryDelayMs,
  onRetry,
}: {
  retryDelayMs: number;
  onRetry?: () => void;
}): Promise<void> {
  for (;;) {
    try {
      await verifyDatabaseIdentity();
      return;
    } catch (error) {
      if (error instanceof DatabaseEnvironmentError) throw error;
      onRetry?.();
      await Bun.sleep(retryDelayMs);
    }
  }
}

export const db = drizzle(queryClient, { schema });

// Either the plain db or a transaction, for a function whose caller may need to
// share one transaction across several reads/writes that must observe the same
// snapshot (a lock taken, then a read, then a write, all inside one db.transaction).
export type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
