# Host Architecture Baseline Design

- Date: 2026-07-08
- Status: Design draft
- Scope: `packages/host`, desktop main-process composition, and host-facing IPC wiring

## 1. Background

`@szybko/host` has grown from a small Electron host package into the main-process platform layer for plugins, command indexing, search, runtime hosting, windows, shortcuts, native capability execution, and persistence.

The current directory structure is grouped by broad concepts such as `plugins`, `commands`, `runtime`, `search`, `window`, `ipc`, and `persistence`. That grouping was useful as a first cleanup, but it is no longer strong enough for the next phase of product development.

The immediate product needs are user plugin registration and built-in plugin management, but the real architectural need is broader: host must become a clear platform kernel with explicit use cases, stable domain boundaries, dumb adapters, and a small desktop composition root.

This design intentionally allows bold refactoring. Historical layout and compatibility with current internal module names are not constraints. Runtime behavior should be preserved where it represents product behavior, but code organization and internal APIs should be redesigned.

## 2. Current Problems

### IPC Owns Business Flow

`packages/host/src/ipc/register-handlers.ts` currently registers IPC handlers and also manages search sessions, constructs providers, resolves launcher items, records usage, builds context menus, toggles plugin enabled state, uninstalls plugins, and deletes database rows.

This violates the boundary expected of IPC. IPC should adapt typed requests to application services. It should not know SQLite schema, repositories, provider composition, or plugin cleanup rules.

### Desktop Main Is Too Aware Of Host Internals

`apps/desktop/src/main/index.ts` currently creates `CommandCatalog`, `PluginCatalog`, `RuntimeManager`, `RuntimeCoordinator`, `ShortcutRegistry`, protocol handlers, plugin indexing, runtime startup, window creation, and shortcut action wiring directly.

That makes the desktop main entrypoint a de facto composition root and startup workflow. It should remain a thin Electron app lifecycle file that passes configuration into host.

### Plugin Lifecycle Is Not A First-Class Use Case

The current `PluginCatalog` is mostly a startup discovery cache. Installation sync, enabled state, manifest indexing, runtime creation, search refresh, and uninstall cleanup are spread across `PluginCatalog`, `InstallationSynchronizer`, `CommandCatalog`, `RuntimeManager`, desktop main, and IPC.

User plugin registration and built-in plugin management need one explicit lifecycle service that owns these workflows.

### Command Indexing Leaks Across Boundaries

`CommandCatalog` currently coordinates manifest snapshotting, dynamic feature override updates, projection rebuilds, alias expansion, icon validation, and repository creation. Some SQLite repositories also import command normalizers or projection types.

Command indexing needs to be separated into application services and pure domain functions. Repositories should persist data; they should not normalize command features or build projections.

### Runtime Mixes State, Electron Views, Host Attachment, And Publication

`RuntimeManager` manages runtime entries, creates `WebContentsView`, wires plugin-view shortcuts, tracks host attachment, publishes runtime state to the shell, sends plugin lifecycle messages, and delegates host behavior.

Runtime should be split into a runtime application service, a runtime registry, Electron view factory, host attachment, and event publication.

### Search Is Not An Application Boundary

Search session state and provider orchestration live inside IPC setup. Command search logic lives under `input/search-service.ts`, which is not the right conceptual boundary. Pinned/recent cleanup is partly embedded in plugin uninstall logic.

Search needs an application service that owns query, cancel, execute, refresh, item resolution, pinned items, and recent usage.

## 3. Goals

- Establish `@szybko/host` as a maintainable main-process platform kernel.
- Make host use cases visible through application services.
- Keep domain rules pure and independently testable.
- Make IPC, Electron, SQLite, filesystem, protocol, and native integrations adapter layers.
- Make plugin lifecycle a first-class platform capability.
- Let user plugin registration, built-in plugin management, command indexing, runtime lifecycle, search refresh, and shortcut wiring compose through clear services.
- Shrink `apps/desktop/src/main/index.ts` to Electron lifecycle plus host platform configuration.
- Add architecture rules that prevent the same boundary drift from returning.

## 4. Non-Goals

- This design does not define a plugin marketplace, plugin signing, remote update channels, or permission review.
- This design does not change renderer UI layout.
- This design does not require public compatibility for current internal `@szybko/host` exports.
- This design does not require a single massive implementation commit. The migration should be staged, but each stage should move toward the target architecture instead of preserving the old shape.

## 5. Target Architecture

`packages/host/src` should be reorganized around architecture role, not only broad feature topic:

```text
packages/host/src/
  bootstrap/
    create-host-platform.ts
    host-platform.ts
    host-platform-config.ts
    register-host-platform.ts

  app/
    startup/
      startup-service.ts
    plugins/
      plugin-lifecycle-service.ts
      plugin-query-service.ts
      plugin-source-sync-service.ts
      ports.ts
    commands/
      command-index-service.ts
      dynamic-feature-service.ts
      ports.ts
    search/
      search-application-service.ts
      launcher-item-service.ts
      ports.ts
    runtime/
      runtime-application-service.ts
      ports.ts
    shortcuts/
      shortcut-application-service.ts
      ports.ts
    window/
      window-application-service.ts
      ports.ts

  domain/
    plugins/
      plugin.ts
      plugin-source.ts
      plugin-installation.ts
      plugin-manifest.ts
      plugin-errors.ts
    commands/
      command-feature.ts
      command-trigger.ts
      command-projection.ts
      command-normalization.ts
      command-ranking.ts
    search/
      launcher-item.ts
      search-session.ts
      search-provider.ts
    runtime/
      runtime.ts
      runtime-slot.ts
      runtime-state.ts
    shortcuts/
      shortcut-definition.ts

  infrastructure/
    sqlite/
      platform-database.ts
      schema.ts
      migrations/
      repositories/
        sqlite-plugin-installation-repository.ts
        sqlite-manifest-feature-repository.ts
        sqlite-feature-override-repository.ts
        sqlite-command-projection-repository.ts
        sqlite-pinned-item-repository.ts
        sqlite-usage-event-repository.ts
    electron/
      menu-service.ts
      native-capability-service.ts
      runtime-view-factory.ts
      runtime-event-sink.ts
      app-paths.ts
    filesystem/
      plugin-package-loader.ts
      plugin-sources/
        builtin-plugin-source.ts
        user-plugin-source.ts
        local-dev-plugin-source.ts
    protocol/
      asset-protocol.ts
      plugin-asset-resolver.ts
    native/
      native-capability-service.ts

  ipc/
    register-ipc-handlers.ts
    handlers/
      search-ipc-handlers.ts
      item-ipc-handlers.ts
      plugin-management-ipc-handlers.ts
      plugin-runtime-ipc-handlers.ts
      dynamic-feature-ipc-handlers.ts
      window-ipc-handlers.ts

  presentation/
    window/
      window-manager.ts
      theme-manager.ts
    runtime-hosts/
      runtime-host.ts
      launcher-runtime-host.ts
      floating-runtime-host.ts
      runtime-host-registry.ts
      capabilities.ts

  shared/
    errors.ts
    result.ts
    ids.ts
```

This is the target shape. During migration, temporary compatibility files can exist only as forwarding modules and should be deleted before the baseline refactor is considered complete.

## 6. Dependency Rules

The dependency direction is:

```text
bootstrap -> app -> domain
bootstrap -> infrastructure
bootstrap -> presentation
bootstrap -> ipc

app -> domain
app -> app ports

infrastructure -> app ports
infrastructure -> domain

ipc -> app services
presentation -> domain/runtime-facing types
presentation -> Electron
```

Hard rules:

- `domain/**` must not import `electron`, `drizzle-orm`, SQLite modules, `node:fs`, `ipcMain`, or host infrastructure.
- `app/**` must not import `ipcMain`, IPC handler registration helpers, SQLite schema, or Electron concrete UI primitives unless hidden behind ports.
- `ipc/**` must not import repositories, SQLite schema, command normalizers, runtime managers, or Electron menus directly.
- `infrastructure/sqlite/**` is the only layer allowed to import SQLite schema.
- `bootstrap/**` is the only layer allowed to instantiate the full object graph.
- `apps/desktop/src/main/index.ts` must not directly create host domain managers such as `CommandCatalog`, `PluginCatalog`, or `RuntimeManager`.

## 7. Bootstrap And Composition

Desktop main should become:

```typescript
void app.whenReady().then(async () => {
  const platform = await createHostPlatform({
    userDataPath: app.getPath('userData'),
    builtInPluginsPath,
    preloadPath,
    pluginPreloadPath,
    isPackaged: app.isPackaged,
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
  });

  await platform.start();
});
```

`create-host-platform.ts` is the host composition root:

- Create database and repositories.
- Create filesystem plugin sources.
- Create protocol and asset resolvers.
- Create presentation services such as window manager and runtime hosts.
- Create application services.
- Register IPC handlers.
- Return `HostPlatform`.

`HostPlatform` exposes:

```typescript
interface HostPlatform {
  start(): Promise<void>;
  show(): void;
  dispose(): void;
}
```

Desktop main owns only Electron app lifecycle:

- `whenReady` calls `platform.start()`.
- `activate` calls `platform.show()`.
- `will-quit` calls `platform.dispose()`.
- `window-all-closed` decides whether to quit on non-macOS platforms.

## 8. Application Services

Application services express use cases. They are the center of the architecture.

### StartupService

Responsibilities:

- Run database migrations.
- Initialize protocol handlers.
- Discover built-in plugin sources.
- Sync plugin installations.
- Refresh plugin catalog read model.
- Rebuild command indexes for enabled plugins whose manifest changed.
- Initialize runtime policy.
- Register shortcuts.
- Create and load the main window.

Startup should not hand-code each low-level dependency. It should call other application services.

### PluginLifecycleService

Responsibilities:

- `registerUserPlugin(path)`
- `enablePlugin(pluginId)`
- `disablePlugin(pluginId)`
- `uninstallUserPlugin(pluginId)`
- `refreshPlugin(pluginId)`

It owns cross-module plugin lifecycle workflows:

- Installation records.
- Plugin package availability.
- Catalog refresh.
- Manifest indexing.
- Runtime create/destroy.
- Search refresh.
- Pinned/recent cleanup on uninstall.

Built-in plugin uninstall is forbidden. Built-in plugin enable/disable is allowed.

### PluginQueryService

Responsibilities:

- `listPlugins()`
- `getPlugin(pluginId)`
- Resolve plugin package metadata for runtime, search, asset, and management UI use.

This is read-only. It does not change installation state.

### PluginSourceSyncService

Responsibilities:

- Sync built-in plugin source.
- Sync local-dev plugin source.
- Refresh user-installed plugin availability.
- Detect manifest hash changes.
- Return sync results for lifecycle/index services to act on.

This service does not directly create runtimes or refresh search.

### CommandIndexService

Responsibilities:

- `indexPluginManifest(pluginPackage)`
- `removePluginIndex(pluginId)`
- `rebuildPluginProjection(pluginId)`
- Maintain manifest snapshots and command projections.

It is the application boundary around command indexing. Pure command projection builders stay in `domain/commands`.

### DynamicFeatureService

Responsibilities:

- Handle plugin runtime `setFeature`, `getFeatures`, and `removeFeature`.
- Resolve sender webContents to pluginId through runtime service.
- Validate dynamic features in the context of the owning plugin package.
- Write feature overrides.
- Rebuild projection.
- Refresh search.

IPC does not directly call `CommandCatalog.setFeature`.

### SearchApplicationService

Responsibilities:

- `query(request)`
- `cancel(queryId)`
- `executeItem(sessionId, queryId, itemId)`
- `refreshLastQuery()`

It owns current search session state, provider composition, response emission, execution validation, and refresh.

### LauncherItemService

Responsibilities:

- Resolve launcher items.
- Manage pinned items.
- Manage recent usage.
- Clean item records by plugin.
- Build item context menu models through a menu port.

Pinned and recent providers should call this service instead of duplicating plugin availability checks.

### RuntimeApplicationService

Responsibilities:

- `activatePlugin(pluginId, featureCode, enterPayload)`
- `moveToHost(runtimeId, targetHost)`
- `hideRuntime(runtimeId)`
- `destroyRuntime(runtimeId)`
- `pinRuntime(runtimeId, pin)`
- `showPluginMenu(runtimeId, variant)`
- `resolvePluginIdForWebContents(webContentsId)`

This wraps and then replaces the current `RuntimeCoordinator` responsibilities.

### ShortcutApplicationService

Responsibilities:

- Define shortcut actions.
- Register system, main-window, and plugin-view shortcut scopes.
- Bind shortcut actions to application services.

Desktop main should not wire shortcut business behavior directly.

### WindowApplicationService

Responsibilities:

- Show/hide/resize main window.
- Provide layout constants.
- Subscribe and publish theme changes.

Window IPC handlers should call this service.

## 9. Plugin Domain

Plugin domain owns plugin package facts and lifecycle rules:

- `PluginPackage`
- `PluginManifest`
- `PluginInstallation`
- `PluginSource`
- `PluginSourceKind = 'built-in' | 'user-installed' | 'local-dev'`
- `PluginAvailability = 'available' | 'missing' | 'invalid'`

Plugin domain rules:

- Built-in plugins can be enabled or disabled, but cannot be uninstalled by user action.
- User-installed plugins can be registered and uninstalled.
- Local-dev plugins are development sources and can be refreshed without being treated as marketplace installs.
- Missing packages do not automatically delete installation rows.
- Disabled state is user preference and must not be overwritten by source sync.

Plugin domain does not know search, runtime hosts, Electron, or SQLite.

## 10. Command Domain

Command domain owns:

- Feature normalization.
- Trigger normalization.
- Pinyin/direct/initial search key generation.
- Command projection building.
- Ranking rules.
- Dynamic feature merge semantics.

Key rules:

- Manifest features are static source of truth from plugin package.
- Dynamic feature overrides are user/platform state stored in the database.
- Effective features and command triggers are rebuildable projections.
- Projection rebuilds are transactional at the application service level.
- Repositories persist already-normalized data and do not call normalizers.

`CommandCatalog` as a monolithic facade should be split into:

- Pure domain builders/rankers.
- `CommandIndexService` for write-side indexing.
- Command search repository for read-side lookup.

## 11. Runtime Domain And Presentation

Runtime domain owns runtime state:

- `RuntimeInfo`
- `RuntimeSlot`
- `LoadState`
- `MountState`
- Host attachment identity.

Presentation owns Electron host implementation:

- `WindowManager`
- `RuntimeHost`
- `LauncherRuntimeHost`
- `FloatingRuntimeHost`
- `RuntimeHostRegistry`
- Host capabilities.

Infrastructure owns Electron runtime creation and event sinks:

- `ElectronRuntimeViewFactory`
- `RuntimeSlotPublisher`
- `RuntimeDetachPublisher`

The current `RuntimeManager` should be split into:

- Runtime registry for runtime entry storage.
- Electron view factory for `WebContentsView`.
- Host attacher for attach/detach tracking.
- Runtime event publisher for slot and detach events.
- Runtime application service for use cases.

## 12. IPC Design

IPC is an adapter layer.

Target files:

```text
ipc/
  register-ipc-handlers.ts
  handlers/
    search-ipc-handlers.ts
    item-ipc-handlers.ts
    plugin-management-ipc-handlers.ts
    plugin-runtime-ipc-handlers.ts
    dynamic-feature-ipc-handlers.ts
    window-ipc-handlers.ts
```

Handler rules:

- Use `@szybko/shared` IPC contract types.
- Call application services only.
- Return service results directly where possible.
- Convert thrown domain/application errors to typed IPC responses at the boundary.
- Do not create repositories.
- Do not import SQLite schema.
- Do not directly build Electron menus.
- Do not own session state.

Example:

```typescript
export function registerPluginManagementIpcHandlers(deps: {
  pluginLifecycle: PluginLifecycleService;
  pluginQuery: PluginQueryService;
}) {
  ipcMain.handle(IPC.PLUGIN_SET_ENABLED, (_event, req) =>
    deps.pluginLifecycle.setEnabled(req.pluginId, req.enabled)
  );
}
```

## 13. Persistence Design

SQLite remains the platform database.

Repository interfaces are defined near the application services or domain that consume them. SQLite implementations live under `infrastructure/sqlite/repositories`.

Rules:

- Only `infrastructure/sqlite/**` imports `schema.ts`.
- Application services own transaction boundaries for workflows that update multiple tables.
- Repositories map data; they do not decide lifecycle semantics.
- Repositories do not call command normalizers, plugin validators, or projection builders.
- Delete behavior is explicit in application services unless guaranteed by schema foreign keys and documented.

Expected repositories:

- `PluginInstallationRepository`
- `ManifestFeatureRepository`
- `FeatureOverrideRepository`
- `CommandProjectionRepository`
- `PinnedItemRepository`
- `UsageEventRepository`

The existing schema already points in the right direction with installation, manifest snapshot, feature override, effective feature, trigger, alias, pinned item, and usage event tables. The architectural change is where the workflow logic lives.

## 14. Infrastructure Adapters

### Electron

Electron adapters include:

- Native capability execution.
- Menu display.
- Runtime view creation.
- Runtime event publishing.
- App path resolution.

Application services depend on ports such as `MenuService`, `NativeCapabilityService`, and `RuntimeEventSink`, not Electron concrete modules.

### Filesystem

Filesystem adapters include:

- Plugin package loader.
- Built-in plugin source.
- User-installed plugin source.
- Local-dev plugin source.

Plugin source adapters return plugin package candidates and package availability. They do not update installation state directly.

### Protocol

Protocol adapters include:

- Asset protocol registration.
- Plugin asset resolver.

Asset resolution should depend on `PluginQueryService` or a plugin package read model, not a mutable catalog singleton with hidden installation behavior.

## 15. Core Flows

### Startup

```text
Desktop main
  -> createHostPlatform(config)
  -> platform.start()
  -> StartupService.start()
      1. migrate database
      2. initialize protocol handlers
      3. discover built-in plugin source
      4. sync plugin installations
      5. refresh plugin catalog read model
      6. rebuild stale command indexes for enabled plugins
      7. initialize runtime service
      8. register shortcuts
      9. create/load main window
```

### Register User Plugin

```text
PluginLifecycleService.registerUserPlugin(path)
  -> PluginPackageLoader.load(path)
  -> PluginValidator.validatePackage(package)
  -> PluginInstallationRepository.createUserInstalled(...)
  -> PluginQueryService.refresh()
  -> CommandIndexService.indexPluginManifest(plugin)
  -> RuntimeApplicationService.createIfEnabled(pluginId)
  -> SearchApplicationService.refreshLastQuery()
```

### Enable Plugin

```text
enablePlugin(pluginId)
  -> ensure installation exists
  -> ensure package is available
  -> set enabled = true
  -> index manifest if missing or stale
  -> create runtime if runtime policy requires it
  -> refresh search
```

### Disable Plugin

```text
disablePlugin(pluginId)
  -> set enabled = false
  -> detach/destroy active runtimes
  -> keep command projection as rebuildable cache
  -> search filters by enabled installation state
  -> refresh search
```

### Uninstall User Plugin

```text
uninstallUserPlugin(pluginId)
  -> reject if source is built-in
  -> destroy runtimes
  -> remove command index
  -> remove pinned/recent records for plugin item IDs
  -> delete installation row
  -> refresh plugin read model
  -> refresh search
```

### Dynamic Feature Update

```text
DynamicFeatureService.setFeature(senderWebContentsId, feature)
  -> RuntimeApplicationService.resolvePluginIdForWebContents(sender)
  -> DynamicFeatureValidator.validate(pluginPackage, feature)
  -> FeatureOverrideRepository.setActive(...)
  -> CommandIndexService.rebuildPluginProjection(pluginId)
  -> SearchApplicationService.refreshLastQuery()
```

### Search Query

```text
SearchApplicationService.query(request)
  -> collect InputContextSnapshot
  -> create SearchSession
  -> run PluginCommandProvider, PinnedItemProvider, RecentItemProvider
  -> emit SEARCH_RESPONSE snapshots
```

### Execute Launcher Item

```text
executeItem(sessionId, queryId, itemId)
  -> validate session
  -> resolve item
  -> record usage
  -> provider.execute(item)
  -> RuntimeApplicationService.activatePlugin(...)
```

## 16. Search And Launcher Items

Search should be split into:

- Command matching.
- Session orchestration.
- Launcher item resolution.
- Pinned/recent state.
- Runtime activation.

`SearchApplicationService` owns orchestration. `LauncherItemService` owns item resolution, pinned, recent, and cleanup.

Providers should not create raw repositories or raw DB-backed services internally. They receive the ports or app services they need.

Plugin item metadata should be resolved through a plugin read model. Disabled, missing, invalid, or uninstalled plugins should consistently resolve to unavailable results.

## 17. Shortcuts

`ShortcutRegistry` is already moving host in the right direction by centralizing shortcut definitions and scope registration.

The baseline refactor should move shortcut setup from desktop main into `ShortcutApplicationService`.

Shortcut scopes:

- `system`
- `main-window`
- `plugin-view`

Shortcut actions should call app services:

- `window:toggle` -> `WindowApplicationService.toggleMainWindow()`
- `plugin:detach` from main window -> `RuntimeApplicationService.detachLauncherRuntimeToFloating()`
- `plugin:detach` from plugin view -> runtime-scoped move action

## 18. Error Handling

Use typed application errors with stable codes:

```text
PLUGIN_NOT_FOUND
PLUGIN_PACKAGE_MISSING
PLUGIN_PACKAGE_INVALID
PLUGIN_SOURCE_FORBIDS_UNINSTALL
PLUGIN_ALREADY_INSTALLED
PLUGIN_NOT_INSTALLED
RUNTIME_NOT_FOUND
SEARCH_SESSION_EXPIRED
LAUNCHER_ITEM_NOT_FOUND
```

Application services can return `Result<T, AppError>` or throw typed errors caught by IPC adapters. The chosen representation should be consistent within host.

IPC handlers convert errors to IPC response shapes required by `@szybko/shared`.

## 19. Testing Strategy

### Domain Tests

Test pure rules:

- Plugin source rules.
- Feature normalization.
- Command projection building.
- Ranking.
- Dynamic override merge semantics.

### Application Service Tests

Test use cases with fake ports:

- Register user plugin.
- Enable built-in plugin.
- Disable plugin destroys runtime and refreshes search.
- Uninstall user plugin rejects built-in source.
- Dynamic feature update rebuilds projection.
- Startup indexes stale enabled plugins.
- Search execute records usage before activation.

### Infrastructure Tests

Test real adapters where useful:

- SQLite migrations.
- Repository CRUD and cascade behavior.
- Filesystem plugin loader validation.
- Asset resolver path containment.

### IPC Tests

Test handler delegation:

- Handler calls the expected application service.
- Handler maps success/error response correctly.
- Handler does not need real SQLite or Electron windows beyond IPC stubs.

## 20. Architecture Gates

Add lightweight import boundary checks after the file move stabilizes.

Required gates:

- `domain/**` cannot import `electron`, `drizzle-orm`, `node:fs`, `node:path`, `ipcMain`, or `infrastructure/**`.
- `ipc/**` cannot import `schema`, `repositories`, `presentation/window`, or `presentation/runtime-hosts`.
- `app/**` cannot import `ipcMain` or SQLite schema.
- `infrastructure/sqlite/**` is the only path that imports `schema.ts`.
- `apps/desktop/src/main/index.ts` cannot import `CommandCatalog`, `PluginCatalog`, `RuntimeManager`, `RuntimeCoordinator`, or repository classes.

These gates can be implemented with a small script using `rg` first, then replaced with a proper dependency linter if the project adopts one.

## 21. Migration Strategy

The migration should be staged. Each stage must compile and should reduce coupling.

### Stage 1: Establish Architecture Skeleton

- Add target directories.
- Add app service interfaces and ports.
- Add bootstrap `createHostPlatform()` shell.
- Keep old modules temporarily.

### Stage 2: Extract SearchApplicationService

- Move current search session state out of IPC.
- Move provider construction into app/bootstrap.
- Add `LauncherItemService`.
- Thin search/item IPC handlers.

### Stage 3: Extract PluginLifecycleService

- Move enable, disable, uninstall, register, index, cleanup, and refresh workflows out of IPC and desktop main.
- Define built-in uninstall rejection.
- Add user-installed registration path.

### Stage 4: Extract StartupService

- Move startup scan, sync, indexing, runtime startup, shortcut setup, and protocol setup out of desktop main.
- Introduce `HostPlatform.start()`.

### Stage 5: Split CommandCatalog

- Move pure command builders to `domain/commands`.
- Move indexing workflow to `CommandIndexService`.
- Move dynamic feature workflow to `DynamicFeatureService`.
- Remove `CommandCatalog -> PluginCatalog` dependency.
- Remove normalizer calls from repositories.

### Stage 6: Split RuntimeManager

- Extract runtime registry.
- Extract Electron runtime view factory.
- Extract host attachment.
- Replace `RuntimeStatePublisher` with event/slot publisher aligned with the plugin lifecycle API refactor.
- Move runtime use cases to `RuntimeApplicationService`.

### Stage 7: Move Infrastructure

- Move SQLite implementation under `infrastructure/sqlite`.
- Move filesystem plugin loader/source adapters.
- Move protocol and native adapters.
- Move window/runtime host classes under `presentation`.

### Stage 8: Delete Old Barrel Surface

- Update `packages/host/src/index.ts` to export platform/bootstrap entrypoints and explicitly approved types.
- Delete old forwarding files.
- Enable architecture gates.

## 22. Acceptance Criteria

The refactor is complete when:

- `apps/desktop/src/main/index.ts` creates and starts `HostPlatform` instead of manually wiring host internals.
- `ipc/**` does not import repositories or SQLite schema.
- `domain/**` has no Electron, SQLite, Drizzle, or filesystem imports.
- Plugin registration, enable, disable, built-in management, and uninstall all go through `PluginLifecycleService`.
- Startup scan/index/runtime/shortcut work goes through `StartupService`.
- Search query, refresh, execute, pinned, and recent logic go through `SearchApplicationService` and `LauncherItemService`.
- Dynamic feature IPC goes through `DynamicFeatureService`.
- Runtime activate/move/hide/destroy/pin/menu flows go through `RuntimeApplicationService`.
- `CommandCatalog` no longer exists as a god facade, or has been reduced to a thin compatibility wrapper with no cross-domain knowledge.
- `PluginCatalog` is a read model and does not own lifecycle mutation.
- Built-in plugins cannot be uninstalled through user action.
- Disabled plugins remain disabled across source sync.
- Enabling a plugin guarantees a valid command projection exists before search refresh.
- Uninstalling a user plugin destroys runtime, removes index records, removes launcher item history, deletes installation state, refreshes catalog, and refreshes search.
- Application services have focused tests for the primary use cases.

## 23. Resulting Design Standard

After this baseline, adding a feature should start by identifying the application service that owns the use case. If no service fits, the design should add or refine a service before adding adapter code.

The desired standard is:

- A module can be explained by its directory and class name.
- Business flows are visible as methods on application services.
- Technical adapters are replaceable.
- Pure rules are testable without Electron or SQLite.
- Desktop main and IPC remain thin.
- Plugin platform behavior is explicit and enforceable.
