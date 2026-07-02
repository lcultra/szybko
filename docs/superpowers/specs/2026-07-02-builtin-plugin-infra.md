# 内置插件设施设计

## 概要

建立内置插件的完整基础设施：每个插件是独立 workspace package，独立构建输出到 `out/plugins/`，运行时统一路径加载，Dev/Prod 一致。

同时将现有 `@szybko/launcher` 重命名为 `@szybko/shell`，消除与 `@szybko/plugin-launcher` 的命名冲突。

## 包结构

```
packages/
├── shared/               # @szybko/shared（不变）
├── host/                 # @szybko/host（不变）
├── shell/                # ← 从 launcher 改名
├── design-system/        # @szybko/design-system（不变）
├── plugin-sdk/           # @szybko/plugin-sdk（不变）
└── core-rust/            # @szybko/core-rust（不变）

plugins/
├── launcher/             # @szybko/plugin-launcher
│   ├── package.json
│   ├── plugin.json
│   ├── tsconfig.json
│   ├── src/preload.ts
│   └── index.html
│
└── preferences/          # @szybko/plugin-preferences
    ├── package.json
    ├── plugin.json
    ├── tsconfig.json
    └── src/
        ├── preload.ts
        └── ui/main.tsx
```

## 重命名：@szybko/launcher → @szybko/shell

| 改前 | 改后 |
|---|---|
| `packages/launcher/` | `packages/shell/` |
| `@szybko/launcher` (package.json) | `@szybko/shell` |
| `apps/desktop/src/renderer/main.tsx` 中 import | `@szybko/shell` |
| `apps/desktop/package.json` 中 dependency | `@szybko/shell` |
| 根 `tsconfig.json` 中 project reference | `./packages/shell` |

`LauncherHost` 类名不变（那是 host 类型，不是 package）。

## 插件构建

每个插件独立构建，产物统一输出到 `apps/desktop/out/plugins/<name>/`。

```
plugins/launcher/
  → tsc --outDir ../../apps/desktop/out/plugins/launcher
  → out/plugins/launcher/
      ├── plugin.json
      ├── preload.js
      └── index.html

plugins/preferences/
  → vite build --outDir ../../apps/desktop/out/plugins/preferences
  → out/plugins/preferences/
      ├── plugin.json
      ├── preload.js
      └── index.html
```

**electron.vite.config.ts 不改动。** 插件构建独立于 desktop 的三层构建。

根 `package.json` 增加脚本：

```json
{
    "scripts": {
        "build:plugins": "pnpm --filter './plugins/**' build",
        "dev": "pnpm build:plugins && pnpm --filter @szybko/desktop dev",
        "build": "pnpm build:plugins && pnpm -r build"
    }
}
```

`pnpm dev` 先编译插件到 `out/plugins/`，再启动 electron-vite。

## 运行时加载

`main/index.ts` 中 PluginManager 的路径：

```typescript
// out/main/index.js → 上一层是 out/
// out/plugins/ 就在同层
const pluginsDir = join(__dirname, '../plugins');
const pluginManager = new PluginManager(registry, pluginsDir);
```

**注意：** `PluginManager.scan()` 需要相应修改——当前代码是 `join(root, 'plugins', 'built-in')`，改为直接扫描 `pluginsBaseDir`：

```typescript
scan() {
    this.plugins.clear();
    if (!existsSync(this.pluginsBaseDir)) return;
    for (const dir of readdirSync(this.pluginsBaseDir, { withFileTypes: true }).filter(e => e.isDirectory())) {
        // 加载 plugin.json 并注册
    }
}
```

Dev：
- `__dirname` = `<repo>/apps/desktop/out/main/`
- `../plugins` = `<repo>/apps/desktop/out/plugins/`

Prod（electron-builder 打包后）：
- `__dirname` = `<app>/out/main/`
- `../plugins` = `<app>/out/plugins/`
- `out/**/*` 已覆盖，自动打包

**同一路径，Dev/Prod 一致。**

## electron-builder.yml

```yaml
files:
  - out/**/*
  - package.json
```

`out/plugins/**/*` 已在 `out/**/*` 范围内，无需额外配置。

## PluginManager 简化

移除 `plugins/user/` 扫描路径（内置插件不需要）。

```typescript
scan() {
    this.plugins.clear();
    const builtInDir = join(this.pluginsBaseDir);
    if (existsSync(builtInDir)) {
        for (const dir of readdirSync(builtInDir, { withFileTypes: true }).filter(e => e.isDirectory())) {
            // load + register...
        }
    }
}
```

不再扫描 `plugins/user/`，`pluginsBaseDir` 直接指向 `out/plugins/`。

## 涉及改动文件

| 文件 | 改动 |
|---|---|
| `packages/launcher/package.json` → `packages/shell/package.json` | name + directory rename |
| `apps/desktop/package.json` | dependency: `@szybko/launcher` → `@szybko/shell` |
| `apps/desktop/src/renderer/main.tsx` | import: `@szybko/shell` |
| `tsconfig.json` | project reference: `./packages/shell` |
| `packages/host/src/plugins/plugin-manager.ts` | 移除 user 扫描，简化 scan |
| `apps/desktop/src/main/index.ts` | pluginsDir = `join(__dirname, '../plugins')` |
| `plugins/launcher/`（新） | 插件 package |
| `plugins/preferences/`（新） | 插件 package |
| `package.json`（根） | 新增 `build:plugins` 脚本 |

## 不包含

- 插件具体的功能实现（锁屏、App 检索、设置界面等）
- 插件热重载（watch 模式后续加）
- 非内置插件（user 安装路径）
