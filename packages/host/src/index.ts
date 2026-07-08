export { CommandIndexService } from './app/commands/command-index-service';
export { DynamicFeatureService } from './app/commands/dynamic-feature-service';
export { PluginLifecycleService } from './app/plugins/plugin-lifecycle-service';

export { PluginQueryService } from './app/plugins/plugin-query-service';
export type { RuntimeApplicationService as IRuntimeApplicationService } from './app/runtime/ports';
export { RuntimeApplicationService } from './app/runtime/runtime-application-service';
// ── Application Runtime ───────────────────────────────────────────────
export { RuntimeCoordinator } from './app/runtime/runtime-coordinator';
// ── Input Pipeline ────────────────────────────────────────────────────
export { collectFromSearch } from './app/search/input-context-collector';
export { LauncherItemService } from './app/search/launcher-item-service';
export { runPipeline } from './app/search/matcher-pipeline';
export { SearchApplicationService } from './app/search/search-application-service';

export { SearchService } from './app/search/search-service';
// ── Application Services ──────────────────────────────────────────────
export { StartupService } from './app/startup/startup-service';
// ── Bootstrap ──────────────────────────────────────────────────────────
export { createHostPlatform } from './bootstrap/create-host-platform';
export type { HostPlatform } from './bootstrap/host-platform';
export type { HostPlatformConfig } from './bootstrap/host-platform-config';

// ── Domain Types ──────────────────────────────────────────────────────
export type { PluginAvailability, PluginPackage, PluginSourceKind } from './domain/plugins/plugin';
export type { PluginInstallation } from './domain/plugins/plugin-installation';
export type { PluginManifest } from './domain/plugins/plugin-manifest';
export type { LoadState, MountState, RuntimeInfo, RuntimeSlot } from './domain/runtime/runtime';

export { CommandCatalog } from './infrastructure/commands/sqlite-command-catalog';
export { RuntimeHostAttacher } from './infrastructure/electron/runtime-host-attacher';
export { RuntimeManager } from './infrastructure/electron/runtime-manager';
export { RuntimeStatePublisher } from './infrastructure/electron/runtime-state-publisher';
export { RuntimeViewFactory } from './infrastructure/electron/runtime-view-factory';
export type { ActivationContext, PluginRuntime } from './infrastructure/electron/types';
export { PluginCatalog } from './infrastructure/filesystem/plugin-catalog';
export { PluginLoader } from './infrastructure/filesystem/plugin-package-loader';
export { PluginDiscovery } from './infrastructure/filesystem/plugin-sources/builtin-plugin-source';
export { InstallationSynchronizer } from './infrastructure/filesystem/plugin-sources/installation-synchronizer';
export { ElectronNativeCapabilityService } from './infrastructure/native/electron-native-capability-service';
export type { NativeCapabilityService } from './infrastructure/native/native-capability-service';
export { type AssetResolver, initAssetProtocol, registerAssetHandler } from './infrastructure/protocol/asset-protocol';
export { registerPluginAssetHandler } from './infrastructure/protocol/plugin-asset-handler';
// ── Infrastructure ────────────────────────────────────────────────────
export { createPlatformDatabase } from './infrastructure/sqlite/platform-database';

// ── Other ─────────────────────────────────────────────────────────────
export { createExecutor } from './ipc/execute-action';

export { registerDynamicFeatureIpcHandlers } from './ipc/handlers/dynamic-feature-ipc-handlers';
export { registerItemIpcHandlers } from './ipc/handlers/item-ipc-handlers';
export { registerPluginManagementIpcHandlers } from './ipc/handlers/plugin-management-ipc-handlers';
export { registerPluginRuntimeIpcHandlers } from './ipc/handlers/plugin-runtime-ipc-handlers';

// ── IPC Handler Registrars ────────────────────────────────────────────
export { registerSearchIpcHandlers } from './ipc/handlers/search-ipc-handlers';
export { registerIpcHandlers } from './ipc/register-handlers';
export { FloatingRuntimeHost } from './presentation/runtime-hosts/floating-runtime-host';
export { LauncherRuntimeHost } from './presentation/runtime-hosts/launcher-runtime-host';
export { RuntimeHostRegistry } from './presentation/runtime-hosts/runtime-host-registry';
export { ShortcutRegistry } from './presentation/window/shortcut-registry';

export { ThemeManager } from './presentation/window/theme-manager';
// ── Presentation ──────────────────────────────────────────────────────
export { WindowManager } from './presentation/window/window-manager';
