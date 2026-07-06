# Plugin Icon 与 Asset Protocol 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Szybko 引入强制插件图标规则（仅支持 .png/.jpg/.jpeg/.svg，不支持 emoji），建立通用的 `asset://` 自定义协议框架，并将所有现有 emoji 图标替换为真实图片。

**Architecture:** 两阶段：① 共享类型层收紧（`IconDescriptor` 移除 emoji、`PluginManifest`/`PluginFeature` 注释更新）；② 主进程层扩展（通用 `asset://` 协议、插件资产 handler、loader 校验、PluginProvider 消费图标、renderer UI 调整）。主进程用 `protocol.handle` 注册自定义协议，通过 `encodeURIComponent` + containment check 防路径逃逸。

**Tech Stack:** TypeScript, Electron, Vite, React

---

## 全局约束

- 插件图标仅支持 `.png` / `.jpg` / `.jpeg` / `.svg`
- `PluginManifest.logo` 必填且文件必须存在
- `PluginFeature.icon` 选填，不填使用 `manifest.logo` 兜底
- 所有图标字段禁用 emoji 和 data URL
- 路径逃逸防护：resolve + containment check (`relativePath` 不以 `..` 或 `/` 开头)
- URL 构建：逐段 `encodeURIComponent` 编码
- 不兼容历史：不保留 emoji 图标的渲染或兼容逻辑

---

### Task 1: 共享类型层 — 收紧 IconDescriptor 和注释

**Files:**
- Modify: `packages/shared/src/search/types.ts:12-15`
- Modify: `packages/shared/src/plugin/types.ts:10,38`

**Interfaces:**
- Produces: `IconDescriptor` 类型移除 `emoji` 分支；`PluginManifest.logo` 和 `PluginFeature.icon` 注释更新

- [ ] **Step 1: 移除 IconDescriptor 的 emoji 类型**

当前 `packages/shared/src/search/types.ts` 第 12-15 行：
```typescript
export type IconDescriptor
    = | { type: 'emoji'; value: string }
        | { type: 'url'; value: string }
        | { type: 'asset'; value: string };
```

改为：
```typescript
export type IconDescriptor
    = | { type: 'url'; value: string }
        | { type: 'asset'; value: string };
```

- [ ] **Step 2: 更新 PluginManifest.logo 注释**

当前 `packages/shared/src/plugin/types.ts` 第 9-10 行：
```typescript
/** 必填。插件 Logo 图标，相对路径的图片文件。 */
logo: string;
```

改为：
```typescript
/** 必填。插件图标，支持 .png / .jpg / .jpeg / .svg，相对于 plugin.json 的路径。 */
logo: string;
```

- [ ] **Step 3: 更新 PluginFeature.icon 注释**

当前第 37-38 行：
```typescript
/** 选填。功能图标文件（.png/.jpg/.svg）或动态 feature 中的 data URL。 */
icon?: string;
```

改为：
```typescript
/**
 * 选填。功能图标，支持 .png / .jpg / .jpeg / .svg，相对于 plugin.json 的路径。
 * 不配置时使用 manifest.logo 兜底。
 */
icon?: string;
```

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat(types): remove emoji from IconDescriptor, tighten icon field comments

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 通用 Asset Protocol 框架

**Files:**
- Create: `packages/host/src/protocol/asset-protocol.ts`
- Modify: `packages/host/src/index.ts`

**Interfaces:**
- Produces: `initAssetProtocol(): void` — 注册 Electron `protocol.handle('asset', ...)`
- Produces: `registerAssetHandler(hostname: string, resolver: AssetResolver): void` — 注册 hostname 级解析器
- Produces: 在 `@szybko/host` 的 barrel 中导出 `{ initAssetProtocol, registerAssetHandler }`

- [ ] **Step 1: 创建 `packages/host/src/protocol/asset-protocol.ts`**

```typescript
import { protocol } from 'electron';

export type AssetResolver = (pathname: string) => Promise<Response | null>;

const resolvers = new Map<string, AssetResolver>();

export function registerAssetHandler(hostname: string, resolver: AssetResolver): void {
    resolvers.set(hostname, resolver);
}

export function initAssetProtocol(): void {
    protocol.handle('asset', async (request) => {
        const url = new URL(request.url);
        const resolver = resolvers.get(url.hostname);
        if (!resolver) {
            return new Response(`Unknown asset source: ${url.hostname}`, { status: 404 });
        }
        const response = await resolver(url.pathname);
        if (!response) {
            return new Response('Not found', { status: 404 });
        }
        return response;
    });
}
```

- [ ] **Step 2: 导出到 barrel**

`packages/host/src/index.ts` 新增：
```typescript
export { initAssetProtocol, registerAssetHandler, type AssetResolver } from './protocol/asset-protocol';
```

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat(protocol): add generic asset:// protocol framework with registerAssetHandler

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 插件资产处理器

**Files:**
- Create: `packages/host/src/plugins/plugin-asset-handler.ts`
- Modify: `packages/host/src/index.ts`

**Interfaces:**
- Consumes: `PluginCatalog` (from `./plugin-catalog`), `registerAssetHandler` (from Task 2)
- Produces: `registerPluginAssetHandler(catalog: PluginCatalog): void`

- [ ] **Step 1: 创建 `packages/host/src/plugins/plugin-asset-handler.ts`**

```typescript
import type { PluginCatalog } from './plugin-catalog';
import { registerAssetHandler } from '../protocol/asset-protocol';
import { readFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';

const MIME_MAP: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
};

function isContainedIn(base: string, target: string): boolean {
    const relativePath = relative(base, target);
    return !relativePath.startsWith('..') && relativePath !== '';
}

export function registerPluginAssetHandler(catalog: PluginCatalog): void {
    registerAssetHandler('plugin', async (pathname: string) => {
        // pathname = "/<pluginId>/<encoded-relative-path>"
        const [, pluginId, ...rest] = pathname.split('/').filter(Boolean);
        if (!pluginId || rest.length === 0) {
            return null;
        }

        const plugin = catalog.get(decodeURIComponent(pluginId));
        if (!plugin) {
            return null;
        }

        // 还原路径段（encodeURIComponent 的逆操作）
        const decodedFileName = rest.map(decodeURIComponent).join('/');
        const ext = extname(decodedFileName).toLowerCase();

        // 校验 .jpeg → .jpg 归一化
        const normalizedExt = ext === '.jpeg' ? '.jpg' : ext;
        if (!(normalizedExt in MIME_MAP)) {
            return null;
        }

        const assetPath = resolve(plugin.path, decodedFileName);
        if (!isContainedIn(plugin.path, assetPath)) {
            return new Response('Forbidden', { status: 403 });
        }

        try {
            const data = await readFile(assetPath);
            return new Response(data, {
                status: 200,
                headers: { 'Content-Type': MIME_MAP[normalizedExt] },
            });
        } catch {
            return null;
        }
    });
}
```

- [ ] **Step 2: 导出到 barrel**

`packages/host/src/index.ts` 新增：
```typescript
export { registerPluginAssetHandler } from './plugins/plugin-asset-handler';
```

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat(plugins): add plugin asset handler with path escape containment

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: PluginLoader 图标校验

**Files:**
- Modify: `packages/host/src/plugins/plugin-loader.ts`

**Interfaces:**
- Consumes: `PluginManifest` (from `@szybko/shared`)
- Produces: `PluginLoader.loadOne()` 返回 `null` 时增加图标校验失败场景

- [ ] **Step 1: 新增校验逻辑**

当前 `loadOne()` 仅在 `!manifest.id` 时返回 `null`。在 `manifest.id` 校验后新增图标校验：

```typescript
import { extname, resolve, relative } from 'node:path';
import { existsSync } from 'node:fs';

const ALLOWED_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.svg'];

function validateIconField(filePath: string, fieldName: string, pluginDir: string): string | null {
    const ext = extname(filePath).toLowerCase();
    if (!ALLOWED_IMAGE_EXTS.includes(ext)) {
        return `'${fieldName}' 必须是 .png / .jpg / .jpeg / .svg 格式，实际: ${ext}`;
    }
    // 路径逃逸检查
    const resolved = resolve(pluginDir, filePath);
    const rel = relative(pluginDir, resolved);
    if (rel.startsWith('..') || rel === '') {
        return `'${fieldName}' 路径 ${filePath} 逃逸了插件目录`;
    }
    // 文件存在检查
    if (!existsSync(resolved)) {
        return `'${fieldName}' 文件不存在: ${resolved}`;
    }
    return null;
}
```

在 `loadOne()` 中的 `manifest.id` 校验之后，返回 `{ id, manifest, path }` 之前：

```typescript
if (!manifest.logo) {
    console.error(`[plugin-loader] Missing 'logo' in ${manifestPath}`);
    return null;
}
const logoErr = validateIconField(manifest.logo, 'logo', pluginPath);
if (logoErr) {
    console.error(`[plugin-loader] ${manifestPath}: ${logoErr}`);
    return null;
}
for (const feature of manifest.features) {
    if (feature.icon) {
        const iconErr = validateIconField(feature.icon, `features[${feature.code}].icon`, pluginPath);
        if (iconErr) {
            console.error(`[plugin-loader] ${manifestPath}: ${iconErr}`);
            return null;
        }
    }
}
```

- [ ] **Step 2: 提交**

```bash
git add -A
git commit -m "feat(plugins): validate plugin icon format, existence, and path containment in PluginLoader

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 动态 feature 图标校验

**Files:**
- Modify: `packages/host/src/commands/command-catalog.ts`

**Interfaces:**
- Consumes: `PluginFeature` (from `@szybko/shared`)
- Produces: `CommandCatalog.setPluginCatalog(catalog: PluginCatalog): void` — setter
- Produces: `CommandCatalog.setFeature()` 在图标格式不对时返回 `{ ok: false, error }`

> **设计说明：** 使用 setter 而非构造函数注入，使 Task 5 能独立编译（catalog setter 是可选的，未设置时跳过图标校验），后续 Task 9 负责在初始化时调用 setter 连接。

- [ ] **Step 1: 新增 setPluginCatalog 和验证方法**

在 `CommandCatalog` 类中新增字段和方法：

```typescript
import { extname, relative, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const ALLOWED_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.svg'];

export class CommandCatalog {
    constructor(private platformDb: PlatformDatabase) {}

    private pluginCatalog: import('../plugins/plugin-catalog').PluginCatalog | null = null;

    setPluginCatalog(catalog: import('../plugins/plugin-catalog').PluginCatalog): void {
        this.pluginCatalog = catalog;
    }

    private validateFeatureIcon(pluginId: string, iconPath: string): string | null {
        const plugin = this.pluginCatalog?.get(pluginId);
        if (!plugin) {
            return 'Plugin not found or catalog not initialized';
        }

        const ext = extname(iconPath).toLowerCase();
        const normalizedExt = ext === '.jpeg' ? '.jpg' : ext;
        if (!ALLOWED_IMAGE_EXTS.includes(normalizedExt)) {
            return `icon 必须是 .png / .jpg / .jpeg / .svg 格式，实际: ${ext}`;
        }

        const resolved = resolve(plugin.path, iconPath);
        const rel = relative(plugin.path, resolved);
        if (rel.startsWith('..') || rel === '') {
            return 'icon 路径逃逸了插件目录';
        }

        if (!existsSync(resolved)) {
            return `icon 文件不存在: ${resolved}`;
        }

        return null;
    }

    // ... 其余方法保持不变
```

- [ ] **Step 2: 在 setFeature 开头调用图标校验**

```typescript
setFeature(pluginId: string, feature: PluginFeature): { ok: boolean; error?: string } {
    if (feature.icon) {
        const err = this.validateFeatureIcon(pluginId, feature.icon);
        if (err) {
            return { ok: false, error };
        }
    }

    try {
        this.platformDb.transaction((tx) => {
            const repos = createRepositories(tx);
            repos.featureOverrides.setActive(pluginId, feature, Date.now());
            this.rebuildPluginWithRepositories(pluginId, repos, Date.now(), tx);
        });
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: (e as Error).message };
    }
}
```

注意：上述代码中的 `error` 在 return 中应该用 `err`，正确的写法：

```typescript
setFeature(pluginId: string, feature: PluginFeature): { ok: boolean; error?: string } {
    if (feature.icon) {
        const validationError = this.validateFeatureIcon(pluginId, feature.icon);
        if (validationError) {
            return { ok: false, error: validationError };
        }
    }
    // ... 原有逻辑
}
```

- [ ] **Step 3: 编译检查**

```bash
pnpm --filter @szybko/shared build && pnpm --filter @szybko/host build
```

预期：无类型错误。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat(commands): add dynamic feature icon validation via setPluginCatalog setter

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: PluginProvider 图标消费

**Files:**
- Modify: `packages/host/src/search/plugin-provider.ts`
- Modify: `packages/host/src/ipc/register-handlers.ts`

**Interfaces:**
- Consumes: `PluginCatalog`（新增依赖）, `IconDescriptor`（从 Task 1）, `PluginManifest`/`PluginFeature`（从 `@szybko/shared`）
- Produces: `LauncherItem.icon` 不再硬编码 emoji，改为基于 manifest 的 `asset://` URL

- [ ] **Step 1: PluginProvider 新增 PluginCatalog 依赖**

构造函数签名变化：
```typescript
import type { PluginCatalog } from '../plugins/plugin-catalog';

export class PluginProvider implements SearchProvider {
    constructor(
        db: PlatformDrizzleDatabase,
        private coordinator: RuntimeCoordinator,
        private catalog: PluginCatalog,
        sessionManager?: MatchSessionManager,
    ) { ... }
}
```

- [ ] **Step 2: search() 方法中的图标替换**

当前 `search()` 第 59 行：`icon: { type: 'emoji', value: '🧩' }`

在 `matches.map()` 循环中，获取 plugin 后构建图标：

```typescript
const items: LauncherItem[] = matches.map((m) => {
    const itemId = `plugin://${m.pluginId}/${m.featureCode}/${m.cmdKey}` as LauncherItemId;
    this.itemMatchMap.set(itemId, m.matchId);

    // 解析图标
    const plugin = this.catalog.get(m.pluginId);
    let icon: IconDescriptor | undefined;
    if (plugin) {
        const feature = plugin.manifest.features.find(f => f.code === m.featureCode);
        const iconPath = feature?.icon ?? plugin.manifest.logo;
        const encoded = iconPath.split('/').map(encodeURIComponent).join('/');
        icon = { type: 'url', value: `asset://plugin/${encodeURIComponent(plugin.id)}/${encoded}` };
    }

    return {
        id: itemId,
        ownerProvider: 'plugin',
        title: m.label || m.featureCode,
        subtitle: `打开 ${m.pluginId}`,
        icon,
        score: m.score,
        capabilities: { pin: true, reveal: false, dragSort: true, contextMenu: true },
        state: { pinned: false },
        matchLevel: m.score > 95 ? 3 : m.score > 50 ? 2 : 1,
    };
});
```

添加 import：
```typescript
import type { IconDescriptor } from '@szybko/shared';
```

- [ ] **Step 3: resolve() 方法中的图标替换**

当前 `resolve()` 第 89-94 行也是 `{ type: 'emoji', value: '🧩' }`，同样替换：

```typescript
return {
    id: itemId,
    ownerProvider: 'plugin',
    title: trigger.label || cmdKey,
    subtitle: `打开 ${pluginId}`,
    icon: (() => {
        const plugin = this.catalog.get(pluginId);
        if (!plugin) return undefined;
        const feature = plugin.manifest.features.find(f => f.code === featureCode);
        const iconPath = feature?.icon ?? plugin.manifest.logo;
        const encoded = iconPath.split('/').map(encodeURIComponent).join('/');
        return { type: 'url', value: `asset://plugin/${encodeURIComponent(pluginId)}/${encoded}` };
    })(),
    score: trigger.scoreBase,
    capabilities: { pin: true, reveal: false, dragSort: true, contextMenu: true },
    state: { pinned: false },
};
```

- [ ] **Step 4: registerIpcHandlers 传入 catalog**

`packages/host/src/ipc/register-handlers.ts` 中 `registerIpcHandlers` 函数签名新增参数：

```typescript
export function registerIpcHandlers(
    windowManager: WindowManager,
    coordinator: RuntimeCoordinator,
    commandCatalog: CommandCatalog,
    platformDb?: PlatformDatabase,
    pluginCatalog?: PluginCatalog,  // 新增
) {
```

然后 PluginProvider 实例化时传入：
```typescript
const pluginProvider = platformDb && pluginCatalog
    ? new PluginProvider(platformDb.drizzle(), coordinator, pluginCatalog, sessionManager)
    : null;
```

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(search): replace hardcoded emoji with asset:// icons in PluginProvider

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: resolve-fallback 清理 emoji

**Files:**
- Modify: `packages/host/src/search/resolve-fallback.ts`

- [ ] **Step 1: 移除 plugin/app/file/url 的 emoji icon**

`resolve-fallback.ts` 中有四处 `icon: { type: 'emoji', value: '🧩' }`（第 17 行）、`⚡`（第 30 行）、`📄`（第 45 行）、`🔗`（第 57 行），全部移除 `icon` 字段。

最终每个返回值变成：
```typescript
// plugin fallback
return {
    id: itemId,
    ownerProvider: 'plugin',
    title: cmdKey,
    subtitle: pluginId,
    score: 0,
    capabilities: { pin: true, reveal: false, dragSort: true, contextMenu: true },
    state: { pinned: true },
};

// app fallback
return {
    id: itemId,
    ownerProvider: 'app',
    title: bundleId,
    score: 0,
    capabilities: { pin: true, reveal: true, dragSort: false, contextMenu: true },
    state: { pinned: true },
};

// file fallback
return {
    id: itemId,
    ownerProvider: 'file',
    title: name,
    subtitle: path,
    score: 0,
    capabilities: { pin: true, reveal: true, dragSort: false, contextMenu: true },
    state: { pinned: true },
};

// url fallback
return {
    id: itemId,
    ownerProvider: 'url',
    title: itemId.replace('url://', ''),
    score: 0,
    capabilities: { pin: true, reveal: false, dragSort: false, contextMenu: true },
    state: { pinned: true },
};
```

- [ ] **Step 2: 编译检查**

```bash
pnpm --filter @szybko/shared build && pnpm --filter @szybko/host build
```

预期：无类型错误。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat(search): remove hardcoded emoji icons from resolve-fallback

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Renderer — ResultIcon emoji 移除

**Files:**
- Modify: `apps/desktop/src/renderer/pages/shell/ResultIcon.tsx`

- [ ] **Step 1: 删除 emoji 渲染分支**

当前 `ResultIcon` 第 20-22 行：
```tsx
if (icon.type === 'emoji') {
    return <span className="grid size-10 place-items-center overflow-hidden font-semibold text-sm text-text-muted">{icon.value}</span>;
}
```

删除这一整个 `if (icon.type === 'emoji')` 分支。剩余逻辑已经处理了 `url` 和 `asset` 类型 + `failed` fallback + `!icon` fallback。

- [ ] **Step 2: 编译检查**

```bash
pnpm --filter @szybko/shared build && pnpm --filter @szybko/host build && cd apps/desktop && npx tsc --noEmit
```

预期：无类型错误。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat(renderer): remove emoji rendering branch from ResultIcon

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Electron 主进程协议注册和初始化

**Files:**
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: 添加 scheme privilege 注册（app ready 前）**

在 `apps/desktop/src/main/index.ts` 顶部，`import` 之后、`const windowManager = new WindowManager()` 之前：

```typescript
import { app, protocol } from 'electron';
import { initAssetProtocol, registerPluginAssetHandler, PluginCatalog, createPlatformDatabase } from '@szybko/host';

// 必须在 app ready 前
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'asset',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
        },
    },
]);
```

- [ ] **Step 2: 在 ready 后调用 initAssetProtocol + registerPluginAssetHandler**

现有 `app.whenReady().then(async () => { ... })` 中，在 `pluginManager.init()` 之后添加：

```typescript
void app.whenReady().then(async () => {
    const preloadPath = join(__dirname, '../preload/host.js');
    const pluginPreloadPath = join(__dirname, '../preload/plugin.js');

    const hostRegistry = windowManager.initHostRegistry(pluginPreloadPath);

    const platformDb = createPlatformDatabase(join(app.getPath('userData'), 'szybko-platform.db'));
    const commandCatalog = CommandCatalog.createForDatabase(platformDb);

    const pluginsDir = app.isPackaged
        ? join(process.resourcesPath, 'plugins', 'built-in')
        : join(__dirname, '..', '..', '..', '..', 'plugins', 'built-in');

    const pluginManager = new PluginCatalog(platformDb, pluginsDir);
    await pluginManager.init();

    // ---------- 新增：Asset 协议初始化 ----------
    initAssetProtocol();
    registerPluginAssetHandler(pluginManager);
    // ------------------------------------------

    for (const plugin of pluginManager.getEnabled()) {
        commandCatalog.indexPlugin(plugin.id, plugin.manifest, plugin.path);
    }

    // ...
});
```

- [ ] **Step 3: 更新 registerIpcHandlers 调用传入 pluginManager**

现有第 65 行：
```typescript
registerIpcHandlers(windowManager, coordinator, commandCatalog, platformDb);
```

改为：
```typescript
registerIpcHandlers(windowManager, coordinator, commandCatalog, platformDb, pluginManager);
```

- [ ] **Step 4: 连接动态 feature 图标校验**

在 `new CommandCatalog.createForDatabase(platformDb)` 之后、使用之前，连接 catalog：

```typescript
const commandCatalog = CommandCatalog.createForDatabase(platformDb);
commandCatalog.setPluginCatalog(pluginManager);  // 启用动态 feature 图标校验
```

- [ ] **Step 5: 编译检查**

```bash
pnpm --filter @szybko/shared build && pnpm --filter @szybko/host build && cd apps/desktop && npx tsc --noEmit
```

预期：无类型错误。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat(electron): register asset:// scheme and wire up protocol handlers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: 内置插件 SVG 图标和构建

**Files:**
- Create: `plugins/built-in/launcher/icon.svg`
- Create: `plugins/built-in/preferences/icon.svg`
- Modify: `plugins/built-in/launcher/plugin.json`
- Modify: `plugins/built-in/launcher/package.json`
- Modify: `plugins/built-in/preferences/plugin.json`
- Modify: `plugins/built-in/preferences/package.json`

- [ ] **Step 1: 创建 launcher 图标**

`plugins/built-in/launcher/icon.svg` — 火箭/启动的简单图标：
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16"/><path d="M12 4v12"/><path d="M8 8l4-4 4 4"/><path d="M6 16l-2 4 4-2"/><path d="M18 16l2 4-4-2"/></svg>
```

- [ ] **Step 2: 创建 preferences 图标**

`plugins/built-in/preferences/icon.svg` — 齿轮/设置简单图标：
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/></svg>
```

- [ ] **Step 3: 更新 launcher/plugin.json**

新增 `"logo": "icon.svg"` 并移除所有 feature 的 `icon` 字段：
```json
{
    "id": "launcher",
    "main": "index.html",
    "logo": "icon.svg",
    "preload": "preload.js",
    "pluginSetting": { "single": true },
    "features": [
        { "code": "test", "explain": "测试复制", "cmds": ["测试", "test"] },
        { "code": "lock", "explain": "锁定屏幕", "cmds": ["锁屏", "lock"] },
        { "code": "sleep", "explain": "休眠", "cmds": ["休眠", "sleep"] },
        { "code": "restart", "explain": "重新启动", "cmds": ["重启", "restart", "重新启动"] },
        { "code": "shutdown", "explain": "关机", "cmds": ["关机", "shutdown"] }
    ]
}
```

- [ ] **Step 4: 更新 launcher/package.json**

当前 build 脚本：
```json
"build": "vite build --config vite.preload.config.ts && cp index.html plugin.json dist/"
```

改为：
```json
"build": "vite build --config vite.preload.config.ts && cp index.html plugin.json icon.svg dist/"
```

- [ ] **Step 5: 更新 preferences/plugin.json**

新增 `"logo": "icon.svg"` 并移除 feature 的 `icon` 字段：
```json
{
    "id": "preferences",
    "main": "index.html",
    "logo": "icon.svg",
    "preload": "preload.js",
    "pluginSetting": { "single": true, "height": 520 },
    "development": {
        "main": "http://localhost:5177/"
    },
    "features": [
        { "code": "prefs", "explain": "首选项", "cmds": ["设置", "preferences", "prefs"] }
    ]
}
```

- [ ] **Step 6: 更新 preferences/package.json**

当前 build 脚本：
```json
"build": "vite build --config vite.preload.config.ts && vite build && cp plugin.json dist/"
```

改为：
```json
"build": "vite build --config vite.preload.config.ts && vite build && cp plugin.json icon.svg dist/"
```

- [ ] **Step 7: 构建验证**

```bash
cd plugins/built-in/launcher && pnpm build && ls dist/icon.svg
cd ../../preferences && pnpm build && ls dist/icon.svg
```

预期：两个插件的 `dist/` 目录均存在 `icon.svg` 文件。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat(plugins): add SVG icons to built-in plugins and update plugin.json/build scripts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
