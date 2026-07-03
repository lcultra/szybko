import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle, type NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import * as schema from './schema';

export type PlatformDrizzleDatabase = NodeSQLiteDatabase<typeof schema>;

export interface PlatformDatabase {
    open: () => void;
    close: () => void;
    drizzle: () => PlatformDrizzleDatabase;
    transaction: <T>(fn: (db: PlatformDrizzleDatabase) => T) => T;
}

function configure(sqlite: DatabaseSync): void {
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec('PRAGMA journal_mode = WAL');
    sqlite.exec('PRAGMA busy_timeout = 5000');
}

function createSchema(sqlite: DatabaseSync): void {
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS plugin_installation (
          plugin_id TEXT PRIMARY KEY CHECK (length(trim(plugin_id)) > 0),
          source TEXT NOT NULL CHECK (source IN ('built-in', 'local-dev', 'user-installed')),
          enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
          install_path TEXT NOT NULL CHECK (length(trim(install_path)) > 0),
          version TEXT,
          manifest_hash TEXT NOT NULL DEFAULT '',
          manifest_indexed_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_plugin_installation_enabled ON plugin_installation(enabled, source);

        CREATE TABLE IF NOT EXISTS manifest_feature_snapshot (
          plugin_id TEXT NOT NULL,
          code TEXT NOT NULL CHECK (length(trim(code)) > 0),
          feature_order INTEGER NOT NULL CHECK (feature_order >= 0),
          feature_json TEXT NOT NULL CHECK (json_valid(feature_json)),
          feature_hash TEXT NOT NULL,
          manifest_hash TEXT NOT NULL,
          indexed_at INTEGER NOT NULL,
          PRIMARY KEY (plugin_id, code),
          UNIQUE (plugin_id, feature_order),
          FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS feature_override (
          plugin_id TEXT NOT NULL,
          code TEXT NOT NULL CHECK (length(trim(code)) > 0),
          state TEXT NOT NULL CHECK (state IN ('active', 'removed')),
          feature_json TEXT,
          feature_hash TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (plugin_id, code),
          CHECK (
            (state = 'active' AND feature_json IS NOT NULL AND json_valid(feature_json) AND feature_hash IS NOT NULL)
            OR
            (state = 'removed' AND feature_json IS NULL AND feature_hash IS NULL)
          ),
          FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_feature_override_plugin_state ON feature_override(plugin_id, state);

        CREATE TABLE IF NOT EXISTS effective_feature (
          plugin_id TEXT NOT NULL,
          code TEXT NOT NULL CHECK (length(trim(code)) > 0),
          source TEXT NOT NULL CHECK (source IN ('manifest', 'dynamic')),
          feature_order INTEGER NOT NULL CHECK (feature_order >= 0),
          feature_json TEXT NOT NULL CHECK (json_valid(feature_json)),
          feature_hash TEXT NOT NULL,
          rebuilt_at INTEGER NOT NULL,
          PRIMARY KEY (plugin_id, code),
          UNIQUE (plugin_id, feature_order),
          FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_effective_feature_plugin_source ON effective_feature(plugin_id, source);

        CREATE TABLE IF NOT EXISTS command_trigger (
          plugin_id TEXT NOT NULL,
          feature_code TEXT NOT NULL CHECK (length(trim(feature_code)) > 0),
          cmd_key TEXT NOT NULL CHECK (length(trim(cmd_key)) > 0),
          trigger_index INTEGER NOT NULL CHECK (trigger_index >= 0),
          source TEXT NOT NULL CHECK (source IN ('feature_cmd', 'alias')),
          type TEXT NOT NULL CHECK (type IN ('text', 'regex', 'over', 'img', 'files', 'window')),
          label TEXT,
          matcher_json TEXT NOT NULL CHECK (json_valid(matcher_json)),
          normalized_key TEXT,
          alias_id INTEGER,
          target_cmd_key TEXT,
          score_base INTEGER NOT NULL DEFAULT 90,
          rebuilt_at INTEGER NOT NULL,
          PRIMARY KEY (plugin_id, feature_code, source, cmd_key),
          CHECK (
            (type = 'text' AND normalized_key IS NOT NULL AND length(normalized_key) > 0)
            OR
            (type <> 'text')
          ),
          CHECK (
            (source = 'feature_cmd' AND alias_id IS NULL AND target_cmd_key IS NULL)
            OR
            (source = 'alias' AND alias_id IS NOT NULL AND target_cmd_key IS NOT NULL)
          ),
          FOREIGN KEY (plugin_id, feature_code) REFERENCES effective_feature(plugin_id, code) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_command_trigger_text_lookup ON command_trigger(normalized_key, plugin_id, feature_code, source) WHERE type = 'text';
        CREATE INDEX IF NOT EXISTS idx_command_trigger_type ON command_trigger(type);
        CREATE INDEX IF NOT EXISTS idx_command_trigger_target_cmd ON command_trigger(plugin_id, feature_code, target_cmd_key) WHERE source = 'alias';

        CREATE TABLE IF NOT EXISTS command_projection_meta (
          plugin_id TEXT PRIMARY KEY,
          manifest_hash TEXT NOT NULL,
          override_fingerprint TEXT NOT NULL,
          index_version INTEGER NOT NULL,
          rebuilt_at INTEGER NOT NULL,
          FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
        );
    `);
}

function wrapTx<T>(db: PlatformDrizzleDatabase, fn: (db: PlatformDrizzleDatabase) => T): T {
    return (db.transaction as unknown as (cb: (tx: PlatformDrizzleDatabase) => T) => T)((tx) => fn(tx as PlatformDrizzleDatabase));
}

export function createPlatformDatabase(filePath: string): PlatformDatabase {
    mkdirSync(dirname(filePath), { recursive: true });
    const sqlite = new DatabaseSync(filePath);
    configure(sqlite);
    createSchema(sqlite);
    const db = drizzle({ client: sqlite, schema });
    return {
        open: () => undefined,
        close: () => sqlite.close(),
        drizzle: () => db,
        transaction: fn => wrapTx(db, fn),
    };
}

export function createInMemoryPlatformDatabase(): PlatformDatabase {
    const sqlite = new DatabaseSync(':memory:');
    configure(sqlite);
    createSchema(sqlite);
    const db = drizzle({ client: sqlite, schema });
    return {
        open: () => undefined,
        close: () => sqlite.close(),
        drizzle: () => db,
        transaction: fn => wrapTx(db, fn),
    };
}
