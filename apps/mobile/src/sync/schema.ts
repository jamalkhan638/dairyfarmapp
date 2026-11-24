import type { LocalDb } from './db-types';

/**
 * Phone database. Each entry in MIGRATIONS runs once, in order (tracked in meta.schema_version).
 *
 * records  - every synced record as JSON.
 *            data   = what the app shows: the server copy plus this phone's unsent changes
 *            server = the last copy received from the server (null if never synced)
 * outbox   - changes waiting to be sent, oldest first. Never deleted until the server answers.
 * uploads  - photos waiting to be uploaded.
 * meta     - sync cursor, access key, last sync time, cached history.
 */
const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
   CREATE TABLE IF NOT EXISTS records (
     entity TEXT NOT NULL,
     id TEXT NOT NULL,
     data TEXT NOT NULL,
     server TEXT,
     sync_state TEXT NOT NULL DEFAULT 'synced',
     PRIMARY KEY (entity, id)
   );
   CREATE TABLE IF NOT EXISTS outbox (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     mutation_id TEXT NOT NULL UNIQUE,
     user_id TEXT NOT NULL,
     entity TEXT NOT NULL,
     op TEXT NOT NULL,
     record_id TEXT NOT NULL,
     data TEXT,
     base TEXT,
     base_version INTEGER,
     local TEXT,
     client_time TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     error TEXT,
     error_code TEXT,
     conflict_id TEXT,
     attempts INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX IF NOT EXISTS outbox_record ON outbox (record_id, seq);
   CREATE TABLE IF NOT EXISTS uploads (
     attachment_id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     local_uri TEXT NOT NULL,
     content_type TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     attempts INTEGER NOT NULL DEFAULT 0,
     error TEXT
   );`,
];

export async function migrate(db: LocalDb) {
  await db.transaction(async (tx) => {
    await tx.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
    const row = await tx.first<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'");
    let version = row ? Number(row.value) : 0;
    while (version < MIGRATIONS.length) {
      for (const stmt of MIGRATIONS[version].split(';').map((s) => s.trim()).filter(Boolean)) await tx.run(stmt);
      version++;
      await tx.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)", [String(version)]);
    }
  });
}
