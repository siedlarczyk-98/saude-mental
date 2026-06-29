import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './types.js';

const { Pool } = pg;

let _db: Kysely<Database> | null = null;

export function getDb(): Kysely<Database> {
  if (_db) return _db;

  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  _db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString, max: 10 }),
    }),
  });

  return _db;
}

export type { Database } from './types.js';
