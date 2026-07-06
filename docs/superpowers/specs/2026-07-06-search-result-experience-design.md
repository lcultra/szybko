# 搜索结果体验与链路一致性优化设计

## 概要

优化启动器搜索结果链路的用户体验与一致性：搜索无命中时不显示“没有找到匹配结果”，而是展示与未输入内容相同的默认页内容（固定 + 最近使用），同时保留搜索框中的输入。顺带补齐 session 失效、执行上下文绑定、固定/最近结果还原、pin/reorder 刷新、前端样式交互走查等问题。

## 现状

当前搜索链路为：

```
renderer useSearch
  -> preload search IPC
  -> main SEARCH_QUERY handler
  -> SearchSession
  -> PinnedSectionProvider / RecentSectionProvider / PluginProvider
  -> SearchResponse
  -> SectionList / Grid
```

主要问题：

1. **无结果空态不符合期望**：query 有值且 sections 为空时，前端显示“没有找到匹配结果”。期望是像未输入内容一样展示默认内容。
2. **旧 session 可能被执行**：输入变化后的 debounce 窗口内，旧 `sessionId/currentQueryId/sections` 仍可被点击或 Enter 执行。
3. **取消语义偏弱**：`SEARCH_CANCEL` 只清空全局 `currentSession`，旧 session 的异步 provider 返回后仍可能 emit。
4. **plugin match 绑定不精确**：plugin command 执行按 `pluginId + featureCode` 在历史 match session 中查找，未绑定当前 `queryId/sessionId/itemId/matchId`。
5. **默认区 item 还原质量不足**：Pinned/Recent 依赖当前 session registry，空查询或 fallback 场景容易退化为 `fallbackItemFromId()`。
6. **pin/reorder 后 UI 不刷新**：用户操作固定或排序后，当前结果快照不会自动重查。
7. **排序写回不稳定**：reorder 只更新被拖动 item 的 `sortOrder`，会产生重复 order。
8. **右键取消固定实现错误**：右键菜单中“取消固定”仍走 add/update，而不是 remove。
9. **前端样式交互缺少专项验收**：搜索体验调整会影响空态、loading、默认区、fallback 区、键盘执行、点击执行、拖拽排序等 UI 行为，需要单独检查。

## 目标

- query 无命中时，最终展示默认页内容：固定 section + 最近使用 section。
- 搜索框保留用户输入，不因 fallback 自动清空。
- 前端不再展示“没有找到匹配结果”文案。
- 输入变化后，旧搜索结果不能被执行。
- 搜索取消、快速输入、旧 provider 返回不会污染当前结果。
- plugin command 执行只使用当前搜索 session 内的精确 match。
- Pinned/Recent 在默认页和 fallback 页都能展示完整 item 信息。
- pin/unpin/reorder 后结果可立即反映。
- 前端样式和交互通过专项走查，确保体验一致。

## 非目标

- 不新增全局搜索 provider 类型。
- 不重做 SearchResponse IPC 结构。
- 不引入骨架屏或复杂空状态视觉。
- 不实现 app/file/url provider 的完整搜索能力。
- 不把 fallback 状态暴露为新的用户可见文案。

## 设计原则

- **后端保证可展示终态**：renderer 不猜“无结果时该展示什么”，SearchSession 发出的 final response 应可直接渲染。
- **session 是执行边界**：用户执行任何 item 都必须落在当前 `sessionId + queryId` 内。
- **默认内容是一等结果**：Pinned/Recent 不只是空 query 页面，也可作为无命中 fallback。
- **前端只渲染快照**：前端不拼装搜索结果，不复刻 provider 逻辑。
- **体验稳定优先**：debounce 期间可以保留旧视觉，但旧视觉不可执行。

## 用户体验

### 未输入内容

搜索框为空时，展示默认页内容：

```
固定
最近使用
```

如果两个 section 都没有数据，则结果区域保持安静空白，不显示“没有找到匹配结果”。

### 输入有命中

搜索框有 query 且 plugin/search provider 有命中时，正常展示搜索结果。Pinned/Recent 是否同时展示由当前 provider 排序和 section 组装逻辑决定，但执行上下文必须绑定本次 query。

### 输入无命中

搜索框有 query 但 search provider 没有命中时：

- 搜索框保留 query。
- 结果区域展示默认页内容（固定 + 最近使用）。
- 不显示“没有找到匹配结果”。
- 默认页 item 可执行，执行时使用当前 fallback session。
- 用户继续输入时，fallback 内容可以在 loading 期间短暂保留，但不可执行，直到新响应到达。

## 后端设计

### SearchSession fallback

`SearchSession` 继续并行调用 provider，但组装终态时区分“search provider 是否命中”：

- query 为空：返回默认内容。
- query 非空且 search section 有 item：返回正常搜索结果。
- query 非空且 search section 无 item：返回默认内容作为 final response。

默认内容来自同一次 session 中的 `PinnedSectionProvider` 和 `RecentSectionProvider`。这保证 fallback item 可以被当前 session registry 解析和执行。

不新增 `SearchResponse.mode`。调试可观测性通过 main 侧日志记录 fallback 发生，不扩展 IPC contract。

### cancellation guard

`SearchSession` 增加取消语义：

- session 内部维护 `cancelled` 或 `active` 状态。
- `cancel()` 后不再 emit `loading/partial/final`。
- provider 返回后进入组装前再次检查 session 是否仍有效。
- main handler 切换 currentSession 时取消旧 session。
- `SEARCH_CANCEL` 按当前 session 或 queryId 取消，不只是置空全局引用。

### 执行上下文绑定

`ITEM_EXECUTE` 必须验证：

- `currentSession` 存在。
- `currentSession.sessionId === req.sessionId`。
- `currentSession.queryId === req.queryId`。
- `itemId` 在当前 session registry 中存在。

PluginProvider 不再按 `pluginId + featureCode` 从全局历史 match session 中取第一个 match。搜索阶段需要建立 item 到 match 的精确映射：

```
plugin itemId -> matchId -> TriggerMatch
```

执行时通过当前 session 内的 item/match 映射解析 payload、enterType、option、from，再调用 `RuntimeCoordinator.activatePlugin()`。

### Pinned/Recent item resolve

`PluginProvider.resolve(itemId)` 需要支持从 `plugin://pluginId/featureCode/cmdKey` 还原基础 item：

- 校验 itemId 格式。
- 查询 command projection / effective feature。
- 还原 title、subtitle、icon、score、capabilities、state。
- 如果投影不存在，返回 null，调用方再决定是否 fallback。

Pinned/Recent provider 优先调用 owner provider 的 `resolve()`，避免只依赖当前 session registry。`fallbackItemFromId()` 只保留为最后兜底。

### pin 与 reorder

`PinnedItemRepository.reorder()` 改为重排全部 pinned item：

1. 读取当前 pinned 列表。
2. 移动目标 item 到 `toIndex`。
3. 在事务中写回连续 `sortOrder`。

`ITEM_PIN`、`ITEM_REORDER` 成功后不主动推送旧 response；renderer 会重新触发当前 query 搜索，让数据流保持单向。

右键菜单固定行为：

- 未固定：add。
- 已固定：remove。

右键菜单动作发生在 main 侧。菜单点击完成 pin/unpin 后，main 侧必须基于当前 session 保存的 snapshot 重新运行一次当前搜索并 emit 新 `SearchResponse`，不新增 renderer IPC contract，也不等待用户下一次输入才刷新。

## 前端设计

### useSearch state

输入变化时立即失效旧执行上下文：

- 更新 `query`。
- 设置 `status: loading`。
- 重置 `selectedIndex`。
- 清空或标记 `sessionId/currentQueryId` 不可执行。
- 保留旧 sections 仅用于视觉稳定。

新的 `SearchResponse` 到达后：

- 只接受当前 `queryId`。
- 替换 sections/itemsById/status。
- 写入当前 sessionId/queryId。
- clamp `selectedIndex` 到可见结果范围内。

### execute guard

点击或 Enter 执行前必须满足：

- 当前没有 pending query。
- `sessionId/currentQueryId` 对应当前可执行 response。
- itemId 存在于当前 `itemsById`。

如果 debounce 期间展示的是旧结果，点击或 Enter 不执行。UI 可保持 hover/selected，但命令不触发。

### 空态删除

Shell 删除以下用户可见文案分支：

```
status === 'final' && query && sections.length === 0 -> 没有找到匹配结果
```

结果区域只根据 sections 渲染。final 后仍无 sections 时保持空白。

### 操作后刷新

以下操作成功后重新触发当前 query 搜索：

- pin。
- unpin。
- reorder。

刷新时保持输入框内容不变。

右键菜单中的 pin/unpin 由 main 侧刷新当前 session；renderer 不需要为 native menu action 做额外轮询。

## 前端样式与交互验收

本规格实现后需要进行专项前端走查，覆盖：

1. **默认页**：空 query 时固定/最近布局正常，section 间距、滚动高度、tile 尺寸不跳动。
2. **无结果 fallback**：输入不存在的 query 后，搜索框保留输入，结果区域展示默认页，无“没有找到匹配结果”文案。
3. **loading 过渡**：快速输入时旧内容不闪烁成空态，且不可执行。
4. **键盘交互**：方向键、Enter、Escape 在默认页、搜索结果页、fallback 页行为一致。
5. **鼠标交互**：hover 选中、点击执行、pin 按钮、右键菜单、拖拽排序不互相误触。
6. **拖拽排序**：拖拽后视觉顺序和刷新后的持久化顺序一致。
7. **固定状态**：同一个 item 在 search/fallback/pinned section 中 pinned 状态一致。
8. **文本与布局**：长标题不撑破 tile，不和 pin icon 重叠；结果区域没有不合理空白或重叠。

## 错误处理

- 单个 provider 失败不影响其他 provider 的 section 返回。
- 单个 matcher 的 JSON 或 RegExp 错误按 trigger 隔离，不让整个 PluginProvider 返回空。
- session 被取消后静默丢弃后续结果，不向 renderer 发错误 toast。
- 执行过期 session 返回 `{ ok: false, error: 'Session expired' }`，renderer 不展示用户可见错误。

## 测试计划

### TypeScript / build

- `pnpm typecheck`
- `pnpm --filter @szybko/desktop build`

### Lint

先修复 `eslint.config.mjs` 中旧的 `packages/design-system/src/index.css` 路径，改为 `packages/ui-kit/src/index.css`，然后跑：

- `pnpm lint`
- `pnpm check`

### 单元测试建议

实现计划应优先补充以下 focused tests；如果继续没有测试框架，则用最小测试脚本或模块级测试覆盖同等行为：

- `SearchSession` 在 query 无命中时 fallback 到 pinned/recent。
- cancelled session 不 emit final response。
- `ITEM_EXECUTE` 同时校验 sessionId 和 queryId。
- PluginProvider 通过当前 item/match 映射执行正确 payload。
- PinnedItemRepository reorder 写回连续 sortOrder。

### 手动验收

1. 启动桌面端。
2. 空 query 查看默认页。
3. 输入一个不存在的 query，确认仍展示默认页且保留输入。
4. 快速输入多个 query，期间按 Enter 不执行旧结果。
5. 搜索并执行一个 plugin command，确认进入 payload 对应 feature。
6. pin/unpin item，确认 UI 刷新且状态一致。
7. 拖拽 pinned item，确认刷新后顺序稳定。
8. 右键固定/取消固定，确认行为正确。
9. 检查样式交互验收清单中的所有项目。

## 风险与权衡

- 不新增 `SearchResponse.mode` 会降低前端区分 fallback 的能力，但本轮需求不需要展示 fallback 标签，保持 contract 稳定更重要。
- debounce 期间保留旧 sections 会让界面更稳，但必须严格禁止旧结果执行，否则会出现误触。
- PluginProvider.resolve 需要查询投影表，默认页结果越多，resolve 成本越高。当前 pinned/recent 数量有限，可接受。
- 右键菜单动作发生在 main 侧，刷新依赖 current session snapshot。实现时需要避免在 session 已过期或已取消时重新 emit。

## 验收标准

- query 无命中时不显示“没有找到匹配结果”。
- query 无命中时展示与空 query 相同的数据来源：固定 + 最近使用。
- query 无命中时搜索框输入不被清空。
- 输入变化后的 pending 阶段不能执行旧结果。
- 旧 session provider 返回不会覆盖当前结果。
- plugin command 执行使用当前 session 的精确 match。
- pinned/recent item 在默认页和 fallback 页显示完整信息。
- pin/unpin/reorder 后 UI 与数据库状态一致。
- 前端样式和交互走查通过。
- `pnpm typecheck`、`pnpm --filter @szybko/desktop build`、`pnpm check` 通过。
