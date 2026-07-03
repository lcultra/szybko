import type { PlatformDrizzleDatabase } from '../platform-database';
import { eq } from 'drizzle-orm';
import { pluginInstallation } from '../schema';

export interface UpsertBuiltInArgs {
    pluginId: string;
    installPath: string;
    manifestHash: string;
    now: number;
}

export class PluginInstallationRepository {
    constructor(private db: PlatformDrizzleDatabase) {}

    upsertBuiltIn(args: UpsertBuiltInArgs): void {
        this.db.insert(pluginInstallation)
            .values({
                pluginId: args.pluginId,
                source: 'built-in',
                enabled: 1,
                installPath: args.installPath,
                manifestHash: args.manifestHash,
                createdAt: args.now,
                updatedAt: args.now,
            })
            .onConflictDoUpdate({
                target: pluginInstallation.pluginId,
                set: {
                    installPath: args.installPath,
                    manifestHash: args.manifestHash,
                    updatedAt: args.now,
                },
            })
            .run();
    }

    get(pluginId: string): { pluginId: string; manifestHash: string } | null {
        const rows = this.db.select({
            pluginId: pluginInstallation.pluginId,
            manifestHash: pluginInstallation.manifestHash,
        })
            .from(pluginInstallation)
            .where(eq(pluginInstallation.pluginId, pluginId))
            .all();

        return rows.length > 0 ? rows[0]! : null;
    }

    has(pluginId: string): boolean {
        const rows = this.db.select({ id: pluginInstallation.pluginId })
            .from(pluginInstallation)
            .where(eq(pluginInstallation.pluginId, pluginId))
            .all();
        return rows.length > 0;
    }

    isEnabled(pluginId: string): boolean {
        const rows = this.db.select({ enabled: pluginInstallation.enabled })
            .from(pluginInstallation)
            .where(eq(pluginInstallation.pluginId, pluginId))
            .all();
        return rows.length > 0 && rows[0]!.enabled === 1;
    }

    setEnabled(pluginId: string, enabled: boolean): void {
        this.db.update(pluginInstallation)
            .set({ enabled: enabled ? 1 : 0, updatedAt: Date.now() })
            .where(eq(pluginInstallation.pluginId, pluginId))
            .run();
    }

    listEnabled(): string[] {
        const rows = this.db.select({ pluginId: pluginInstallation.pluginId })
            .from(pluginInstallation)
            .where(eq(pluginInstallation.enabled, 1))
            .all();
        return rows.map(r => r.pluginId);
    }

    register(
        pluginId: string,
        source: 'built-in' | 'user-installed',
        path: string,
        now: number,
    ): void {
        this.db.insert(pluginInstallation)
            .values({
                pluginId,
                source,
                enabled: 1,
                installPath: path,
                manifestHash: '',
                createdAt: now,
                updatedAt: now,
            })
            .run();
    }
}
