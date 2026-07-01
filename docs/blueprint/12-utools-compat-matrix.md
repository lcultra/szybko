# uTools 兼容矩阵

> 本文定义 Szybko 对 uTools 插件的兼容边界。不要再写“完全兼容”作为单步目标；兼容必须按阶段、API 组和运行模式验收。

## 1. 兼容等级

| 等级 | 含义 |
|---|---|
| C0 | 可识别 manifest，但不能运行插件 |
| C1 | 可加载插件页面，支持基础生命周期和窗口控制 |
| C2 | 支持常用系统 API、剪贴板、文件图标、简单 DB |
| C3 | 支持高级匹配、动态 feature、子输入框、通知回调 |
| C4 | 高兼容，能运行大部分依赖 Node/preload 的 uTools 插件 |

MVP 目标是 C1 + 部分 C2，不承诺 C4。

## 2. Manifest 字段

| 字段 | MVP | 备注 |
|---|---|---|
| `main` | 支持 | 插件入口 HTML |
| `logo` | 支持 | 优先转为 `iconKey` 缓存 |
| `preload` | 支持 | `compat` 模式允许 Node |
| `pluginSetting.single` | 支持 | 默认 true |
| `pluginSetting.height` | 支持 | 影响 Tab 初始高度 |
| `features[].code` | 支持 | 必须唯一 |
| `features[].cmds: string[]` | 支持 | MVP 主路径 |
| `regex` | 支持 | 需限制正则耗时 |
| `over` | 支持 | 需 min/maxLength 防滥用 |
| `files` | 部分支持 | 依赖文件匹配上下文 |
| `img` | 后续 | 依赖截图/剪贴板图片 |
| `window` | 后续 | 依赖活动窗口适配器 |
| `mainHide/mainPush` | 后续 | 需要完整生命周期事件 |

## 3. API 组

| API 组 | MVP | 运行模式 | 备注 |
|---|---|---|---|
| 生命周期 `onPluginEnter/out` | 支持 | compat/sandbox | C1 |
| `onPluginDetach` | 支持 | compat/sandbox | WebContentsView move 后触发 |
| `setExpendHeight` | 支持 | compat/sandbox | 名称保持 uTools 拼写 |
| `hideMainWindow/showMainWindow/outPlugin` | 支持 | compat/sandbox | C1 |
| `redirect` | 支持 | compat/sandbox | 转回搜索调度器 |
| Shell API | 部分支持 | sandbox 强鉴权 | C2 |
| 剪贴板文本 | 支持 | sandbox 强鉴权 | C2 |
| 剪贴板文件/图片 | 后续 | sandbox 强鉴权 | 依赖平台适配 |
| `getFileIcon` | 支持异步缓存 | compat/sandbox | 同步兼容需单独处理 |
| `db` | 部分支持 | compat/sandbox | 先支持 put/get/remove/allDocs |
| `dbStorage` | 支持 | compat/sandbox | per-plugin namespace |
| `dbCryptoStorage` | 后续 | sandbox 强鉴权 | 需要密钥管理 |
| 子输入框 | 后续 | compat/sandbox | 需要主窗口输入状态机 |
| 动态 feature | 后续 | compat/sandbox | 需要持久化注册 |

## 4. 同步 API 策略

uTools 中部分 API 表现为同步返回。Szybko 内部若走 IPC/Rust 异步实现，需要按 API 分三类：

1. **可同步返回**: 应用名、版本、平台、窗口类型、简单 storage。
2. **缓存后同步返回**: 文件图标、路径、剪贴板快照。缓存未命中时返回默认值并异步更新。
3. **只能异步**: 文件搜索、截图、复杂系统调用。通过 promises 或兼容 shim 暴露。

不能把所有 API 简单改成 Promise，否则会破坏 uTools 插件兼容性。

## 5. 验收插件集合

每个兼容等级都要维护一组本地样例插件：
- `compat-basic`: 生命周期、窗口控制、redirect
- `compat-db`: db/dbStorage 基础读写
- `compat-clipboard`: 文本复制和粘贴
- `compat-file`: 文件路径、图标、shell 打开
- `compat-detach`: 分离窗口后状态保持

验收标准：每个样例插件在 `compat` 模式下通过，`sandbox` 模式下权限拒绝路径也通过。
