# 文件树

## 根目录

```
szybko/
├── package.json              # workspace 根
├── pnpm-workspace.yaml
├── eslint.config.mjs         # @antfu/eslint-config flat config
├── tsconfig.base.json        # 共享 TS 配置
├── CLAUDE.md                 # AI 会话入口
└── .editorconfig
```

## apps/

```
apps/desktop/                 # Electron 打包薄壳（从 host 引入 main）
├── package.json
├── electron-builder.yml
└── resources/icon.icns
```

## packages/

```
packages/
├── shared/                   # 纯类型，无运行时依赖
│   └── src/ (search-types, plugin-types, adapter-interfaces, constants)

├── core-rust/                # napi-rs 编译为 .node
│   └── src/ (lib.rs, types.rs, adapters/macos/{fs,clipboard,process}.rs)

├── host/                     # Electron 主进程
│   └── src/ (main, window-manager, shortcut-manager,
│              plugin-loader, plugin-runtime, plugin-view-manager,
│              adapter-bridge, permission, theme, preload)

├── design-system/            # 设计系统 (@szybko/design-system)
│   └── src/ (tokens/, components/ Button/Input/Switch/Tabs/Card...)

├── launcher/                 # 搜索外壳 UI（渲染进程）
│   └── src/ (App, WindowFrame, SearchBar, ResultList, ResultItem,
│              TabHeader, PluginSurface,
│              hooks/ useSearch/useKeyboard/useWindowHeight/usePluginIPC,
│              zustand store, styles/)

├── plugin-sdk/               # 插件开发者工具包 (d.ts)
└── plugin-store/             # Phase 4
```

## 包依赖

```
apps/desktop  →  host, launcher, shared
host          →  shared (+ 运行时 require core-rust)
launcher      →  shared, design-system
design-system →  lucide-react, @radix-ui/react
shared        →  无
core-rust     →  napi-rs (独立编译)
```

## 拆分规则（超阈值时必须拆）

| 文件 | 阈值 | 拆分为 |
|---|---|---|
| `host/plugin-runtime.ts` | 300 行 | activation + dispatch + pool |
| `host/main.ts` | 150 行 | main + setup |
| `launcher/App.tsx` | 200 行 | IdleView + SearchView + TabView |
| `launcher/store.ts` | 200 行 | zustand slices (search/plugin/window) |
| `core-rust/lib.rs` | 200 行 | 模块级 `#[napi]` pub use |
| `host/adapter-bridge.ts` | 150 行 | bridge + rust-loader |
