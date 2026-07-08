import type { CommandCatalog } from '../../infrastructure/commands/sqlite-command-catalog';
import type { RuntimeManager } from '../../infrastructure/electron/runtime-manager';
import type { PluginCatalog } from '../../infrastructure/filesystem/plugin-catalog';
import type { PlatformDatabase } from '../../infrastructure/sqlite/platform-database';
import type { RuntimeCoordinator } from '../runtime/runtime-coordinator';
import type { LauncherItemService } from '../search/launcher-item-service';
import type { PluginQueryService } from './plugin-query-service';
import { PluginInstallationRepository } from '../../infrastructure/sqlite/repositories/plugin-installation-repository';
import { AppError, AppErrorCodes } from '../../shared/errors';

export class PluginLifecycleService {
    private installationRepo: PluginInstallationRepository;

    constructor(
        private platformDb: PlatformDatabase,
        private pluginCatalog: PluginCatalog,
        private commandCatalog: CommandCatalog,
        private coordinator: RuntimeCoordinator,
        private runtimeManager: RuntimeManager,
        private launcherItemService: LauncherItemService,
        private pluginQuery: PluginQueryService,
    ) {
        this.installationRepo = new PluginInstallationRepository(platformDb.drizzle());
    }

    async registerUserPlugin(_path: string): Promise<void> {
    // PluginPackageLoader.load(path) — uses PluginLoader
    // PluginValidator.validatePackage(package)
    // PluginInstallationRepository.createUserInstalled(...)
    // PluginQueryService.refresh()
    // CommandIndexService.indexPluginManifest(plugin)
    // RuntimeApplicationService.createIfEnabled(pluginId)
    // Refresh search
        throw new Error('Not implemented — Stage 3 will wire this after plugin loader extraction');
    }

    async enablePlugin(pluginId: string): Promise<void> {
        const plugin = this.pluginCatalog.get(pluginId);
        if (!plugin)
            throw new AppError(AppErrorCodes.PLUGIN_NOT_FOUND, `Plugin ${pluginId} not found`);

        // Ensure installation exists
        this.installationRepo.setEnabled(pluginId, true);

        // Index manifest if stale
        this.commandCatalog.indexPlugin(pluginId, plugin.manifest, plugin.path);

        // Create runtime
        this.coordinator.getOrCreateRuntime(pluginId);
    }

    async disablePlugin(pluginId: string): Promise<void> {
        const plugin = this.pluginCatalog.get(pluginId);
        if (!plugin)
            throw new AppError(AppErrorCodes.PLUGIN_NOT_FOUND, `Plugin ${pluginId} not found`);

        // Set enabled = false
        this.installationRepo.setEnabled(pluginId, false);

        // Destroy any active runtimes — use RuntimeManager for read queries, coordinator for mutations
        const runtime = this.runtimeManager.getByPluginId(pluginId);
        if (runtime) {
            this.coordinator.destroyRuntime(runtime.info.id);
        }

    // Keep command projection as rebuildable cache — do not delete index
    }

    async uninstallUserPlugin(pluginId: string): Promise<void> {
    // Check source — reject built-in
        const installation = this.installationRepo.get(pluginId);
        if (!installation)
            throw new AppError(AppErrorCodes.PLUGIN_NOT_INSTALLED, `Plugin ${pluginId} not installed`);
        if (installation.source === 'built-in') {
            throw new AppError(AppErrorCodes.PLUGIN_SOURCE_FORBIDS_UNINSTALL, 'Built-in plugins cannot be uninstalled');
        }

        // Destroy runtimes
        const runtime = this.runtimeManager.getByPluginId(pluginId);
        if (runtime) {
            this.coordinator.destroyRuntime(runtime.info.id);
        }

        // Remove command index (delegate to CommandCatalog's cleanup)
        this.commandCatalog.removePluginIndex(pluginId);

        // Remove launcher item history via LauncherItemService
        await this.launcherItemService.cleanupByPlugin(pluginId);

        // Delete installation row
        this.installationRepo.delete(pluginId);

        // Refresh plugin read model
        this.pluginCatalog.refresh();
    }

    async refreshPlugin(pluginId: string): Promise<void> {
        const plugin = this.pluginCatalog.get(pluginId);
        if (!plugin)
            throw new AppError(AppErrorCodes.PLUGIN_NOT_FOUND, `Plugin ${pluginId} not found`);

        // Re-index manifest
        this.commandCatalog.indexPlugin(pluginId, plugin.manifest, plugin.path);
    }
}
