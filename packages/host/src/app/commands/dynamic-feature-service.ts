import type { PluginFeature } from '@szybko/shared';
import type { CommandCatalog } from '../../commands/command-catalog';
import type { RuntimeCoordinator } from '../../runtime/runtime-coordinator';
import type { SearchApplicationService } from '../search/search-application-service';

export class DynamicFeatureService {
    constructor(
        private commandCatalog: CommandCatalog,
        private coordinator: RuntimeCoordinator,
        private searchService: SearchApplicationService,
    ) {}

    async setFeature(
        senderWebContentsId: number,
        feature: PluginFeature,
    ): Promise<{ ok: boolean; error?: string }> {
        const pluginId = this.coordinator.pluginIdForWebContents(senderWebContentsId);
        if (!pluginId) return { ok: false, error: 'Plugin runtime not found for sender' };
        return this.commandCatalog.setFeature(pluginId, feature);
    }

    getFeatures(pluginId: string, codes?: string[]): PluginFeature[] {
        return this.commandCatalog.getDynamicFeatures(pluginId, codes);
    }

    removeFeature(pluginId: string, code: string): { ok: boolean; error?: string } {
        return this.commandCatalog.removeFeature(pluginId, code);
    }
}
