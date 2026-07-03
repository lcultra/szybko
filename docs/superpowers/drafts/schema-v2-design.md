# Schema v2 — 指令目录表结构设计（定稿）

## 设计原则

- **投影表和用户状态表生命周期分离**：pinned/history 在插件卸载时级联清理，但不受投影重建影响
- **别名有独立的事实表**：`command_trigger_search` 只是投影，alias 的管理在 `command_alias`
- **保持 manifest 语义**：一条 cmd = 一个 trigger，别名走单独机制
- **搜索入口归一化**：所有 `search_text` 统一 NFKC + trim + lowercase
- **别名只支持 text 类型**：投影阶段过滤，目标 trigger 不存在或非 text 时跳过，不靠运行时兜底

---

## 10 张表，分三层

### 核心（Core — 事实来源）

#### 1. plugin_installation （不变）

插件安装和启禁用状态。

#### 2. feature_override （不变）

动态 feature 注册/移除，FK → plugin_installation。

#### 3. command_alias （新增）

别名事实表。每个 alias 是一个独立记录，支持启用/停用。

```sql
CREATE TABLE command_alias (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id         TEXT NOT NULL,
  feature_code      TEXT NOT NULL,
  alias_key         TEXT NOT NULL CHECK (length(trim(alias_key)) > 0),
  alias_normalized  TEXT NOT NULL CHECK (length(trim(alias_normalized)) > 0),
  target_cmd_key    TEXT NOT NULL,
  state             TEXT NOT NULL CHECK (state IN ('active', 'removed')) DEFAULT 'active',
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_ca_active_unique
  ON command_alias(plugin_id, feature_code, alias_normalized) WHERE state = 'active';

CREATE INDEX idx_ca_lookup ON command_alias(plugin_id, feature_code);
```

`alias_normalized` 须经 NFKC + trim + lowercase 处理，确保唯一约束稳定。

### 投影层（重建时全量替换，无用户状态依赖）

#### 4. manifest_feature_snapshot （不变）

#### 5. effective_feature （不变）

FK → plugin_installation。

#### 6. command_trigger （改自 command_trigger）

trigger 定义。删掉 `source`、`normalized_key`、`alias_id`、`target_cmd_key`。

```sql
CREATE TABLE command_trigger (
  plugin_id       TEXT NOT NULL,
  feature_code    TEXT NOT NULL,
  cmd_key         TEXT NOT NULL,
  trigger_index   INTEGER NOT NULL CHECK (trigger_index >= 0),
  type            TEXT NOT NULL CHECK (type IN ('text','regex','over','img','files','window')),
  label           TEXT,
  matcher_json    TEXT NOT NULL CHECK (json_valid(matcher_json)),
  score_base      INTEGER NOT NULL DEFAULT 90,
  rebuilt_at      INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, feature_code, cmd_key),
  FOREIGN KEY (plugin_id, feature_code) REFERENCES effective_feature(plugin_id, code) ON DELETE CASCADE
);

CREATE INDEX idx_ct_type ON command_trigger(type);
```

#### 7. command_trigger_search （新增，替代 current normalized_key）

每个 text trigger 展开成多个搜索入口。alias 也投影于此。

```sql
CREATE TABLE command_trigger_search (
  plugin_id       TEXT NOT NULL,
  feature_code    TEXT NOT NULL,
  cmd_key         TEXT NOT NULL,
  search_text     TEXT NOT NULL CHECK (length(trim(search_text)) > 0),
  source          TEXT NOT NULL CHECK (source IN ('cmd', 'alias')),
  match_level     INTEGER NOT NULL CHECK (match_level IN (1, 2, 3)),
  alias_id        INTEGER CHECK (
    (source = 'cmd'   AND alias_id IS NULL) OR
    (source = 'alias' AND alias_id IS NOT NULL)
  ),
  PRIMARY KEY (plugin_id, feature_code, cmd_key, search_text),
  FOREIGN KEY (plugin_id, feature_code, cmd_key) REFERENCES command_trigger(plugin_id, feature_code, cmd_key) ON DELETE CASCADE
);

CREATE INDEX idx_cts_lookup ON command_trigger_search(search_text);
```

**3 种 match_level：**
- `3` = 原文精确（"锁屏" match "锁屏"）
- `2` = 全拼（"锁屏" → "suoping"）
- `1` = 首字母缩写（"锁屏" → "sp"）

**PK 冲突策略：** 展开同一条 trigger 时可能出现相同的 `search_text`，按以下优先级保留唯一行：

1. `source='cmd'` 优先于 `source='alias'`
2. `match_level` 高者优先
3. tie-break：`alias_id` 小者优先（创建更早）

#### 8. command_projection_meta （不变）

### 用户状态层（插件卸载时级联清理，投影重建不影响）

#### 9. pinned_trigger （新增）

```sql
CREATE TABLE pinned_trigger (
  plugin_id       TEXT NOT NULL,
  feature_code    TEXT NOT NULL,
  cmd_key         TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  pinned_at       INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, feature_code, cmd_key),
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);
```

#### 10. usage_history （新增）

```sql
CREATE TABLE usage_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id       TEXT NOT NULL,
  feature_code    TEXT NOT NULL,
  cmd_key         TEXT NOT NULL,
  query           TEXT,
  match_level     INTEGER,
  selected_at     INTEGER NOT NULL,
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);

CREATE INDEX idx_uh_lookup ON usage_history(plugin_id, feature_code, cmd_key, selected_at DESC);
```

---

## cmds 语义

```json
{ "code": "lock", "cmds": ["锁屏", "lock"] }
```

每条 cmd 展开为一个独立的 `command_trigger`，各自展开 `command_trigger_search` 行：

```
command_trigger:
  ("plugin", "lock", cmdKey_锁屏, type='text', ...)
  ("plugin", "lock", cmdKey_lock, type='text', ...)

command_trigger_search:
  ("plugin", "lock", cmdKey_锁屏, "锁屏",   source='cmd', match_level=3, alias_id=NULL)
  ("plugin", "lock", cmdKey_锁屏, "suoping", source='cmd', match_level=2, alias_id=NULL)
  ("plugin", "lock", cmdKey_锁屏, "sp",      source='cmd', match_level=1, alias_id=NULL)
  ("plugin", "lock", cmdKey_lock, "lock",    source='cmd', match_level=3, alias_id=NULL)
```

---

## 别名语义

### 声明

```sql
-- 用户/插件声明 alias
INSERT INTO command_alias (plugin_id, feature_code, alias_normalized, target_cmd_key, state, ...)
VALUES ('plugin', 'lock', 'suo', cmdKey_锁屏, 'active', ...);
```

### 投影规则（text-only 过滤）

投影构建时，遍历 `command_alias WHERE state = 'active'`，**只有 target trigger 存在且 type='text' 时才写入 `command_trigger_search`**：

```
target_cmd_key 对应的 command_trigger 存在且 type='text'？
  → 是：写入 command_trigger_search
    source='alias', alias_id=当前 alias.id
    以 alias_normalized 为原文展开后面拼音/缩写
  → 否：跳过，不投影
```

这样保证了 `command_trigger_search` 中所有 `source='alias'` 的行 JOIN `command_trigger` 后得到的 type 一定是 `text`。运行时不需要额外过滤。

展开示例：

```
command_alias:
  id=1, alias_normalized="suo", target_cmd_key=cmdKey_锁屏, state='active'

投影到 command_trigger_search:
  ("plugin", "lock", cmdKey_锁屏, "suo",    source='alias', match_level=3, alias_id=1)
  ("plugin", "lock", cmdKey_锁屏, "suoqp",  source='alias', match_level=2, alias_id=1)
  ("plugin", "lock", cmdKey_锁屏, "sqp",    source='alias', match_level=1, alias_id=1)
```

### 停用 alias

```
command_alias SET state='removed' → 投影重建后 command_trigger_search 对应行消失
```

---

## 搜索查询流程

### 步骤 1：归一化用户输入

```typescript
const normalizedQuery = normalizeTextKey(query);
// trim → NFKC → toLocaleLowerCase
```

### 步骤 2：text 匹配（核心搜索路径）

```sql
SELECT cts.*, ct.type, ct.label, ct.matcher_json, ct.score_base
FROM command_trigger_search cts
INNER JOIN command_trigger ct USING (plugin_id, feature_code, cmd_key)
INNER JOIN plugin_installation pi USING (plugin_id)
WHERE cts.search_text = ?
  AND pi.enabled = 1
ORDER BY cts.match_level DESC, ct.score_base DESC, ct.trigger_index ASC;
```

参数 `?` = `normalizedQuery`。

返回 `TriggerSearchRow`（含 `match_level`）：
- `match_level = 3` → score += 10（精确）
- `match_level = 2` → score += 5（全拼）
- `match_level = 1` → score += 2（缩写）

直接产 `TriggerMatch[]`。不再走旧 `TextMatcher` + `normalized_key`。

### 步骤 3：非 text 匹配（保持现有路径）

```sql
listTriggersByType(['regex', 'over', 'files', 'img', 'window'])
```

→ JS matcher 逐个匹配（RegexMatcher, OverMatcher, ...）。不受搜索层变更影响。

### 步骤 4：合并、排序、去重 → 展示

---

## 投影重建流程

```
indexPlugin / rebuildPluginWithRepositories（事务内）：
  → 查询 plugin_installation 获取 manifestHash 等
  → 合并 manifest_features + active overrides → effective_features
  → 写入 effective_feature（DELETE + INSERT）
  → 写入 command_trigger（DELETE + INSERT）
  → 写入 command_trigger_search（DELETE + INSERT）
    → 每个 cmds 展开：原文(match_level=3) + 全拼(match_level=2) + 缩写(match_level=1)
    → 合并 active aliases（from command_alias WHERE state='active'）
      → 仅当 target trigger 存在且 type='text' 时才投影
    → 同 search_text 按冲突优先级去重
  → 写入 projection_meta
```

全部在一个事务内。`pinned_trigger` 和 `usage_history` 不在该事务中，投影重建不影响。

---

## 用户状态表如何与投影协作

用户状态表（`pinned_trigger`, `usage_history`）有 FK → `plugin_installation`：
- **插件卸载时**：级联清理，数据随插件一起删除
- **投影重建时**：不受影响，因为根本不引用投影表

查询时必须 JOIN 当前有效的 `command_trigger` 和 `plugin_installation` 过滤失效项：

```sql
-- 固定项
SELECT t.*, p.sort_order
FROM pinned_trigger p
INNER JOIN command_trigger t USING (plugin_id, feature_code, cmd_key)
INNER JOIN plugin_installation pi ON pi.plugin_id = p.plugin_id
WHERE pi.enabled = 1
ORDER BY p.sort_order;

-- 使用历史（聚合，只计当前有效 trigger）
SELECT h.plugin_id, h.feature_code, h.cmd_key,
       COUNT(*) AS freq, MAX(h.selected_at) AS last_used
FROM usage_history h
INNER JOIN command_trigger t USING (plugin_id, feature_code, cmd_key)
INNER JOIN plugin_installation pi ON pi.plugin_id = h.plugin_id
WHERE pi.enabled = 1
GROUP BY h.plugin_id, h.feature_code, h.cmd_key;
```

trigger 被 feature 移除或插件被禁用时，`INNER JOIN` 自动过滤。用户数据**不因投影重建而丢失**（只会在插件卸载时级联清理）。
