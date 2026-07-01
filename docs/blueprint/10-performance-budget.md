# 性能预算

> 本文定义 Szybko 的速度目标、测量点和失败处理。实现时性能预算与功能需求同级，不能放到后期补测。

## 1. 核心指标

| 场景 | 指标 | 预算 |
|---|---:|---:|
| 热键唤起 | `Alt+Space` 到输入框可输入 | p95 < 80ms |
| 空闲搜索 | 输入字符到首批内存结果渲染 | p95 < 30ms |
| 文件搜索 | 输入字符到首批文件结果渲染 | p95 < 120ms |
| 连续输入 | 10 次快速输入后 UI 卡顿 | 单帧 < 16ms，不能丢焦点 |
| 插件热启动 | 已预热插件进入 Tab 态 | p95 < 80ms |
| 插件冷启动 | 未预热插件进入 Tab 态 | p95 < 300ms |
| 分离窗口 | 点击分离到独立窗口可交互 | p95 < 120ms |
| 休眠插件 | 20 个插件注册后空闲内存增量 | 不创建 `WebContentsView` |
| 预热池 | 后台保留插件视图数 | 默认最多 3 个，可配置 |

## 2. 测量点

| 名称 | 起点 | 终点 | 记录位置 |
|---|---|---|---|
| `launcher.hotkey_to_focus` | 主进程收到快捷键 | input focus 事件 | host + launcher |
| `search.input_to_first_batch` | input change | 第一批 `search-batch` 渲染 | launcher |
| `search.rust_first_batch` | 主进程调用 Rust search | Rust 首批结果返回 | host |
| `plugin.cold_open` | 执行 `plugin.open` | 插件 `dom-ready` + view mounted | host |
| `plugin.hot_open` | 执行 `plugin.open` | 预热 view mounted | host |
| `plugin.detach` | 点击分离 | 独立窗口 focus + view mounted | host |
| `plugin.memory` | 插件状态变化 | RSS/heap 采样 | host |

## 3. 搜索性能规则

1. 内存索引必须先返回应用、插件指令、最近项目和剪贴板文本。
2. 文件搜索走 Rust 异步任务，结果分批返回，不阻塞主进程事件循环。
3. 每次输入生成新 `queryId`，旧 `queryId` 的结果必须在主进程和渲染进程双侧丢弃。
4. 图标不得在首批结果里传大体积 base64，优先传 `iconKey`。
5. 插件搜索有软超时和硬超时：150ms 未首批返回则 UI 不等待，800ms 未 final 则本次查询结束。

## 4. 插件性能规则

1. 输入框连续搜索时，不冷启动插件视图。
2. 高频插件进入预热池，默认最多 3 个，按 LRU 回收。
3. 分离窗口移动同一个 `WebContentsView`，不得重新加载 `index.html`。
4. 挂起插件保留状态，但超过 TTL 或内存压力阈值后销毁。
5. 插件崩溃不影响主搜索窗口，宿主回收视图并保留错误状态。

## 5. 失败处理

| 失败 | 处理 |
|---|---|
| 首批结果超预算 | 降级只展示内存索引，延迟文件搜索 |
| Rust 搜索超时 | 取消本次 Rust 查询，保留下一次输入 |
| 插件连续搜索超时 | 从后台搜索名单移除 |
| 预热池内存过高 | 立即按 LRU 销毁挂起插件 |
| 分离窗口超预算 | 禁止重新加载，记录 view move 耗时和窗口创建耗时 |
