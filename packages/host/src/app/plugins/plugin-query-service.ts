import type { PluginCatalog } from '../../plugins/plugin-catalog';

export class PluginQueryService {
  constructor(private pluginCatalog: PluginCatalog) {}

  listPlugins() {
    return this.pluginCatalog.getAll();
  }

  getPlugin(pluginId: string) {
    return this.pluginCatalog.get(pluginId);
  }
}
