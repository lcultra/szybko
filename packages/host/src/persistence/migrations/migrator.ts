import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

interface Migration {
    name: string;
    sql: string;
}

export class Migrator {
    constructor(private sqlite: DatabaseSync) {
        sqlite.exec(`CREATE TABLE IF NOT EXISTS _migrations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            applied_at  INTEGER NOT NULL,
            checksum    TEXT NOT NULL
        )`);
    }

    migrate(migrations: Migration[]): void {
        const applied = new Set(
            (this.sqlite.prepare('SELECT name FROM _migrations').all() as any[])
                .map(r => r.name as string)
        );

        for (const m of migrations) {
            if (applied.has(m.name)) continue;

            const checksum = createHash('sha256').update(m.sql).digest('hex').slice(0, 16);

            this.sqlite.exec('BEGIN');
            try {
                this.sqlite.exec(m.sql);
                this.sqlite.prepare(
                    'INSERT INTO _migrations (name, applied_at, checksum) VALUES (?, ?, ?)'
                ).run(m.name, Date.now(), checksum);
                this.sqlite.exec('COMMIT');
            }
            catch (err) {
                this.sqlite.exec('ROLLBACK');
                throw err;
            }
        }
    }
}
