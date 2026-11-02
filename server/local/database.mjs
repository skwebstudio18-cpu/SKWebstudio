import { NetlifyDB } from '@netlify/database-dev';
import { getDatabase } from '@netlify/database';
import { resolve } from 'node:path';
export const projectRoot = resolve(import.meta.dirname, '../..');
export async function openLocalDatabase(directory = resolve(projectRoot,'.data/skts-postgres')) {
  const database = new NetlifyDB({ directory, logger:()=>{} });
  try {
    const connectionString = await database.start();
    await database.applyMigrations(resolve(projectRoot,'netlify/database/migrations'));
    await database.applyMigrations(resolve(projectRoot,'server/local/migrations'));
    const { pool } = getDatabase({ connectionString });
    return { database, pool, directory, async close() { await pool.end(); await database.stop(); } };
  } catch(error) { await database.stop().catch(()=>{}); throw error; }
}
