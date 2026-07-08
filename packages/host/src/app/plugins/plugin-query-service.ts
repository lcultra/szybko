import type { PluginQuery } from '../../domain/plugins/plugin-query';

export class PluginQueryService {
    constructor(private pluginQuery: PluginQuery) {}

    listPlugins() {
        return this.pluginQuery.getAll();
    }

    getPlugin(pluginId: string) {
        return this.pluginQuery.get(pluginId);
    }
}
