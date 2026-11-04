import pg from 'pg';
import type { Database } from './app.ts';

// A small pool: the server only checks readiness for now (#611 stage 1).
export function connectDatabase(url: string): Database | null {
  if (!url) return null;
  const pool = new pg.Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 3000 });
  // An idle client losing its connection must not crash the process.
  pool.on('error', () => {});
  return {
    async ping() {
      await pool.query('SELECT 1');
    },
    async close() {
      await pool.end();
    },
  };
}
