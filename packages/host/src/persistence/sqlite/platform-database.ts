import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite';
import * as schema from './schema';
import { Migrator } from '../migrations/migrator';
import { name as migrationName, sql as migrationSql } from '../migrations/migration-001';

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


function wrapTx<T>(db: PlatformDrizzleDatabase, fn: (db: PlatformDrizzleDatabase) => T): T {
    return (db.transaction as unknown as (cb: (tx: PlatformDrizzleDatabase) => T) => T)(tx => fn(tx as PlatformDrizzleDatabase));
}

export function createPlatformDatabase(filePath: string): PlatformDatabase {
    mkdirSync(dirname(filePath), { recursive: true });
    const sqlite = new DatabaseSync(filePath);
    configure(sqlite);
    new Migrator(sqlite).migrate([{ name: migrationName, sql: migrationSql }]);
    const db = drizzle({ client: sqlite, schema });
    return {
        open: () => undefined,
        close: () => sqlite.close(),
        drizzle: () => db,
        transaction: fn => wrapTx(db, fn),
    };
}
