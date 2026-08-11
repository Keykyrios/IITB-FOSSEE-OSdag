import pg from 'pg';
import config from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
});

// Surface connection errors early instead of failing silently on the first query.
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});
