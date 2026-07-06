# Plugin Icon 与 Asset Protocol 设计

## 概述

为 Szybko 插件系统引入强制图标规则：每个插件必须在 `plugin.json` 配置图标（.png/.jpg/.svg），不支持 emoji；feature 可单独配置图标，不配置时以插件图标兜底。同时建立通用的 `asset://` 自定义协议框架。

## 动机

- 搜索结果中所有插件统一显示 🧩，无法区分插件身份，体验粗糙
- `PluginManifest.logo` 和 `PluginFeature.icon` 定义存在但从未被消费
- 缺少图标格式校验，插件作者可以填入任意字符串甚至 emoji
- 没有统一的资产加载通道，导致 `file://` 依赖 Electron 安全策略

## 设计概览

| 层次 | 组件 | 职责 |
|---|---|---|
| 类型 | `PluginManifest.logo` | 必填，.png/.jpg/.svg 相对路径 |
| 类型 | `PluginFeature.icon` | 选填，同上格式，不填用 logo |
| 类型 | `IconDescriptor` | 移除 `emoji` 分支，仅保留 `url` / `asset` |
| 校验 | `PluginLoader` | 启动时校验格式，不通过则跳过该插件 |
| 协议 | `asset://` 自定义协议 | 通用资源加载框架，插件用 `plugin` hostname |
| 消费 | `PluginProvider` | 从 manifest 解析图标，生成 `asset://` URL |
| 渲染 | `ResultIcon` | `<img>` 加载 `asset://` URL，失败 fallback 首字符 |

## 类型定义

### PluginManifest

```typescript
export interface PluginManifest {
    id: string;
    main: string;
    /** 必填。插件图标，支持 .png / .jpg / .svg，相对于 plugin.json 的路径。 */
    logo: string;
    preload?: string;
    pluginSetting?: { single?: boolean; height?: number };
    development?: { main?: string };
    features: PluginFeature[];
}
```

### PluginFeature

```typescript
export interface PluginFeature {
    code: string;
    explain?: string;
    /**
     * 选填。功能图标，支持 .png / .jpg / .svg，相对于 plugin.json 的路径。
     * 不配置时使用 manifest.logo 兜底。
     */
    icon?: string;
    platform?: string | string[];
    cmds: (string | MatchCommand)[];
    mainPush?: boolean;
    mainHide?: boolean;
}
```

### IconDescriptor（移除 emoji）

```typescript
export type IconDescriptor
    = | { type: 'url'; value: string }
      | { type: 'asset'; value: string };
```

说明：`asset` 类型保留供未来使用（如 base64 asset），当前所有插件资源使用 `url` 类型指向 `asset://` 协议。

## Asset Protocol 框架

### 协议注册器

`packages/host/src/protocol/asset-protocol.ts`

```typescript
type AssetResolver = (pathname: string) => Promise<Response | null>;

// hostname -> resolver 映射表
export function registerAssetHandler(hostname: string, resolver: AssetResolver): void;
// 初始化 Electron 协议，只调用一次
export function initAssetProtocol(): void;
```

- 使用 `protocol.handle('asset', ...)` 在 Electron 主进程注册
- URL 结构：`asset://<hostname>/<path>`
- 不同 hostname 对应不同的资源域，互不干扰
- 解析器返回 `null` 表示资源不存在，框架返回 404

### 插件资产处理器

`packages/host/src/plugins/plugin-asset-handler.ts`

```typescript
// 注册 asset://plugin/ 的解析器
export function registerPluginAssetHandler(catalog: PluginCatalog): void;
```

路由逻辑：
1. 从 URL pathname 解析 `<pluginId>/<relative-path>`
2. 从 `PluginCatalog` 查找插件路径
3. 校验文件扩展名为 `.png | .jpg | .jpeg | .svg`
4. 读取文件并返回带 MIME 类型的 `Response`

支持的 MIME 映射（实际查找时 `.jpeg` 也归一化为 `.jpg` 处理，不重复登记）：
| 扩展名 | Content-Type |
|---|---|
| .png | image/png |
| .jpg | image/jpeg |
| .svg | image/svg+xml |

### 初始化时序

```
1. initAssetProtocol()           ← Electron 协议注册（仅一次）
2. catalog.init()                ← 扫描并缓存插件
3. registerPluginAssetHandler()  ← 注册插件资产解析器
```

### 调用入口

`initAssetProtocol()` 在 Electron 应用 `ready` 事件中调用（目前位于 `packages/host/src/main.ts` 的初始化流程中），`registerPluginAssetHandler()` 紧随 `catalog.init()` 之后调用。

```typescript
// main.ts 或 host 入口
app.whenReady().then(async () => {
    initAssetProtocol();

    const catalog = new PluginCatalog(platformDb, pluginsDir);
    await catalog.init();
    registerPluginAssetHandler(catalog);

    // ... 其他初始化
});
```

## Plugin Loader 校验

在 `PluginLoader.loadOne()` 中新增校验：

- `manifest.logo` 必填，若缺失则跳过该插件
- `manifest.logo` 扩展名必须是 `.png / .jpg / .jpeg / .svg`，否则跳过
- 各 `feature.icon`（若有）同样检查扩展名格式
- loader 不检查文件是否存在——由 asset protocol 404 处理，渲染层 fallback 首字符

校验失败视为该插件无效，跳过加载。

## PluginProvider 图标消费

`PluginProvider` 新增 `PluginCatalog` 依赖——通过 `registerIpcHandlers` 函数从外部注入：

```typescript
// PluginProvider constructor
constructor(
    db: PlatformDrizzleDatabase,
    private coordinator: RuntimeCoordinator,
    private catalog: PluginCatalog,
    sessionManager?: MatchSessionManager,
)
```

### search() / resolve() 中的图标构建

```typescript
function resolveFeatureIcon(plugin: PluginInfo, featureCode: string): IconDescriptor | undefined {
    const feature = plugin.manifest.features.find(f => f.code === featureCode);
    const iconPath = feature?.icon ?? plugin.manifest.logo;
    return { type: 'url', value: `asset://plugin/${plugin.id}/${iconPath}` };
}
```

- pluginId 在 catalog 中查不到 → 返回 `undefined` → 渲染层显示首字符
- feature 没有 `icon` → 使用 `manifest.logo` 兜底

## resolve-fallback 清理

`packages/host/src/search/resolve-fallback.ts` 移除所有硬编码 emoji：

- plugin/app/file/url 的 fallback 条目均不设 `icon` 字段
- 渲染层通过首字符 fallback 显示

## Renderer 层

### ResultIcon 调整

删除 emoji 渲染分支：

| 条件 | 渲染 |
|---|---|
| `!icon` | 首字符 |
| `icon.type === 'url'` | `<img src={icon.value}>` |
| `icon.type === 'asset'` | `<img src={icon.value}>` |
| 图片加载失败 (`onError`) | 首字符 |

## 内置插件更新

两个内置插件 `launcher` 和 `preferences` 各：

1. 新增 `icon.svg` 文件（占位图标）
2. 更新 `plugin.json`：添加 `"logo": "icon.svg"`，移除 feature 中的 emoji `icon` 值

数据结构：

```
plugins/built-in/
  launcher/
    icon.svg        ← SVG 图标
    plugin.json     ← 添加 logo 字段
  preferences/
    icon.svg        ← SVG 图标
    plugin.json     ← 添加 logo 字段
```

## 涉及文件清单

| 文件 | 改动类型 |
|---|---|
| `packages/shared/src/search/types.ts` | 修改 — 移除 IconDescriptor 的 emoji 类型 |
| `packages/shared/src/plugin/types.ts` | 修改 — 更新注释 |
| `packages/host/src/protocol/asset-protocol.ts` | 新增 — 通用资产协议框架 |
| `packages/host/src/plugins/plugin-asset-handler.ts` | 新增 — 插件资产处理器（注册到 asset 协议） |
| `packages/host/src/plugins/plugin-loader.ts` | 修改 — 新增 logo/icon 格式校验 |
| `packages/host/src/search/plugin-provider.ts` | 修改 — 使用真实图标替换硬编码 emoji，新增 catalog 依赖 |
| `packages/host/src/search/resolve-fallback.ts` | 修改 — 移除所有 emoji 引用 |
| `packages/host/src/ipc/register-handlers.ts` | 修改 — 接收 `pluginCatalog` 参数，传入 PluginProvider |
| `packages/host/src/main.ts` | 修改 — 调用 initAssetProtocol 和 registerPluginAssetHandler |
| `packages/host/src/plugins/plugin-catalog.ts` | 不动 — 已有 get/getAll 方法 |
| `apps/desktop/src/renderer/pages/shell/ResultIcon.tsx` | 修改 — 删除 emoji 渲染分支 |
| `plugins/built-in/launcher/icon.svg` | 新增 |
| `plugins/built-in/launcher/plugin.json` | 修改 |
| `plugins/built-in/preferences/icon.svg` | 新增 |
| `plugins/built-in/preferences/plugin.json` | 修改 |
