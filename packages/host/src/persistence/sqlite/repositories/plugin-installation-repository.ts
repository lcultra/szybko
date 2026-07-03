import { eq } from 'drizzle-orm';
import type { PlatformDrizzleDatabase } from '../platform-database';
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
}
