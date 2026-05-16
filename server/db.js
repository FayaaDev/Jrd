import './env.js';
import { Client } from 'pg';

let databaseUrl = process.env.DATABASE_URL;

export function configureDatabaseUrl(url) {
  databaseUrl = url;
  process.env.DATABASE_URL = url;
}

function getDatabaseUrl() {
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }

  return url;
}

async function connectClient() {
  const client = new Client({ connectionString: getDatabaseUrl() });
  await client.connect();

  let released = false;
  client.release = () => {
    if (released) return;
    released = true;
    void client.end().catch(() => undefined);
  };

  return client;
}

export const pool = {
  connect() {
    return connectClient();
  },
  async query(...args) {
    const client = await connectClient();

    try {
      return await client.query(...args);
    } finally {
      await client.end().catch(() => undefined);
    }
  },
  async end() {
    // Hyperdrive keeps the actual connection pool; request clients close themselves.
  },
};

export async function closeDb() {
  await pool.end();
}
