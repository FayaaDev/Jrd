import { buildDefaultPortfolioSnapshot } from './defaultPortfolio.js';
import { pool, closeDb } from './db.js';
import { normalizeSettings } from './config.js';
import { PortfolioLedgerSchema, PortfolioSnapshotSchema } from './schemas.js';

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function toIsoString(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return new Date(value).toISOString();
}

function buildInitialPortfolioSnapshot() {
  return buildDefaultPortfolioSnapshot();
}

function normalizeSnapshot(snapshot) {
  return {
    ...snapshot,
    settings: normalizeSettings(snapshot.settings),
  };
}

function parseSnapshot(snapshot) {
  return PortfolioSnapshotSchema.parse(normalizeSnapshot(snapshot));
}

function parseLedgerRow(row) {
  return PortfolioLedgerSchema.parse({
    id: row.id,
    ownerUserId: row.owner_user_id,
    status: row.status,
    holdings: row.holdings,
    settings: row.settings,
    watchlist: row.watchlist,
    archivedAt: toIsoString(row.archived_at),
    archivedByUserId: row.archived_by_user_id ?? null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  });
}

function parseUserRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name ?? null,
    email: row.email,
    image: row.image ?? null,
    role: row.role ?? 'user',
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function loadLedger(client, userId, { forUpdate = false } = {}) {
  const result = await client.query(
    `
      SELECT id,
             owner_user_id,
             status,
             holdings,
             settings,
             watchlist,
             archived_at,
             archived_by_user_id,
             created_at,
             updated_at
      FROM portfolio_ledgers
      WHERE owner_user_id = $1
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [userId]
  );

  return result.rows[0] ? parseLedgerRow(result.rows[0]) : null;
}

async function insertBlankLedger(client, userId, { overwrite = false } = {}) {
  const snapshot = buildInitialPortfolioSnapshot();
  const values = [
    userId,
    JSON.stringify(snapshot.holdings),
    JSON.stringify(snapshot.settings),
    JSON.stringify(snapshot.watchlist),
  ];

  if (overwrite) {
    const result = await client.query(
      `
        INSERT INTO portfolio_ledgers (owner_user_id, status, holdings, settings, watchlist)
        VALUES ($1, 'active', $2::jsonb, $3::jsonb, $4::jsonb)
        ON CONFLICT (owner_user_id) DO UPDATE
        SET status = 'active',
            holdings = EXCLUDED.holdings,
            settings = EXCLUDED.settings,
            watchlist = EXCLUDED.watchlist,
            archived_at = NULL,
            archived_by_user_id = NULL,
            updated_at = NOW()
        RETURNING id,
                  owner_user_id,
                  status,
                  holdings,
                  settings,
                  watchlist,
                  archived_at,
                  archived_by_user_id,
                  created_at,
                  updated_at
      `,
      values
    );

    return parseLedgerRow(result.rows[0]);
  }

  const result = await client.query(
    `
      INSERT INTO portfolio_ledgers (owner_user_id, status, holdings, settings, watchlist)
      VALUES ($1, 'active', $2::jsonb, $3::jsonb, $4::jsonb)
      ON CONFLICT (owner_user_id) DO NOTHING
      RETURNING id,
                owner_user_id,
                status,
                holdings,
                settings,
                watchlist,
                archived_at,
                archived_by_user_id,
                created_at,
                updated_at
    `,
    values
  );

  if (result.rows[0]) {
    return parseLedgerRow(result.rows[0]);
  }

  return loadLedger(client, userId);
}

async function loadOrCreateLedger(client, userId, { forUpdate = false, createIfMissing = false } = {}) {
  let ledger = await loadLedger(client, userId, { forUpdate });

  if (!ledger && createIfMissing) {
    ledger = await insertBlankLedger(client, userId);
    if (forUpdate) {
      ledger = await loadLedger(client, userId, { forUpdate: true });
    }
  }

  return ledger;
}

async function saveLedgerSnapshot(client, userId, snapshot) {
  const parsed = parseSnapshot(snapshot);
  const result = await client.query(
    `
      UPDATE portfolio_ledgers
      SET holdings = $2::jsonb,
          settings = $3::jsonb,
          watchlist = $4::jsonb,
          updated_at = NOW()
      WHERE owner_user_id = $1
      RETURNING id,
                owner_user_id,
                status,
                holdings,
                settings,
                watchlist,
                archived_at,
                archived_by_user_id,
                created_at,
                updated_at
    `,
    [
      userId,
      JSON.stringify(parsed.holdings),
      JSON.stringify(parsed.settings),
      JSON.stringify(parsed.watchlist),
    ]
  );

  if (!result.rows[0]) {
    throw createHttpError(404, 'Ledger not found.');
  }

  return parseLedgerRow(result.rows[0]);
}

export async function initStore() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfolio_ledgers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      holdings JSONB NOT NULL DEFAULT '[]'::jsonb,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      watchlist JSONB NOT NULL DEFAULT '[]'::jsonb,
      archived_at TIMESTAMPTZ,
      archived_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function maybeGetLedgerByUserId(userId) {
  const client = await pool.connect();

  try {
    return await loadLedger(client, userId);
  } finally {
    client.release();
  }
}

export async function getLedgerByUserId(userId, { createIfMissing = false } = {}) {
  const client = await pool.connect();

  try {
    const ledger = await loadOrCreateLedger(client, userId, { createIfMissing });
    if (!ledger) {
      throw createHttpError(404, 'Ledger not found.');
    }

    return ledger;
  } finally {
    client.release();
  }
}

export async function createBlankLedgerForUser(userId, { overwrite = false } = {}) {
  const client = await pool.connect();

  try {
    return await insertBlankLedger(client, userId, { overwrite });
  } finally {
    client.release();
  }
}

export async function updateLedgerByUserId(userId, mutator, { createIfMissing = false } = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const current = await loadOrCreateLedger(client, userId, {
      createIfMissing,
      forUpdate: true,
    });

    if (!current) {
      throw createHttpError(404, 'Ledger not found.');
    }

    const nextSnapshot = await mutator(
      {
        holdings: current.holdings,
        settings: current.settings,
        watchlist: current.watchlist,
      },
      current
    );

    const saved = await saveLedgerSnapshot(client, userId, nextSnapshot);
    await client.query('COMMIT');
    return saved;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function replaceLedgerByUserId(userId, snapshot, { createIfMissing = false } = {}) {
  return updateLedgerByUserId(userId, () => snapshot, { createIfMissing });
}

export async function resetLedgerByUserId(userId, { createIfMissing = false } = {}) {
  return replaceLedgerByUserId(userId, buildInitialPortfolioSnapshot(), { createIfMissing });
}

export async function archiveLedgerByUserId(userId, adminUserId) {
  const result = await pool.query(
    `
      UPDATE portfolio_ledgers
      SET status = 'archived',
          archived_at = NOW(),
          archived_by_user_id = $2,
          updated_at = NOW()
      WHERE owner_user_id = $1
      RETURNING id,
                owner_user_id,
                status,
                holdings,
                settings,
                watchlist,
                archived_at,
                archived_by_user_id,
                created_at,
                updated_at
    `,
    [userId, adminUserId]
  );

  if (!result.rows[0]) {
    throw createHttpError(404, 'Ledger not found.');
  }

  return parseLedgerRow(result.rows[0]);
}

export async function restoreLedgerByUserId(userId) {
  const result = await pool.query(
    `
      UPDATE portfolio_ledgers
      SET status = 'active',
          archived_at = NULL,
          archived_by_user_id = NULL,
          updated_at = NOW()
      WHERE owner_user_id = $1
      RETURNING id,
                owner_user_id,
                status,
                holdings,
                settings,
                watchlist,
                archived_at,
                archived_by_user_id,
                created_at,
                updated_at
    `,
    [userId]
  );

  if (!result.rows[0]) {
    throw createHttpError(404, 'Ledger not found.');
  }

  return parseLedgerRow(result.rows[0]);
}

export async function deleteLedgerByUserId(userId) {
  const result = await pool.query(
    'DELETE FROM portfolio_ledgers WHERE owner_user_id = $1 RETURNING id',
    [userId]
  );

  return Boolean(result.rows[0]);
}

export async function getUserById(userId) {
  const result = await pool.query(
    `
      SELECT id,
             name,
             email,
             image,
             COALESCE(role, 'user') AS role,
             "createdAt" AS created_at,
             "updatedAt" AS updated_at
      FROM "user"
      WHERE id = $1
    `,
    [userId]
  );

  return parseUserRow(result.rows[0]);
}

export async function listUsers({ search = '' } = {}) {
  const needle = search.trim();
  const like = `%${needle}%`;
  const result = await pool.query(
    `
      SELECT u.id,
             u.name,
             u.email,
             u.image,
             COALESCE(u.role, 'user') AS role,
             u."createdAt" AS created_at,
             u."updatedAt" AS updated_at,
             l.id AS ledger_id,
             l.status AS ledger_status
      FROM "user" u
      LEFT JOIN portfolio_ledgers l
        ON l.owner_user_id = u.id
      WHERE ($1 = '' OR COALESCE(u.name, '') ILIKE $2 OR u.email ILIKE $2)
      ORDER BY u."createdAt" DESC, u.email ASC
    `,
    [needle, like]
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name ?? null,
    email: row.email,
    image: row.image ?? null,
    role: row.role ?? 'user',
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    hasLedger: Boolean(row.ledger_id),
    ledgerStatus: row.ledger_status ?? null,
  }));
}

export async function listPortfolios({ search = '', status } = {}) {
  const needle = search.trim();
  const like = `%${needle}%`;
  const normalizedStatus = status ?? null;
  const result = await pool.query(
    `
      SELECT u.id AS user_id,
             u.name,
             u.email,
             u.image,
             COALESCE(u.role, 'user') AS role,
             u."createdAt" AS user_created_at,
             l.id AS ledger_id,
             l.status,
             l.updated_at,
             l.archived_at,
             CASE WHEN l.holdings IS NULL THEN 0 ELSE jsonb_array_length(l.holdings) END AS holdings_count,
             CASE WHEN l.watchlist IS NULL THEN 0 ELSE jsonb_array_length(l.watchlist) END AS watchlist_count
      FROM "user" u
      LEFT JOIN portfolio_ledgers l
        ON l.owner_user_id = u.id
      WHERE ($1 = '' OR COALESCE(u.name, '') ILIKE $2 OR u.email ILIKE $2)
        AND ($3::text IS NULL OR l.status = $3)
      ORDER BY COALESCE(l.updated_at, u."createdAt") DESC, u.email ASC
    `,
    [needle, like, normalizedStatus]
  );

  return result.rows.map((row) => ({
    userId: row.user_id,
    name: row.name ?? null,
    email: row.email,
    image: row.image ?? null,
    role: row.role ?? 'user',
    userCreatedAt: toIsoString(row.user_created_at),
    ledgerId: row.ledger_id ?? null,
    status: row.status ?? null,
    updatedAt: toIsoString(row.updated_at),
    archivedAt: toIsoString(row.archived_at),
    hasLedger: Boolean(row.ledger_id),
    holdingsCount: Number(row.holdings_count ?? 0),
    watchlistCount: Number(row.watchlist_count ?? 0),
  }));
}

export async function getAdminDashboardStats() {
  const result = await pool.query(`
    SELECT COUNT(*)::int AS total_users,
           COUNT(l.id) FILTER (WHERE l.status = 'active')::int AS active_ledgers,
           COUNT(l.id) FILTER (WHERE l.status = 'archived')::int AS archived_ledgers,
           COUNT(*) FILTER (WHERE l.id IS NULL)::int AS missing_ledgers
    FROM "user" u
    LEFT JOIN portfolio_ledgers l
      ON l.owner_user_id = u.id
  `);

  const row = result.rows[0] ?? {
    total_users: 0,
    active_ledgers: 0,
    archived_ledgers: 0,
    missing_ledgers: 0,
  };

  return {
    totalUsers: Number(row.total_users ?? 0),
    activeLedgers: Number(row.active_ledgers ?? 0),
    archivedLedgers: Number(row.archived_ledgers ?? 0),
    missingLedgers: Number(row.missing_ledgers ?? 0),
  };
}

export async function closeStore() {
  await closeDb();
}
