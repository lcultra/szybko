// ── Bootstrap ──────────────────────────────────────────────────────────
export { createHostPlatform } from './bootstrap/create-host-platform';
export type { HostPlatform } from './bootstrap/host-platform';
export type { HostPlatformConfig } from './bootstrap/host-platform-config';

// ── Application Services ──────────────────────────────────────────────
export { StartupService } from './app/startup/startup-service';
export { PluginLifecycleService } from './app/plugins/plugin-lifecycle-service';
export { PluginQueryService } from './app/plugins/plugin-query-service';
export { CommandIndexService } from './app/commands/command-index-service';
export { DynamicFeatureService } from './app/commands/dynamic-feature-service';
export { SearchApplicationService } from './app/search/search-application-service';
export { LauncherItemService } from './app/search/launcher-item-service';
export { RuntimeApplicationService } from './app/runtime/runtime-application-service';
export type { RuntimeApplicationService as IRuntimeApplicationService } from './app/runtime/ports';

// ── IPC Handler Registrars ────────────────────────────────────────────
export { registerSearchIpcHandlers } from './ipc/handlers/search-ipc-handlers';
export { registerItemIpcHandlers } from './ipc/handlers/item-ipc-handlers';
export { registerPluginManagementIpcHandlers } from './ipc/handlers/plugin-management-ipc-handlers';
export { registerPluginRuntimeIpcHandlers } from './ipc/handlers/plugin-runtime-ipc-handlers';
export { registerDynamicFeatureIpcHandlers } from './ipc/handlers/dynamic-feature-ipc-handlers';

// ── Domain Types ──────────────────────────────────────────────────────
export type { PluginPackage, PluginSourceKind, PluginAvailability } from './domain/plugins/plugin';
export type { PluginInstallation } from './domain/plugins/plugin-installation';
export type { PluginManifest } from './domain/plugins/plugin-manifest';
export type { LoadState, MountState, RuntimeInfo, RuntimeSlot } from './domain/runtime/runtime';

// ── Infrastructure ────────────────────────────────────────────────────
export { createPlatformDatabase } from './infrastructure/sqlite/platform-database';
export { ElectronNativeCapabilityService } from './infrastructure/native/electron-native-capability-service';
export type { NativeCapabilityService } from './infrastructure/native/native-capability-service';
export { PluginDiscovery } from './infrastructure/filesystem/plugin-sources/builtin-plugin-source';
export { PluginLoader } from './infrastructure/filesystem/plugin-package-loader';
export { type AssetResolver, initAssetProtocol, registerAssetHandler } from './infrastructure/protocol/asset-protocol';

// ── Presentation ──────────────────────────────────────────────────────
export { WindowManager } from './presentation/window/window-manager';
export { ThemeManager } from './presentation/window/theme-manager';
export { ShortcutRegistry } from './presentation/window/shortcut-registry';
export { RuntimeHostRegistry } from './presentation/runtime-hosts/runtime-host-registry';
export { LauncherRuntimeHost } from './presentation/runtime-hosts/launcher-runtime-host';
export { FloatingRuntimeHost } from './presentation/runtime-hosts/floating-runtime-host';

// ── Legacy — origin locations (real implementations, not yet relocated) ──
export { CommandCatalog } from './commands/command-catalog';
export { PluginCatalog } from './plugins/plugin-catalog';
export { InstallationSynchronizer } from './plugins/installation-synchronizer';
export { registerPluginAssetHandler } from './plugins/plugin-asset-handler';
export { RuntimeCoordinator } from './runtime/runtime-coordinator';
export { RuntimeHostAttacher } from './runtime/runtime-host-attacher';
export { RuntimeManager } from './runtime/runtime-manager';
export { RuntimeStatePublisher } from './runtime/runtime-state-publisher';
export { RuntimeViewFactory } from './runtime/runtime-view-factory';
export type { ActivationContext, PluginRuntime } from './runtime/types';

// ── Legacy — input pipeline (needs future refactoring) ─────────────────
export { collectFromSearch } from './input/input-context-collector';
export { MatchSessionManager } from './input/match-session-manager';
export { runPipeline } from './input/matcher-pipeline';
export { SearchService } from './input/search-service';
export { createExecutor } from './ipc/execute-action';
export { registerIpcHandlers } from './ipc/register-handlers';
