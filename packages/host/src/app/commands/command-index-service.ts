import type { PluginManifest } from '@szybko/shared';
import type { PluginQuery } from '../../domain/plugins/plugin-query';
import { CommandCatalog } from '../../infrastructure/commands/sqlite-command-catalog';

export class CommandIndexService {
    constructor(
        private commandCatalog: CommandCatalog,
        private pluginCatalog: PluginQuery,
    ) {}

    async indexPluginManifest(pluginId: string, manifest: PluginManifest, pluginPath: string): Promise<void> {
        this.commandCatalog.indexPlugin(pluginId, manifest, pluginPath);
    }

    removePluginIndex(pluginId: string): void {
        this.commandCatalog.removePluginIndex(pluginId);
    }

    rebuildPluginProjection(pluginId: string): void {
        this.commandCatalog.rebuildPluginWithRepositories(pluginId);
    }
}
