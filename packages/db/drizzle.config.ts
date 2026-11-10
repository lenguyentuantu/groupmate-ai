import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { readDatabaseEnvironment } from './src/environment';

// Load environment variables from the monorepo root .env. `quiet` drops the banner
// dotenv prints on every load.
config({ path: '../../.env', quiet: true });
const environment = readDatabaseEnvironment(process.env);

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: environment.connectionString,
  },
  verbose: true,
  strict: true,
});
