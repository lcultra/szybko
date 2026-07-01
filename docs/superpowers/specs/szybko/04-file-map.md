# 文件树

> 本文定义 Szybko 项目的完整文件结构，每个文件标注唯一职责。
> AI 创建/修改文件时，应确保每个文件的职责与本文一致。

## 根目录

```
szybko/
├── package.json               # 根 workspace 定义, scripts: dev/build/lint/test
├── pnpm-workspace.yaml        # workspace 包路径声明
├── tsconfig.base.json         # 共享 TS 配置 (paths, strict mode)
├── .eslintrc.cjs              # ESLint 配置
├── .prettierrc                # Prettier 配置
├── .gitignore
└── README.md                  # 开发者指引（非插件市场用）
```

## apps/

```
apps/
└── desktop/                   # Electron 打包入口（薄壳）
    ├── package.json           # 依赖: @szybko/host, electron-builder
    ├── electron-builder.yml   # 打包配置：macOS dmg/zip, Windows nsis
    └── resources/
        ├── icon.icns          # macOS 应用图标
        ├── icon.ico           # Windows 应用图标
        └── icon.png           # Linux / 通用图标

# electron-builder.yml 从 @szybko/host 引入 main 入口
# 不包含任何业务代码，只做打包组装
```

## packages/

### packages/shared

```
packages/shared/               # 共享类型定义（纯 TS，无运行时依赖）
├── package.json               # name: @szybko/shared
├── tsconfig.json
└── src/
    ├── index.ts               # re-export 所有类型
    ├── search-types.ts        # SearchRequest, SearchBatch, SearchResult, ActionDescriptor
    ├── plugin-types.ts        # PluginManifest, PluginFeature, MatchCommand, PluginInstance
    ├── adapter-interfaces.ts  # IFileSystemAdapter, IClipboardAdapter, 等
    ├── ipc-channels.ts        # IPC channel name 常量 + 消息类型
    └── constants.ts           # DEFAULT_WINDOW_WIDTH(820), MAX_HEIGHT(520), MIN_HEIGHT(96)
```

> 注意：adapter-interfaces.ts 放在 shared 中是因为渲染进程和主进程都需要引用这些接口定义。
> 实际的适配器实现（调用 Rust）在 host 包中。

### packages/adapter-interface

```
packages/adapter-interface/   # 🔴 已合并到 @szybko/shared——不单独创建
```

> adapter-interface 的职责已合并到 `@szybko/shared`。**不要创建此包。**

### packages/core-rust

```
packages/core-rust/            # Rust 核心能力（napi-rs）
├── Cargo.toml                 # crate: @szybko/core-rust, 依赖 napi-rs
├── build.rs                   # napi-rs 构建脚本
├── package.json               # name: @szybko/core-rust, 导出 .node 文件
├── npm/                       # napi-rs 平台相关包（自动生成）
└── src/
    ├── lib.rs                 # napi 入口，导出所有 #[napi] 函数
    ├── adapters/
    │   └── macos/
    │       ├── mod.rs
    │       ├── fs.rs          # MDItem search + file icon
    │       └── clipboard.rs   # NSPasteboard monitor
    └── types.rs               # #[napi(object)] 结构体定义
```

### packages/host

```
packages/host/                 # Electron 主进程（核心中枢）
├── package.json               # name: @szybko/host
├── tsconfig.json
└── src/
    ├── index.ts               # 导出 createMainWindow(), 供 apps/desktop 调用
    ├── main.ts                # Electron 入口: app.whenReady() → createWindow()
    ├── window-manager.ts      # 窗口创建(setupWindow)、定位(positionAt)、
    │                          # 大小调整(resize)、显隐(hide/show)
    ├── shortcut-manager.ts    # 全局快捷键: registerAltSpace(), unregister()
    ├── plugin-loader.ts       # 扫描 plugins/ 目录, 读取 plugin.json,
    │                          # 注册 features 到调度器
    ├── plugin-runtime.ts      # WebView 创建/销毁/搜索分发/生命周期管理
    ├── adapter-bridge.ts      # TS 到 Rust 的桥接: 加载 .node 模块,
    │                          # 实例化适配器对象
    ├── permission.ts          # 权限校验: check(pluginId, method)
    ├── theme.ts               # 主题检测: 跟随系统/isDark/通知渲染进程
    └── preload.ts             # contextBridge: 暴露 window.utools API
```

### packages/design-system

```
packages/design-system/        # 设计系统（React 组件库）
├── package.json               # name: @szybko/design-system
│                              # deps: lucide-react, @radix-ui/react-*
│                              # peerDeps: react, tailwindcss
├── tsconfig.json
├── src/
│   ├── index.ts               # re-export 所有 tokens + 组件
│   ├── tokens/
│   │   ├── colors.css         # CSS 自定义属性: 浅色/深色调色板
│   │   ├── typography.css     # 字阶定义
│   │   ├── spacing.css        # 间距尺度
│   │   └── tailwind-preset.ts # Tailwind v4 preset 配置
│   └── components/
│       ├── Button.tsx         # 基于 Radix + Token
│       ├── Input.tsx
│       ├── Switch.tsx
│       ├── Tabs.tsx
│       ├── Card.tsx
│       ├── Badge.tsx
│       ├── Toast.tsx          # 通知提示
│       └── Dialog.tsx         # 模态对话框
```

### packages/launcher

```
packages/launcher/             # 搜索外壳 UI（渲染进程）
├── package.json               # name: @szybko/launcher
│                              # deps: @szybko/design-system, @szybko/shared
├── tsconfig.json
├── vite.config.ts             # Vite 配置 (Tailwind v4 plugin)
├── index.html                 # HTML 入口
└── src/
    ├── main.tsx               # React 入口: createRoot → App
    ├── App.tsx                # 应用主组件: 空闲态(搜索框) / Tab态(插件UI)
    ├── WindowFrame.tsx         # 窗口容器: 圆角 + backdrop-blur + border
    ├── SearchBar.tsx          # 搜索框: input + 防抖 + 拖拽区域
    ├── ResultList.tsx         # 结果列表: 分组网格 + 滚动
    ├── ResultItem.tsx         # 单个结果瓦片: 图标 + 标题 + 高亮
    ├── TabHeader.tsx          # 插件 Tab 头: [← 返回] [插件名] [分离]
    ├── WebViewContainer.tsx   # 插件 WebView 容器
    ├── hooks/
    │   ├── useSearch.ts      # 输入 → 防抖 → invoke search + 处理search-batch
    │   ├── useKeyboard.ts    # 方向键/Enter/Esc 导航
    │   ├── useWindowHeight.ts # ResizeObserver → invoke window:resize
    │   └── usePluginIPC.ts   # 插件生命周期 IPC 监听
    ├── store.ts              # zustand store: search/plugin/window state
    └── styles/
        ├── global.css         # 全局样式 + 主题变量
        └── tailwind.css       # Tailwind 指令 (@tailwind base/components/utilities)
```

### packages/plugin-sdk

```
packages/plugin-sdk/           # 插件开发者工具包
├── package.json               # name: @szybko/plugin-sdk
├── tsconfig.json
└── src/
    ├── index.ts               # 导出所有类型
    └── types/
        ├── api.d.ts           # utools API 类型定义（提供给插件开发者的 d.ts）
        ├── manifest.d.ts      # plugin.json schema 类型
        └── lifecycle.d.ts     # onPluginEnter 等生命周期类型
```

### packages/plugin-store

```
packages/plugin-store/         # 插件商店客户端（Phase 4 实现）
├── package.json               # name: @szybko/plugin-store
├── tsconfig.json
└── src/
    ├── index.ts
    ├── store-api.ts           # 与插件市场 API 通信
    └── types.ts               # 商店相关类型
```

## plugins/

```
plugins/                       # 本地开发插件目录
└── example-plugin/            # 示例插件（开发调试用）
    ├── plugin.json
    ├── preload.js
    └── index.html
```

## docs/

```
docs/
└── superpowers/
    ├── specs/
    │   └── szybko/            # 当前蓝图文档集
    │       ├── 00-project-overview.md
    │       ├── 01-architecture.md
    │       ├── 02-data-model.md
    │       ├── 03-api-contracts.md
    │       ├── 04-file-map.md
    │       ├── 05-milestones.md
    │       ├── 06-plugin-spec.md
    │       ├── 07-config-templates.md
    │       ├── 08-error-handling.md
    │       └── 09-testing-guide.md
    └── plans/                 # writing-plans 的输出放这里
```

## 包依赖关系图

```
apps/desktop
    ↓ depends on
packages/host  ────→ packages/shared
    ↓                      ↓
packages/launcher ──→ packages/design-system
                           ↓
                      (lucide-react, @radix-ui/react-*)
    ↓
packages/core-rust  (napi-rs 编译，被 host 的 adapter-bridge require)
```

**关键规则**：
- `shared` 不能依赖任何其他本地包
- `design-system` 不能依赖 `launcher` 或 `host`
- `launcher` 可依赖 `shared` 和 `design-system`
- `host` 可依赖 `shared`；并在运行时 `require('core-rust')`
- `plugin-sdk` 独立，只发布给插件开发者用
