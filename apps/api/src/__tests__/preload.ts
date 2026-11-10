import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { SQL } from 'bun';
import { extendAuth } from '@repo/auth/extensions';
import { readDatabaseEnvironment, requireTestDatabase } from '@repo/db/environment';

// better-auth's scrypt is slow by design, and nearly every test creates users, so the tests
// hash with scrypt at its lowest cost. bunfig.toml preloads this file for `bun test` only,
// so the server never hashes this way.
const lowestCost = { N: 2, r: 1, p: 1 };

extendAuth({
  password: {
    hash: async (password) => {
      const salt = randomBytes(16).toString('hex');
      return `${salt}:${scryptSync(password, salt, 32, lowestCost).toString('hex')}`;
    },
    verify: async ({ hash, password }) => {
      const [salt = '', key = ''] = hash.split(':');
      const candidate = scryptSync(password, salt, 32, lowestCost);
      const stored = Buffer.from(key, 'hex');
      return stored.length === candidate.length && timingSafeEqual(stored, candidate);
    },
  },
});

// Every test empties the whole database, so each `bun test --parallel` worker runs on its
// own copy of the migrated test database, made afresh when the worker starts. This runs
// before a test file imports @repo/db, which reads DATABASE_URL once.
const worker = process.env.BUN_TEST_WORKER_ID;
const environment = requireTestDatabase(readDatabaseEnvironment(process.env));
if (worker) {
  const url = new URL(environment.connectionString);
  const template = environment.expectedName;
  const copy = `${environment.expectedName}_${worker}`;
  url.pathname = '/postgres';
  const admin = new SQL(url.toString());
  await admin.unsafe(`DROP DATABASE IF EXISTS "${copy}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${copy}" TEMPLATE "${template}"`);
  await admin.close();
  url.pathname = `/${copy}`;
  process.env.DATABASE_URL = url.toString();
  requireTestDatabase(readDatabaseEnvironment(process.env));
}
