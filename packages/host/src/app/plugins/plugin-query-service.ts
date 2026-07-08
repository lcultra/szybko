import type { PluginCatalog } from '../../infrastructure/filesystem/plugin-catalog';

export class PluginQueryService {
  constructor(private pluginCatalog: PluginCatalog) {}

  listPlugins() {
    return this.pluginCatalog.getAll();
  }

  getPlugin(pluginId: string) {
    return this.pluginCatalog.get(pluginId);
  }
}
