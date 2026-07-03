# InputContext 与 Matcher Pipeline 长期架构设计

## 概要

Szybko 的插件指令系统已经把静态 `plugin.json` features、动态 `setFeature/removeFeature`、以及未来 cmd 级别别名统一到 `command_trigger` 投影。下一层需要解决的是：当用户通过主搜索框、超级面板、快捷键或重定向进入时，平台如何理解当前输入环境，如何判断哪些指令可以被触发，以及如何把命中的上下文稳定传给插件的 `onPluginEnter(callback)`。

本设计引入 `InputContextSnapshot` 与 `Matcher Pipeline`。前者描述一次入口会话中可被匹配的输入材料，后者把有效 `command_trigger` 与当前输入上下文做匹配，产出可展示、可执行、可转换成插件进入事件的 `TriggerMatch`。

核心链路是：

```text
CommandTrigger + InputContextSnapshot
  -> TriggerMatch
  -> Display Candidate
  -> PluginEnterAction
  -> utools.onPluginEnter(callback)
```

## 目标

- 让 `text`、`regex`、`over`、`files`、`img`、`window` 都能用同一套逻辑匹配当前输入环境。
- 保持插件开发者的核心心智模型稳定：插件只需要处理 `onPluginEnter({ code, type, payload, option, from })`。
- 区分插件声明、输入上下文、匹配结果、展示结果和插件进入事件，避免职责混杂。
- 支持 `main`、`panel`、`hotkey`、`redirect` 多入口复用同一套 matcher 逻辑。
- 保证用户看到的候选结果和插件最终收到的 payload 来自同一次上下文快照。
- 为文件、图片、活动窗口、别名、排序、用户习惯等后续能力保留清晰扩展点。

## 非目标

- 不重新设计 feature/cmd 的持久化来源。静态 feature、动态 feature、别名仍由 Command Catalog 和 SQLite 投影体系负责。
- 不设计 AI Agent tools。
- 不在本规格中要求一次性实现所有系统上下文采集能力。长期架构覆盖 `query/text/files/img/window`，实现可以分阶段推进。
- 不把文件搜索、OCR、图片处理、窗口业务逻辑放入 matcher。matcher 只判断当前上下文是否满足插件声明。

## 总体架构

```text
                   +----------------------------+
                   | plugin.json features        |
                   | dynamic setFeature/remove   |
                   | future cmd aliases          |
                   +-------------+--------------+
                                 |
                                 v
                   +----------------------------+
                   | Command Catalog             |
                   | effective features          |
                   | command_trigger projection  |
                   +-------------+--------------+
                                 |
                                 | effective triggers
                                 v
+------------------+     +----------------------------+
| Entry Intent      |     | Input Context Snapshot      |
| main/panel/hotkey |---->| query/text/files/img/window |
| redirect          |     | source/status/errors        |
+------------------+     +-------------+--------------+
                                       |
                                       | context + triggers
                                       v
                         +----------------------------+
                         | Matcher Pipeline            |
                         | text/regex/over/files/img   |
                         | window matchers             |
                         +-------------+--------------+
                                       |
                                       | TriggerMatch[]
                                       v
                         +----------------------------+
                         | Ranking / Dedup             |
                         | priority, source weight      |
                         | conflict handling            |
                         +-------------+--------------+
                                       |
                                       | display candidates
                                       v
                         +----------------------------+
                         | SearchResult / PanelAction  |
                         | UI display only             |
                         +-------------+--------------+
                                       |
                                       | user chooses
                                       v
                         +----------------------------+
                         | Plugin Entry Resolver       |
                         | matchId -> TriggerMatch     |
                         | TriggerMatch -> EnterAction |
                         +-------------+--------------+
                                       |
                                       v
                         +----------------------------+
                         | Plugin Runtime              |
                         | onPluginEnter({             |
                         |   code,type,payload,        |
                         |   option,from               |
                         | })                          |
                         +----------------------------+
```

## 核心概念

### CommandTrigger

`CommandTrigger` 是 Command Catalog 产出的有效触发器投影。它可以来自静态 feature、动态 feature 或未来别名，但 matcher 不关心来源，只消费当前有效 trigger。

关键语义包括：

- `pluginId`
- `featureCode`
- `cmdKey`
- `source`: `feature_cmd` 或 `alias`
- `type`: `text`、`regex`、`over`、`img`、`files`、`window`
- `matcherJson`
- `label`
- `scoreBase`

### EntryIntent

`EntryIntent` 描述用户这次从哪里唤起平台，并决定 `from`：

- `main`: 主搜索框。
- `panel`: 超级面板。
- `hotkey`: 快捷键。
- `redirect`: 系统或其他插件重定向。

`from` 只表示入口渠道，不表示 payload 类型。它和 matcher 类型是正交的。

### InputContextSnapshot

`InputContextSnapshot` 是一次入口会话里的瞬时上下文快照。它回答的是：这次触发时，平台拿到了哪些可被匹配的材料。

它不是插件声明，不进数据库，也不是直接发给插件的 payload。

逻辑结构：

```text
InputContextSnapshot
  query        搜索框输入
  texts[]      文本候选
  files[]      文件/文件夹候选
  image        图片候选
  window       当前活动窗口候选
  meta         时间、入口、平台、采集状态、错误信息
```

`query` 和 `texts[]` 必须分开：

- `query` 是用户在主搜索框里输入的文本，主要服务于普通字符串指令。
- `texts[]` 是可被文本类 matcher 消费的候选文本，来源可以是 query、选中文本、剪贴板文本、拖入文本或重定向文本。

因此 `regex` 和 `over` 不应只理解成匹配搜索框文本，而应匹配 `texts[]` 中的文本候选。

### TriggerMatch

`TriggerMatch` 是 matcher pipeline 的标准输出，也是用户选择候选结果后生成插件进入事件的事实来源。

逻辑字段包括：

- `matchId`
- `pluginId`
- `featureCode`
- `cmdKey`
- `triggerType`
- `enterType`
- `label`
- `matchedSource`
- `payload`
- `from`
- `option`
- `score`
- `behavior`

`triggerType` 来自 `command_trigger.type`。`enterType` 是传给 `onPluginEnter` 的 `type`。大多数情况下两者一致，明确例外是：

```text
triggerType = files
enterType   = file
```

### PluginEnterAction

`PluginEnterAction` 是插件开发者看到的公开生命周期事件参数：

```js
{
  code,
  type,
  payload,
  option,
  from
}
```

字段语义：

- `code`: feature code，用于插件内多入口分流。
- `type`: `text`、`img`、`file`、`regex`、`over`、`window`。
- `payload`: 本次命中的输入数据。
- `option`: 用户选择的附加入口选项。
- `from`: `main`、`panel`、`hotkey`、`redirect`。

插件不需要理解 `InputContextSnapshot`、`CommandTrigger`、投影表或 matcher pipeline。

## InputContext 通道

### query

`query` 是搜索框文本。它主要用于：

- 精确匹配字符串 cmd。
- 作为一个文本候选进入 `texts[]`，供 `regex` 和 `over` 使用。

### texts

`texts[]` 表示可被文本类 matcher 消费的文本候选。每个候选都应保留来源，例如：

- `query`
- `selectedText`
- `clipboardText`
- `draggedText`
- `redirectPayload`

文本候选可以为空。某个来源采集失败不应影响其他来源。

### files

`files[]` 表示当前上下文已有的文件或文件夹集合。它服务于 `files` cmd。

`files` cmd 不负责搜索磁盘，也不代表文件搜索功能。它只判断当前输入上下文里的文件集合是否满足插件声明。

### image

`image` 表示当前上下文中存在图片输入。它服务于 `img` cmd。

搜索和匹配阶段不应把大图内容直接塞入搜索结果或数据库。平台可以持有短生命周期引用，并在插件进入时转换成合适的 payload。

### window

`window` 表示当前活动窗口元信息。它服务于 `window` cmd。

逻辑字段包括：

- app 或进程名。
- title。
- class，主要用于 Windows。
- pid。
- platform。

平台不支持或权限不足时，`window` 通道应标记为不可用，而不是生成假命中。

## Matcher 语义

### text

字符串 cmd 被投影成 `text` trigger。

消费：

```text
InputContextSnapshot.query
```

命中条件：

```text
normalized(query) == normalized(command text)
```

进入插件：

```js
{
  code,
  type: "text",
  payload: query,
  from
}
```

### regex

消费：

```text
InputContextSnapshot.texts[]
```

命中条件：

- 文本满足 `match` 正则。
- 满足 `minLength` 和 `maxLength`。
- 正则配置有效。

进入插件：

```js
{
  code,
  type: "regex",
  payload: matchedText,
  from
}
```

### over

消费：

```text
InputContextSnapshot.texts[]
```

命中条件：

- 存在文本候选。
- 满足 `minLength` 和 `maxLength`。
- 不被 `exclude` 正则排除。

进入插件：

```js
{
  code,
  type: "over",
  payload: text,
  from
}
```

`over` 覆盖面最大，排序时应比显式文本指令和结构化 regex 更保守。

### files

消费：

```text
InputContextSnapshot.files[]
```

命中条件：

- 文件集合存在。
- 满足 `fileType`。
- 满足 `extensions` 或文件名 `match`。
- 满足 `minLength` 和 `maxLength`。

进入插件：

```js
{
  code,
  type: "file",
  payload: matchFiles,
  from
}
```

注意配置类型是 `files`，插件进入事件类型是 `file`。

### img

消费：

```text
InputContextSnapshot.image
```

命中条件：

```text
存在有效图片输入
```

进入插件：

```js
{
  code,
  type: "img",
  payload: imagePayload,
  from
}
```

图片识别、OCR、压缩和业务处理属于插件进入后的逻辑，不属于 matcher。

### window

消费：

```text
InputContextSnapshot.window
```

命中条件：

- 活动窗口存在。
- `app` 命中。
- 如果声明了 `title`，窗口标题满足正则。
- 如果声明了 `class`，窗口类名命中。该字段主要用于 Windows。

进入插件：

```js
{
  code,
  type: "window",
  payload: matchWindow,
  from
}
```

## Matcher Pipeline

Matcher Pipeline 的职责是：

```text
拿一批 command_trigger
拿一个 InputContextSnapshot
判断哪些 trigger 命中
产出 TriggerMatch[]
```

它不负责：

- 读取 `plugin.json`。
- 写 SQLite。
- 采集剪贴板、窗口、文件或图片。
- 打开插件窗口。
- 派发 `onPluginEnter`。
- 决定插件 UI 路由。
- 把完整 `InputContextSnapshot` 暴露给插件。

Pipeline 逻辑分为三步：

```text
Candidate Selection
  -> Type Matcher
  -> Match Normalization
```

### Candidate Selection

根据上下文里存在的通道，筛选需要运行的 trigger 类型：

- 有 `query` 时，`text`、`regex`、`over` 可能需要运行。
- 有 `texts[]` 时，`regex`、`over` 可能需要运行。
- 有 `files[]` 时，`files` 可能需要运行。
- 有 `image` 时，`img` 可能需要运行。
- 有 `window` 时，`window` 可能需要运行。

### Type Matcher

每类 matcher 只消费自己关心的上下文通道，并按各自语义判断是否命中。

### Match Normalization

所有 matcher 的输出都必须统一成 `TriggerMatch`，这样后续展示、排序、执行不需要知道 matcher 内部差异。

## MatchSession 与展示结果

搜索结果或面板动作只是 UI 展示投影，不是最终事实。最终事实是 `TriggerMatch`。

一次入口会话应有短生命周期的 `MatchSession`：

```text
MatchSession
  sessionId / queryId
  inputContextSnapshot
  triggerMatches
  expiresAt
```

展示结果只携带必要的显示信息和内部引用：

```text
SearchResult / PanelAction
  title
  subtitle
  icon
  score
  action(pluginId, featureCode, matchId)
```

用户选择结果后，平台通过 `matchId` 找回 `TriggerMatch`，再生成 `PluginEnterAction`。如果 `matchId` 过期或丢失，应明确失败并要求用户重新触发，不能重新读取剪贴板或活动窗口再匹配一次。

这样可以保证：

```text
用户看到的候选结果
和插件收到的 payload
来自同一次上下文快照
```

## Ranking 与去重

Matcher 只判断是否命中，不决定最终展示顺序。排序和去重由独立层处理。

默认优先级建议是：

```text
text exact
  > regex
  > files/img/window
  > over
```

原因：

- `text exact` 是用户显式输入指令。
- `regex` 是结构化文本输入。
- `files/img/window` 是上下文动作，依赖入口和采集来源。
- `over` 覆盖面最大，应避免淹没其他结果。

去重不能只按 `pluginId + featureCode`。更合理的展示去重 key 是：

```text
pluginId + featureCode + cmdKey + payloadFingerprint
```

同一个 trigger 因多个来源命中同一 payload 时，可以合并展示并保留更优来源。不同 trigger 即使命中同一个 feature，也可能代表不同动作，不能过度合并。

不同插件声明相同文本指令时，系统不应拒绝安装，也不应只保留一个。它们都可以展示，由排序和用户行为决定优先级。

## mainPush、mainHide 与 option

`mainPush`、`mainHide` 和 `option` 不属于 matcher 语义。它们影响命中后的进入行为和展示行为。

### mainHide

`mainHide` 影响平台窗口行为，不影响是否命中。

它应作为内部 entry behavior 消费：

```text
TriggerMatch
  -> EntryBehavior(mainHide)
  -> PluginEnterAction
```

插件仍然收到正常的 `code/type/payload/from`。

### mainPush

`mainPush` 更像插件或平台向主搜索框推送入口选项的能力。它不应污染基础 cmd 匹配。

语义上：

```text
payload = 被处理的数据
option  = 用户选择的处理方式或入口选项
```

例如用户输入文本后，翻译插件可以提供多个 option。用户选择其中一个时，插件收到同一个 payload 和不同 option。

## 别名关系

别名是 cmd 级别能力。一个原始 cmd 可以有多个 alias trigger。

别名进入 matcher pipeline 后仍然是 trigger，matcher 不需要特殊理解别名表。区别体现在：

```text
source = alias
targetCmdKey = 原始 cmd
```

文本别名触发的是额外入口，不应伪造原始 matcher payload。

例如一个 regex cmd 的文本别名被用户输入命中时，更合理的进入事件是：

```js
{
  code,
  type: "text",
  payload: aliasText,
  from: "main"
}
```

而不是伪造：

```js
{
  type: "regex",
  payload: unknown
}
```

如果动态 feature 替换后原始 `targetCmdKey` 不再存在，别名事实可以继续保留，但不应投影成有效 alias trigger。

## 错误、权限与降级

上下文采集允许部分失败。某个通道不可用不应导致整个搜索失败。

例如：

```text
query available
clipboardText permission-denied
files empty
image unsupported
window available
```

此时平台仍可运行依赖 query 和 window 的 matcher，剪贴板、文件、图片相关 trigger 不产生结果。

`InputContextSnapshot` 应记录每个通道的采集状态，供日志、调试和开发者工具使用。普通搜索结果不需要展示完整诊断。

隐私原则：

- 搜索阶段不把完整敏感 payload 暴露给 renderer。
- 剪贴板文本可用于匹配，但展示时只显示必要摘要。
- 文件可以展示数量或文件名摘要，完整路径只在插件进入时给目标插件。
- 图片不进入搜索结果，只保留短生命周期引用。
- 活动窗口信息只在必要时摘要展示。

插件只有在用户选择了某个候选结果后，才收到该结果对应的 payload。

## 典型流程

### 主搜索框文本指令

```text
from = main
query = "功能指令"
text trigger 命中
用户选择
onPluginEnter({ code, type: "text", payload: "功能指令", from: "main" })
```

### URL 正则匹配

```text
from = main
texts[] 包含 query "https://example.com"
regex trigger 命中
用户选择
onPluginEnter({ code, type: "regex", payload: "https://example.com", from: "main" })
```

### 超级面板处理选中文本

```text
from = panel
texts[] 包含 selectedText
over trigger 命中
用户选择
onPluginEnter({ code, type: "over", payload: selectedText, from: "panel" })
```

### 文件批处理

```text
from = panel
files[] 包含当前文件集合
files trigger 命中
用户选择
onPluginEnter({ code, type: "file", payload: MatchFile[], from: "panel" })
```

### 活动窗口动作

```text
from = hotkey
window 包含当前活动窗口
window trigger 命中
用户选择或直接进入
onPluginEnter({ code, type: "window", payload: MatchWindow, from: "hotkey" })
```

## 和现有指令目录的边界

Command Catalog 负责：

```text
静态 feature + 动态 feature + alias
  -> effective feature
  -> command_trigger
```

InputContext 与 Matcher Pipeline 负责：

```text
command_trigger + 当前输入上下文
  -> TriggerMatch
```

Plugin Entry Resolver 负责：

```text
TriggerMatch
  -> PluginEnterAction
  -> onPluginEnter
```

这三层不能互相越界。Command Catalog 不采集上下文，Matcher Pipeline 不写持久化，Plugin Runtime 不重新解释 matcher。

## 分阶段落地边界

长期架构覆盖所有通道，但实现可以按阶段推进：

1. 建立 `InputContextSnapshot`、`TriggerMatch`、`MatchSession` 和 `PluginEnterAction` 的共享语义。
2. 支持 `query`、`texts[]`、`text`、`regex`、`over`，让文本类 matcher 先闭环。
3. 接入 `files`、`img`、`window` 的上下文通道和 matcher。
4. 接入 `panel`、`hotkey`、`redirect` 等更多入口。
5. 接入别名、用户习惯排序、诊断视图和更细粒度权限控制。

每个阶段都必须保持同一条核心链路：

```text
CommandTrigger + InputContextSnapshot
  -> TriggerMatch
  -> Display Candidate
  -> PluginEnterAction
```
