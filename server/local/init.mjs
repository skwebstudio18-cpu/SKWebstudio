import { openLocalDatabase } from './database.mjs';
const local = await openLocalDatabase();
try {
  const { rows } = await local.pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'skts_%' ORDER BY tablename");
  console.log('Persistent local database ready at ' + local.directory);
  console.log('Tables: ' + rows.map(row=>row.tablename).join(', '));
} finally { await local.close(); }
