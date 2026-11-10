import { describe, expect, it } from 'bun:test';
import {
  assertDatabaseIdentity,
  readDatabaseEnvironment,
  requireTestDatabase,
} from '../environment';

const env = (overrides: Record<string, string | undefined> = {}) => ({
  NODE_ENV: 'development',
  DATABASE_NAME: 'itsaplan_p2',
  DATABASE_URL: 'postgres://user:secret@localhost:5432/itsaplan_p2',
  ...overrides,
});

describe('database environment guard', () => {
  it('accepts an exact development database', () => {
    const config = readDatabaseEnvironment(env());
    expect(config.environment).toBe('development');
    expect(config.databaseName).toBe('itsaplan_p2');
    expect(() => assertDatabaseIdentity(config, 'itsaplan_p2')).not.toThrow();
  });

  it('accepts the test database and isolated worker suffixes', () => {
    for (const name of ['itsaplan_test', 'itsaplan_test_1', 'itsaplan_test_2']) {
      const config = readDatabaseEnvironment(
        env({
          NODE_ENV: 'test',
          DATABASE_NAME: 'itsaplan_test',
          DATABASE_URL: `postgres://user:secret@localhost:5432/${name}`,
        }),
      );
      expect(requireTestDatabase(config).databaseName).toBe(name);
    }
    expect(() =>
      readDatabaseEnvironment(
        env({
          NODE_ENV: 'test',
          DATABASE_NAME: 'itsaplan_test',
          DATABASE_URL: 'postgres://user:secret@localhost:5432/itsaplan_test_2',
          BUN_TEST_WORKER_ID: '1',
        }),
      ),
    ).toThrow('does not target DATABASE_NAME');
  });

  it('rejects missing and invalid configuration without exposing the URL', () => {
    expect(() => readDatabaseEnvironment(env({ NODE_ENV: undefined }))).toThrow('NODE_ENV');
    expect(() => readDatabaseEnvironment(env({ DATABASE_NAME: undefined }))).toThrow(
      'DATABASE_NAME',
    );
    expect(() => readDatabaseEnvironment(env({ DATABASE_URL: 'not a url' }))).toThrow(
      'DATABASE_URL is invalid',
    );
    try {
      readDatabaseEnvironment(env({ DATABASE_URL: 'postgres://user:top-secret@localhost/wrong' }));
    } catch (error) {
      expect(String(error)).not.toContain('top-secret');
    }
  });

  it('rejects development pointing to a test database', () => {
    expect(() =>
      readDatabaseEnvironment(
        env({
          DATABASE_NAME: 'itsaplan_test',
          DATABASE_URL: 'postgres://user:secret@localhost:5432/itsaplan_test',
        }),
      ),
    ).toThrow('reserved test database suffix');
  });

  it('rejects test pointing to a development database', () => {
    expect(() =>
      readDatabaseEnvironment(
        env({
          NODE_ENV: 'test',
          DATABASE_NAME: 'itsaplan_p2',
          DATABASE_URL: 'postgres://user:secret@localhost:5432/itsaplan_p2',
        }),
      ),
    ).toThrow('exact _test suffix');
  });

  it('rejects incorrect production configuration', () => {
    expect(() =>
      readDatabaseEnvironment(
        env({
          NODE_ENV: 'production',
          DATABASE_NAME: 'groupmate_test',
          DATABASE_URL: 'postgres://user:secret@db:5432/groupmate_test',
        }),
      ),
    ).toThrow('reserved test database suffix');
    expect(() =>
      readDatabaseEnvironment(env({ NODE_ENV: 'production', BUN_TEST_WORKER_ID: '1' })),
    ).toThrow('Test worker databases require NODE_ENV=test');
  });

  it('fails before a protected operation can run', () => {
    let called = false;
    expect(() => {
      const config = readDatabaseEnvironment(env());
      assertDatabaseIdentity(config, 'other_database');
      called = true;
    }).toThrow('PostgreSQL connected to a different database');
    expect(called).toBe(false);
  });
});
