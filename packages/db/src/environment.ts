export type DatabaseEnvironment = 'development' | 'test' | 'production';

export interface DatabaseEnvironmentConfig {
  environment: DatabaseEnvironment;
  expectedName: string;
  databaseName: string;
  connectionString: string;
}

export class DatabaseEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseEnvironmentError';
  }
}

const environments = new Set<DatabaseEnvironment>(['development', 'test', 'production']);
const safeName = /^[A-Za-z0-9_-]+$/;
const testWorkerName = (base: string, name: string) =>
  name.startsWith(`${base}_`) && /^\d+$/.test(name.slice(base.length + 1));

export function readDatabaseEnvironment(
  env: Record<string, string | undefined>,
): DatabaseEnvironmentConfig {
  const environment = env.NODE_ENV;
  if (!environments.has(environment as DatabaseEnvironment)) {
    throw new DatabaseEnvironmentError(
      'NODE_ENV must be explicitly set to development, test, or production before database access.',
    );
  }

  const expectedName = env.DATABASE_NAME;
  if (!expectedName || !safeName.test(expectedName)) {
    throw new DatabaseEnvironmentError(
      'DATABASE_NAME must be set to the exact PostgreSQL database name before database access.',
    );
  }
  const testBase = expectedName.endsWith('_test');
  if (environment === 'test' && !testBase) {
    throw new DatabaseEnvironmentError('Test DATABASE_NAME must end with the exact _test suffix.');
  }
  if (environment !== 'test' && /_test(?:_\d+)?$/.test(expectedName)) {
    throw new DatabaseEnvironmentError(
      `${environment} DATABASE_NAME cannot use the reserved test database suffix.`,
    );
  }

  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new DatabaseEnvironmentError('DATABASE_URL is not set.');
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new DatabaseEnvironmentError('DATABASE_URL is invalid.');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new DatabaseEnvironmentError('DATABASE_URL must use the postgres protocol.');
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new DatabaseEnvironmentError('DATABASE_URL contains an invalid database name.');
  }
  if (!safeName.test(databaseName)) {
    throw new DatabaseEnvironmentError('DATABASE_URL must contain one valid database name.');
  }

  const worker = env.BUN_TEST_WORKER_ID;
  if (worker && !/^\d+$/.test(worker)) {
    throw new DatabaseEnvironmentError('BUN_TEST_WORKER_ID must be numeric.');
  }
  const isExpectedWorker = worker
    ? databaseName === `${expectedName}_${worker}`
    : testWorkerName(expectedName, databaseName);
  const isExpected =
    databaseName === expectedName ||
    ((environment as DatabaseEnvironment) === 'test' && isExpectedWorker);
  if (!isExpected) {
    throw new DatabaseEnvironmentError(
      `DATABASE_URL does not target DATABASE_NAME for the ${environment} environment.`,
    );
  }

  if (worker && environment !== 'test') {
    throw new DatabaseEnvironmentError('Test worker databases require NODE_ENV=test.');
  }

  return {
    environment: environment as DatabaseEnvironment,
    expectedName,
    databaseName,
    connectionString,
  };
}

export function requireTestDatabase(config: DatabaseEnvironmentConfig): DatabaseEnvironmentConfig {
  if (config.environment !== 'test') {
    throw new DatabaseEnvironmentError('This database operation is allowed only in test.');
  }
  return config;
}

export function assertDatabaseIdentity(
  config: DatabaseEnvironmentConfig,
  actualName: string,
): void {
  if (actualName !== config.databaseName) {
    throw new DatabaseEnvironmentError(
      `PostgreSQL connected to a different database than configured for ${config.environment}.`,
    );
  }
}
