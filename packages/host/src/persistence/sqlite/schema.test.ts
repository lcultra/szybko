import { describe, expect, it } from 'vitest';
import { createInMemoryPlatformDatabase } from './platform-database';
import { pluginInstallation } from './schema';

describe('platform sqlite schema', () => {
    it('creates plugin installation rows with foreign keys enabled', () => {
        const platformDb = createInMemoryPlatformDatabase();
        const db = platformDb.drizzle();
        const now = Date.now();

        db.insert(pluginInstallation).values({
            pluginId: 'demo',
            source: 'built-in',
            enabled: 1,
            installPath: '/tmp/demo',
            version: '1.0.0',
            manifestHash: 'hash',
            manifestIndexedAt: now,
            createdAt: now,
            updatedAt: now,
        }).run();

        const rows = db.select().from(pluginInstallation).all();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.pluginId).toBe('demo');
    });
});
