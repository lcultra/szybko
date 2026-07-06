# @szybko/plugin-tools

Szybko 插件开发 CLI 工具。消除每个插件维护独立 vite config、tsconfig 和 build 脚本的样板负担。

## 安装

插件项目在 `package.json` 中加入依赖：

```json
{
    "devDependencies": {
        "@szybko/plugin-tools": "workspace:*"
    }
}
```

然后 `pnpm install`。

## 快速开始

### 1. 创建插件

```bash
# 在当前目录生成插件目录
# 推荐先 cd plugins/built-in/，再创建

cd plugins/built-in

# 简单插件（仅有 preload）
szybko-plugin create my-plugin

# React 插件（有 UI）
szybko-plugin create settings --renderer
```

生成目录结构：

```
my-plugin/
├── plugin.config.js          # 插件配置
├── package.json              # 依赖声明
├── plugin.json               # 插件清单
├── icon.svg                  # 默认图标
├── index.html                # 入口 HTML
├── preload/index.ts          # preload 脚本
├── public/                   # 静态资源目录
└── src/                      # React 源码（--renderer）
    ├── main.tsx
    ├── App.tsx
    ├── style.css
    └── vite-env.d.ts
```

### 2. 构建

```bash
cd my-plugin
szybko-plugin build
```

自动完成：

- 构建 preload → `dist/preload.js`
- 构建 React renderer → `dist/`（如果有）
- 拷贝 `plugin.json` → `dist/plugin.json`
- 拷贝 `index.html` → `dist/index.html`（简单插件）
- 拷贝 `public/` → `dist/`（如果有）

### 3. 开发模式

```bash
szybko-plugin dev
```

- React 插件：启动 Vite dev server（自动分配端口），同时 watch preload 构建
- 简单插件：watch preload 构建
- 自动注入 `development.main` 到 `dist/plugin.json`

## 配置

插件根目录的 `plugin.config.js` 是唯一配置入口：

```js
import { defineConfig } from '@szybko/plugin-tools';

export default defineConfig({
    // preload 入口路径（默认 'preload/index.ts'）
    preload: 'preload/index.ts',

    // 启用 React renderer（以插件根目录为 vite root）
    renderer: true,

    // 扩展内置 vite 配置（选填）
    vite: {
        preload: {
            plugins: [],
        },
        renderer: {
            plugins: [],
        },
    },
});
```

### 字段说明

| 字段            | 类型             | 默认值               | 说明                            |
| --------------- | ---------------- | -------------------- | ------------------------------- |
| `preload`       | `string`         | `'preload/index.ts'` | preload 入口路径                |
| `renderer`      | `boolean`        | `false`              | 设为 `true` 构建 React renderer |
| `vite.preload`  | `ViteUserConfig` | -                    | 扩展 preload vite 配置          |
| `vite.renderer` | `ViteUserConfig` | -                    | 扩展 renderer vite 配置         |

## 插件类型

### 简单插件

仅有 preload 脚本，适用于不需要 UI 的功能型插件（如命令执行器、系统操作）。

```
my-plugin/
├── plugin.config.js    # defineConfig({})
├── plugin.json
├── package.json
├── icon.svg
├── index.html          # 简单 loading 页
├── preload/index.ts
└── public/icon.svg
```

`plugin.config.js`：

```js
import { defineConfig } from '@szybko/plugin-tools';

export default defineConfig({});
```

### React 插件

有 UI 界面的插件，使用 React + Tailwind CSS。

```
my-plugin/
├── plugin.config.js    # defineConfig({ renderer: true })
├── plugin.json
├── package.json
├── icon.svg
├── index.html          # <script src="./src/main.tsx">
├── preload/index.ts
├── public/icon.svg
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── style.css
    └── vite-env.d.ts
```

`plugin.config.js`：

```js
import { defineConfig } from '@szybko/plugin-tools';

export default defineConfig({ renderer: true });
```

## 插件清单

`plugin.json` 是 Szybko 宿主识别的插件清单：

```json
{
    "id": "my-plugin",
    "main": "index.html",
    "logo": "icon.svg",
    "preload": "preload.js",
    "pluginSetting": { "single": true },
    "features": []
}
```

- `logo` 引用 `public/icon.svg`（Vite 构建时拍平到 `dist/` 根目录）
- `features` 定义插件的指令集，详见 `PluginManifest` 类型

## pnpm workspace 集成

生成后插件位于 `plugins/built-in/`，被 `pnpm-workspace.yaml` 的 `'plugins/**'` 模式覆盖。

构建所有插件：

```bash
pnpm build:plugins
```

它会逐个进入每个插件目录执行 `szybko-plugin build`。
