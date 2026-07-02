# 文件树

## 根目录

```
szybko/
├── package.json              # workspace 根
├── pnpm-workspace.yaml
├── eslint.config.mjs         # @antfu/eslint-config flat config
├── tsconfig.base.json        # 共享 TS 配置
├── CLAUDE.md                 # AI 会话入口
├── .editorconfig
└── plugins/                  # 插件源码工作区，参与 pnpm workspace
    └── example-plugin/       # 示例插件源码，不是运行时安装目录
```

## apps/

```
apps/desktop/                 # Electron 打包薄壳（从 host 引入 main）
├── package.json
├── electron-builder.yml
├── electron.vite.config.ts
├── resources/icon.icns
└── src/
    ├── main/                 # Electron 应用入口，组合 host 能力
    ├── preload/              # contextBridge，暴露内部 API 与插件 API
    └── renderer/             # 渲染入口，挂载 launcher UI
```

## packages/

```
packages/
├── shared/                   # 跨进程契约：类型、IPC channel、窗口/搜索常量
│   └── src/ (search-types, plugin-types, runtime-types, api-types, ipc-channels, constants)

├── core-rust/                # napi-rs 编译为 .node
│   ├── src/ (lib.rs, types.rs, adapters/macos/{fs}.rs)
│   └── lib/                  # napi 构建产物：index.js、index.d.ts、*.node

├── host/                     # Electron 主进程
│   └── src/
│       ├── plugin-manager.ts     # 安装/卸载/扫描 plugins/ 目录
│       ├── runtime-manager.ts    # 创建/销毁/attach/detach Runtime
│       ├── window-manager.ts     # 创建窗口、管理 Host
│       ├── hosts/
│       │   ├── launcher-host.ts  # LauncherHost: 主窗口内容区
│       │   └── floating-host.ts  # FloatingHost: 独立分离窗口
│       ├── plugin-loader.ts      # 读取/校验 plugin.json
│       ├── adapter-bridge.ts     # TS → Rust 桥接
│       ├── shortcut-manager.ts   # 全局快捷键
│       └── theme.ts              # 主题检测

├── design-system/            # 设计系统 (@szybko/design-system)
│   └── src/ (tokens/, components/ Button/Input/Card...)

├── launcher/                 # 搜索外壳 UI（渲染进程）
│   └── src/ (App, WindowFrame, SearchBar, ResultList, ResultItem,
│              hooks/ useSearch/useKeyboard/useWindowHeight,
│              zustand store, app.css)

├── plugin-sdk/               # 插件开发者工具包 (d.ts)
└── plugin-store/             # Phase 4，当前未实现
```

## 包依赖

```
apps/desktop  →  host, launcher, shared
host          →  shared, core-rust, electron(peer)
launcher      →  shared, design-system
design-system →  lucide-react, @radix-ui/react
shared        →  无运行时外部依赖
core-rust     →  napi-rs (独立编译)
plugins/*     →  插件源码包，可按插件自身技术栈定义脚本
```

运行时安装的第三方插件不放在仓库根目录的 `plugins/` 下，建议放到应用数据目录，例如 `~/.szybko/plugins`。

## 拆分规则（超阈值时必须拆）

| 文件                      | 阈值   | 拆分为                                            |
| ------------------------- | ------ | ------------------------------------------------- |
| `host/runtime-manager.ts` | 300 行 | runtime-manager + runtime-pool (预热/LRU)         |
| `host/window-manager.ts`  | 200 行 | window-manager + host-factory                     |
| `host/main.ts`            | 150 行 | main + setup                                      |
| `launcher/App.tsx`         | 200 行 | SearchView + RuntimeView (宿主切换时只有 view 变) |
| `launcher/store.ts`        | 200 行 | zustand slices (search/runtime/window)            |
| `core-rust/lib.rs`        | 200 行 | 模块级 `#[napi]` pub use                          |
| `host/adapter-bridge.ts`  | 150 行 | bridge + rust-loader                              |
