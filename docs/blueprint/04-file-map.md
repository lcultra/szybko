# 文件树

> 本文定义 Szybko 项目的完整文件结构，每个文件标注唯一职责。
> AI 创建/修改文件时，应确保每个文件的职责与本文一致。

## 根目录

```
szybko/
├── package.json               # 根 workspace 定义, scripts: dev/build/lint/test
├── pnpm-workspace.yaml        # workspace 包路径声明
├── eslint.config.mjs          # ESLint flat config (@antfu/eslint-config)
├── .editorconfig              # 编辑器统一配置
├── tsconfig.base.json         # 共享 TS 配置 (paths, strict mode)
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
    ├── plugin-runtime.ts      # 插件生命周期/搜索分发/预热池/LRU 回收
    ├── plugin-view-manager.ts # WebContentsView 创建/挂载/分离/销毁
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
    ├── PluginSurface.tsx      # 插件内容区域占位；上报 bounds 给主进程挂载 WebContentsView
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
├── blueprint/                 # 蓝图文档集
│   ├── 00-project-overview.md
│   ├── 01-architecture.md
│   ├── 02-data-model.md
│   ├── 03-api-contracts.md
│   ├── 04-file-map.md
│   ├── 05-milestones.md
│   ├── 06-plugin-spec.md
│   ├── 07-config-templates.md
│   ├── 08-error-handling.md
│   ├── 09-testing-guide.md
│   ├── 10-performance-budget.md
│   ├── 11-plugin-runtime-strategy.md
│   └── 12-utools-compat-matrix.md
└── plans/                    # writing-plans 的输出放这里
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

## 文件拆分规则

以下文件达到阈值时必须拆分。AI 在里程碑执行过程中需持续检查行数。

### host/src/plugin-runtime.ts

**阈值**: 300 行
**描述**: 当前含"插件生命周期/搜索分发/预热池/LRU 回收"四个职责
**拆分目标**:
- `plugin-lifecycle.ts` — `activate()`, `suspend()`, `resume()`, `destroy()`, 状态机
- `plugin-dispatcher.ts` — 搜索分发、结果收集、queryId 管理
- `plugin-pool.ts` — WebView 预热、LRU 缓存、空闲回收

### host/src/main.ts

**阈值**: 150 行
**描述**: Electron 入口，容易堆积初始化和注册逻辑
**拆分目标**:
- `main.ts` 只保留 `app.whenReady()` 和 `createWindow()` 调用
- 提取 `setup.ts` — 插件加载器初始化、快捷键注册、主题监听等

### launcher/src/App.tsx

**阈值**: 200 行
**描述**: 空闲态/搜索态/Tab 态三态合一
**拆分目标**:
- `IdleView.tsx` — 空闲态（仅搜索框）
- `SearchView.tsx` — 搜索态（搜索框 + 结果列表 + 键盘导航）
- `TabView.tsx` — Tab 态（TabHeader + 插件 WebView 区域）
- `App.tsx` 只做状态路由：`state === 'idle' ? <IdleView/> : state === 'search' ? <SearchView/> : <TabView/>`

### launcher/src/store.ts

**阈值**: 200 行
**描述**: search/plugin/window 三个领域耦合
**拆分目标**: 使用 zustand slice 模式
- `stores/search-slice.ts` — queryId, query, results, isSearching
- `stores/plugin-slice.ts` — activePluginId, pluginState, webViewBounds
- `stores/window-slice.ts` — height, isVisible, isDark
- `store.ts` — 合并三个 slice

### packages/core-rust/src/lib.rs

**阈值**: 200 行
**描述**: 所有 `#[napi]` 导出堆在入口
**拆分目标**:
- `lib.rs` 只保留 `#[napi]` 导出和模块声明
- 每个适配器的方法在对应模块中用 `#[napi]` 标注，通过 `#[napi]` 的 pub use 导出

### host/src/adapter-bridge.ts

**阈值**: 150 行（或新增第 4 个适配器时）
**描述**: 适配器注册中心 + Rust 加载逻辑
**拆分目标**:
- `adapter-bridge.ts` 只做注册中心
- 提取 `rust-loader.ts` — `require('.node')` + 生命周期管理
