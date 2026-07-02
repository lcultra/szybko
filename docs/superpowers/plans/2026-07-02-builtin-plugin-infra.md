# 内置插件设施实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立内置插件基础设施：workspace package → 独立构建 → `out/plugins/` 加载，Dev/Prod 统一路径

**Architecture:** 每个内置插件是独立 workspace package，各自构建到 `apps/desktop/out/plugins/<name>/`；PluginManager 直接扫描该目录；electron-builder 通过 `out/**/*` 自动打包

**Tech Stack:** pnpm workspace, TypeScript, electron-vite, electron-builder

## 全局约束

- `@szybko/launcher` 重命名为 `@szybko/shell`（package name + 目录名 + import path）
- 插件目录直接命名 `plugins/<name>/`，无 `built-in/` 中间层
- 插件 package name 约定：`@szybko/plugin-<name>`
- 所有插件独立构建，desktop 的 electron-vite 不介入
- 构建产物统一输出到 `apps/desktop/out/plugins/<name>/`
- PluginManager 直接扫描 `pluginsDir`（不再拼接 `plugins/built-in`）
- 移除 `plugins/user/` 扫描路径
- Dev/Prod 统一使用 `join(__dirname, '../plugins')`

---

### Task 1: 重命名 packages/launcher → packages/shell

**Files:**
- Rename: `packages/launcher/` → `packages/shell/`
- Modify: `packages/shell/package.json`（改 name 字段）
- Modify: `apps/desktop/package.json`（改 dependency name）
- Modify: `apps/desktop/src/renderer/main.tsx`（改 import path）
- Modify: `tsconfig.json`（改 project reference path）

**Context:** 现有 `@szybko/launcher` 与新插件 `@szybko/plugin-launcher` 命名冲突。shell 更准确地描述了它作为搜索 UI 浮层的定位。

- [ ] **Step 1: 重命名目录**

```bash
git mv packages/launcher packages/shell
```

- [ ] **Step 2: 更新 packages/shell/package.json 的 name 字段**

```json
{
    "name": "@szybko/shell",
    "type": "module",
    "version": "0.1.0",
    "private": true,
    "exports": {
        ".": "./src/index.ts"
    },
    "main": "./src/index.ts",
    "types": "./src/index.ts",
    "scripts": {
        "typecheck": "tsc --noEmit"
    },
    "devDependencies": {
        "typescript": "^6.0"
    }
}
```

- [ ] **Step 3: 更新 apps/desktop/package.json**

```json
{
    "dependencies": {
        "@szybko/shell": "workspace:*",
        ...
    }
}
```

找到 `"@szybko/launcher": "workspace:*"` 直接替换。

- [ ] **Step 4: 更新 apps/desktop/src/renderer/main.tsx 的 import**

```typescript
import { App } from '@szybko/shell';
```

找到 `from '@szybko/launcher'` 替换。

- [ ] **Step 5: 更新根 tsconfig.json 的 project reference**

```json
{
    "references": [
        { "path": "./packages/shell" },
        ...
    ]
}
```

找到 `"./packages/launcher"` 替换。

- [ ] **Step 6: 确认类型检查通过**

```bash
pnpm typecheck 2>&1 | grep -E "shell|error"
```
Expected: shell package 行出现且无 error（已知的 pre-existing 类型错误除外）

- [ ] **Step 7: 提交**

```bash
git add packages/shell apps/desktop/package.json apps/desktop/src/renderer/main.tsx tsconfig.json
git commit -m "refactor: rename @szybko/launcher to @szybko/shell"
```

---

### Task 2: 创建插件 workspace packages

**Files:**
- Create: `plugins/launcher/package.json`
- Create: `plugins/launcher/plugin.json`
- Create: `plugins/launcher/tsconfig.json`
- Create: `plugins/launcher/src/preload.ts`
- Create: `plugins/launcher/index.html`
- Create: `plugins/preferences/package.json`
- Create: `plugins/preferences/plugin.json`
- Create: `plugins/preferences/tsconfig.json`
- Create: `plugins/preferences/src/preload.ts`
- Create: `plugins/preferences/index.html`

**Context:** `pnpm-workspace.yaml` 已经包含 `plugins/*`，新 package 自动纳入 workspace。

- [ ] **Step 1: 创建 plugins/launcher/ 基础文件**

```json
// plugins/launcher/package.json
{
    "name": "@szybko/plugin-launcher",
    "private": true,
    "scripts": {
        "build": "tsc --project tsconfig.json && cp src/index.html ../../apps/desktop/out/plugins/launcher/",
        "typecheck": "tsc --noEmit"
    },
    "dependencies": {
        "@szybko/shared": "workspace:*"
    },
    "devDependencies": {
        "typescript": "^6.0"
    }
}
```

```json
// plugins/launcher/plugin.json
{
    "main": "index.html",
    "preload": "preload.js",
    "pluginSetting": { "single": true },
    "features": []
}
```

```json
// plugins/launcher/tsconfig.json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "outDir": "../../apps/desktop/out/plugins/launcher",
        "rootDir": "src",
        "composite": true
    },
    "include": ["src"]
}
```

```typescript
// plugins/launcher/src/preload.ts
// @szybko/plugin-launcher — 系统指令和 App 检索
// 功能将在后续填充
```

```html
<!-- plugins/launcher/index.html -->
<!doctype html>
<html lang="zh-CN">
    <head><meta charset="UTF-8" /><title>启动器</title></head>
    <body><p>启动器插件加载中...</p></body>
</html>
```

- [ ] **Step 2: 创建 plugins/preferences/ 基础文件**

```json
// plugins/preferences/package.json
{
    "name": "@szybko/plugin-preferences",
    "private": true,
    "scripts": {
        "build": "tsc --project tsconfig.json && cp src/index.html ../../apps/desktop/out/plugins/preferences/",
        "typecheck": "tsc --noEmit"
    },
    "dependencies": {
        "@szybko/shared": "workspace:*"
    },
    "devDependencies": {
        "typescript": "^6.0"
    }
}
```

```json
// plugins/preferences/plugin.json
{
    "main": "index.html",
    "preload": "preload.js",
    "pluginSetting": { "single": true, "height": 520 },
    "features": []
}
```

```json
// plugins/preferences/tsconfig.json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "outDir": "../../apps/desktop/out/plugins/preferences",
        "rootDir": "src",
        "composite": true
    },
    "include": ["src"]
}
```

```typescript
// plugins/preferences/src/preload.ts
// @szybko/plugin-preferences — 设置界面
// 功能将在后续填充
```

```html
<!-- plugins/preferences/index.html -->
<!doctype html>
<html lang="zh-CN">
    <head><meta charset="UTF-8" /><title>首选项</title></head>
    <body><p>首选项插件加载中...</p></body>
</html>
```

- [ ] **Step 3: 确认 workspace 发现了新包**

```bash
pnpm ls -r --depth -1 2>&1 | grep plugin-
```
Expected: `@szybko/plugin-launcher` 和 `@szybko/plugin-preferences` 出现在列表中

- [ ] **Step 4: 提交**

```bash
git add plugins/
git commit -m "feat: create plugin workspace packages (launcher, preferences)"
```

- [ ] **Step 5: 清理旧 plugins/built-in/**

`plugins/built-in/` 已被新结构取代，移除旧的 example-plugin：

```bash
git rm -r plugins/built-in
```

- [ ] **Step 6: 提交清理**

```bash
git commit -m "chore: remove obsolete plugins/built-in/ (replaced by plugins/<name>/)"
```

---

### Task 3: PluginManager 简化 + 路径更新

**Files:**
- Modify: `packages/host/src/plugins/plugin-manager.ts`
- Modify: `apps/desktop/src/main/index.ts`

**Context:** PluginManager 不再扫描 `plugins/user/`，`pluginsBaseDir` 直接指向 `out/plugins/`。`main/index.ts` 传入新路径。

- [ ] **Step 1: 简化 plugin-manager.ts 的 scan 方法**

移除 `plugins/user/` 扫描，`pluginsBaseDir` 直接指向插件目录（不再拼接 `plugins/built-in`）：

```typescript
// packages/host/src/plugins/plugin-manager.ts
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PluginLoader } from './plugin-loader.js';
import type { PluginRegistry } from './plugin-registry.js';

export interface PluginInfo {
    id: string;
    manifest: import('@szybko/shared').PluginManifest;
    path: string;
}

export class PluginManager {
    private loader = new PluginLoader();
    private plugins: Map<string, PluginInfo> = new Map();

    constructor(
        private registry: PluginRegistry,
        private pluginsBaseDir: string,
    ) {}

    async init(): Promise<void> {
        await this.registry.init();
        this.scan();
    }

    scan() {
        this.plugins.clear();
        if (!existsSync(this.pluginsBaseDir)) {
            console.warn(`[PluginManager] plugins dir not found: ${this.pluginsBaseDir}`);
            return;
        }
        for (const dir of readdirSync(this.pluginsBaseDir, { withFileTypes: true }).filter(e => e.isDirectory())) {
            const pluginPath = join(this.pluginsBaseDir, dir.name);
            const loaded = this.loader.loadOne(pluginPath);
            if (loaded) {
                this.plugins.set(dir.name, loaded);
                if (!this.registry.has(dir.name)) {
                    this.registry.register(dir.name, {
                        source: 'built-in',
                        enabled: true,
                        installedAt: new Date().toISOString(),
                        path: pluginPath,
                    });
                }
            }
        }

        // Sync registry: disable entries for plugins no longer on disk
        for (const id of this.registry.listEnabled()) {
            if (!this.plugins.has(id)) {
                this.registry.setEnabled(id, false);
            }
        }
    }

    get(id: string): PluginInfo | undefined {
        return this.plugins.get(id);
    }

    getAll(): PluginInfo[] {
        return Array.from(this.plugins.values());
    }

    getEnabled(): PluginInfo[] {
        return this.registry.listEnabled()
            .map(id => this.plugins.get(id))
            .filter((p): p is PluginInfo => !!p);
    }
}
```

关键改动：
- `pluginsBaseDir` 不再是可选的，删除 `?? process.cwd()` 回退
- `scan()` 直接扫描 `pluginsBaseDir`（不拼接 `plugins/built-in`）
- 移除 `plugins/user/` 扫描代码块
- 加 `process.cwd()` 和 `process` import 不再需要

- [ ] **Step 2: 更新 main/index.ts 的插件路径**

```typescript
// apps/desktop/src/main/index.ts
import path, { join } from 'node:path';
import process from 'node:process';
import { PluginManager, PluginRegistry, registerIpcHandlers, RuntimeManager, ShortcutManager, Store, WindowManager } from '@szybko/host';
import { app } from 'electron';

const windowManager = new WindowManager();
const shortcutManager = new ShortcutManager();

void app.whenReady().then(async () => {
    const store = new Store(join(app.getPath('userData'), 'szybko.json'), { plugins: {} });
    const registry = new PluginRegistry(store);

    // 插件从 out/plugins/ 加载（与打包产物同路径）
    const pluginsDir = join(__dirname, '../plugins');
    const pluginManager = new PluginManager(registry, pluginsDir);
    await pluginManager.init();

    const preloadPath = join(__dirname, '../preload/host.js');
    const pluginPreloadPath = join(__dirname, '../preload/plugin.js');
    const runtimeManager = new RuntimeManager(pluginManager, windowManager, pluginPreloadPath);
    await runtimeManager.startAll();

    const win = windowManager.createMainWindow(preloadPath);

    if (process.env.ELECTRON_RENDERER_URL) {
        void win.loadURL(process.env.ELECTRON_RENDERER_URL);
    }
    else {
        void win.loadFile(path.join(__dirname, 'renderer/index.html'));
    }

    registerIpcHandlers(windowManager, runtimeManager);
    shortcutManager.registerToggle(windowManager);
});

// ... 其余不变
```

关键改动：
- `pluginsDir` 从 `join(__dirname, '..', '..', '..', '..')` 改为 `join(__dirname, '../plugins')`
- 移除原来的 `build:plugins` 注释

- [ ] **Step 3: 确认类型检查通过**

```bash
pnpm --filter @szybko/host typecheck 2>&1 | grep -v "vite/client\|Cannot find"
```

Expected: 只有已知的 pre-existing 类型错误（vite/client, node types），无新增错误

- [ ] **Step 4: 提交**

```bash
git add packages/host/src/plugins/plugin-manager.ts apps/desktop/src/main/index.ts
git commit -m "refactor(host): simplify PluginManager scan, use out/plugins/ path"
```

---

### Task 4: 根 package.json 脚本 + 构建流程

**Files:**
- Modify: `package.json`（根）

**Context:** 添加 `build:plugins` 脚本，更新 `dev` 和 `build` 命令。

- [ ] **Step 1: 更新根 package.json 的 scripts**

```json
{
    "scripts": {
        "dev": "pnpm build:plugins && pnpm --filter @szybko/desktop dev",
        "build": "pnpm build:plugins && pnpm -r build",
        "build:plugins": "pnpm --filter './plugins/**' build",
        "typecheck": "pnpm -r run typecheck",
        "lint": "eslint .",
        "lint:fix": "eslint . --fix"
    }
}
```

修改说明：
- `dev`: 先构建插件再启动 desktop dev
- `build`: 先构建插件再构建所有包
- `build:plugins`: 新脚本，构建所有 `plugins/` 下的 workspace package

注意：如果插件的启动需要额外步骤，可以后续优化。目前每个插件的 build 脚本是 `tsc + cp html`。

- [ ] **Step 2: 测试 build:plugins**

```bash
mkdir -p apps/desktop/out/plugins
pnpm build:plugins 2>&1
```

Expected：两个插件包编译成功，产物出现在对应目录

```bash
ls apps/desktop/out/plugins/launcher/
```
Expected：`index.html  plugin.json  preload.js`

```bash
ls apps/desktop/out/plugins/preferences/
```
Expected：`index.html  plugin.json  preload.js`

- [ ] **Step 3: 提交**

```bash
git add package.json
git commit -m "chore: add build:plugins script, update dev/build to include plugins"
```

---

### Task 5: 端到端验证

**Context:** 确认重命名 + 插件构建 + 运行时加载全部正常工作。

- [ ] **Step 1: 完整构建**

```bash
pnpm build 2>&1
```
Expected：desktop build 成功，out/ 目录包含 main/preload/renderer + plugins

- [ ] **Step 2: 启动 dev 模式**

```bash
pnpm dev 2>&1
```
Expected：
1. 插件被构建到 out/plugins/
2. electron-vite 构建 main/preload/renderer
3. Electron 启动

- [ ] **Step 3: 验证"应用搜索"仍正常工作**（重命名没有破坏）

搜索 `code` → 出现 "Visual Studio Code" 结果。

- [ ] **Step 4: 验证插件加载**（可选，因为插件暂时没有注册 features）

检查 main process console，expected：`[PluginManager] plugins dir not found: ...` 不应该出现。插件目录应该被正常发现。
