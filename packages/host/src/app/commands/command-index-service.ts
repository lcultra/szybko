import type { PluginManifest } from '@szybko/shared';
import { CommandCatalog } from '../../commands/command-catalog';
import type { PluginCatalog } from '../../plugins/plugin-catalog';

export class CommandIndexService {
    constructor(
        private commandCatalog: CommandCatalog,
        private pluginCatalog: PluginCatalog,
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
