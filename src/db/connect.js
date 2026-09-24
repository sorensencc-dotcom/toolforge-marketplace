import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost/marketplace_dev';

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
});

export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 200) {
      console.warn(`Slow query (${duration}ms): ${text.substring(0, 80)}`);
    }
    return result;
  } catch (error) {
    console.error('Database error:', error);
    throw error;
  }
}

export async function queryOne(text, params) {
  const result = await query(text, params);
  return result.rows[0];
}

export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function health() {
  try {
    const result = await query('SELECT NOW()');
    return result.rows[0];
  } catch {
    return null;
  }
}

/**
 * Wraps a primary database connection with an optional fallback database.
 * Catches ECONNREFUSED connection errors and transparently delegates queries to the fallback database.
 * @param {{ query: Function }} primaryDb
 * @param {{ query: Function }} fallbackDb
 * @param {{ logger?: Function }} [options]
 * @returns {{ query: Function, isFailing: boolean }}
 */
export function createResilientDb(primaryDb, fallbackDb, options = {}) {
  const logger = options.logger || console.error;
  let isPrimaryFailing = false;

  return {
    get isFailing() {
      return isPrimaryFailing;
    },
    query: async (text, params) => {
      try {
        const res = await primaryDb.query(text, params);
        if (isPrimaryFailing) {
          isPrimaryFailing = false;
          if (logger) {
            logger('[ResilientDB] Primary DB connection recovered. Routing queries to primary DB.');
          }
        }
        return res;
      } catch (err) {
        const isConnRefused =
          err &&
          (err.code === 'ECONNREFUSED' ||
            (Array.isArray(err.errors) && err.errors.some((e) => e && e.code === 'ECONNREFUSED')));

        if (isConnRefused && fallbackDb) {
          if (!isPrimaryFailing) {
            isPrimaryFailing = true;
            if (logger) {
              logger(`[ResilientDB] Primary DB connection refused (${err.message || 'ECONNREFUSED'}). Falling back to secondary DB.`);
            }
          }
          return await fallbackDb.query(text, params);
        }
        throw err;
      }
    },
  };
}

