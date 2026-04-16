import { Pool } from 'pg';
import { buildDefaultPortfolioSnapshot } from './defaultPortfolio.js';
import { PortfolioSnapshotSchema } from './schemas.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const PORTFOLIO_SLUG = process.env.PORTFOLIO_SLUG ?? 'shared';

export async function initStore() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfolio_documents (
      slug TEXT PRIMARY KEY,
      holdings JSONB NOT NULL,
      settings JSONB NOT NULL,
      watchlist JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function parseSnapshot(row) {
  return PortfolioSnapshotSchema.parse({
    holdings: row.holdings,
    settings: row.settings,
    watchlist: row.watchlist,
  });
}

async function ensurePortfolioExists(client) {
  const snapshot = buildDefaultPortfolioSnapshot();

  await client.query(
    `
      INSERT INTO portfolio_documents (slug, holdings, settings, watchlist)
      VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb)
      ON CONFLICT (slug) DO NOTHING
    `,
    [
      PORTFOLIO_SLUG,
      JSON.stringify(snapshot.holdings),
      JSON.stringify(snapshot.settings),
      JSON.stringify(snapshot.watchlist),
    ]
  );
}

async function loadLockedSnapshot(client) {
  await ensurePortfolioExists(client);

  const result = await client.query(
    `
      SELECT holdings, settings, watchlist
      FROM portfolio_documents
      WHERE slug = $1
      FOR UPDATE
    `,
    [PORTFOLIO_SLUG]
  );

  return parseSnapshot(result.rows[0]);
}

async function saveSnapshot(client, snapshot) {
  const parsed = PortfolioSnapshotSchema.parse(snapshot);

  await client.query(
    `
      UPDATE portfolio_documents
      SET holdings = $2::jsonb,
          settings = $3::jsonb,
          watchlist = $4::jsonb,
          updated_at = NOW()
      WHERE slug = $1
    `,
    [
      PORTFOLIO_SLUG,
      JSON.stringify(parsed.holdings),
      JSON.stringify(parsed.settings),
      JSON.stringify(parsed.watchlist),
    ]
  );

  return parsed;
}

export async function getPortfolioSnapshot() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const snapshot = await loadLockedSnapshot(client);
    await client.query('COMMIT');
    return snapshot;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updatePortfolioSnapshot(mutator) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const current = await loadLockedSnapshot(client);
    const next = await mutator(current);
    const saved = await saveSnapshot(client, next);
    await client.query('COMMIT');
    return saved;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function resetPortfolioSnapshot() {
  return updatePortfolioSnapshot(() => buildDefaultPortfolioSnapshot());
}

export async function closeStore() {
  await pool.end();
}
