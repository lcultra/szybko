# Schema v2 + 拼音搜索 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构指令目录表结构，拆分 trigger 定义表与搜索索引表，引入拼音/缩写搜索、别名事实表、以及用户状态表（固定/历史），同时重构 text 匹配路径使其走 SQL 查询而非 JS。

**Architecture:** 10 张表分三层（core/projection/user-state）。投影重建时各层各自处理。搜索路径拆为两条：text 走 `command_trigger_search` SQL 查询，非 text 保持 JS matcher。TextMatcher 被移除，其职责由 SQL 查询 + match_level 排序替代。

**Tech Stack:** drizzle-orm + node:sqlite + pinyin-pro（新增）

## Global Constraints

- 表名不用 `trigger`（SQLite 关键字），继续用 `command_trigger`
- 用户状态表（`pinned_trigger`, `usage_history`）FK → `plugin_installation`，引用 projection 表时只靠运行时 JOIN
- 别名投影阶段过滤：只有 target trigger 存在且 `type='text'` 时才写入 `command_trigger_search`
- 所有 `search_text` 统一 NFKC + trim + lowercase
- 一条 cmd = 一个 trigger，别名不创建新 trigger
- 投影重建同一事务内完成；用户状态表不在该事务中

---

## File Structure

### 修改的文件

| 文件 | 改动 |
|---|---|
| `packages/host/package.json` | ＋ `pinyin-pro` |
| `packages/host/src/persistence/sqlite/schema.ts` | Drizzle 定义更新：command_trigger 删减字段、3 张新表 |
| `packages/host/src/persistence/sqlite/platform-database.ts` | `createSchema()` DDL 更新 + migration |
| `packages/host/src/commands/feature-normalizer.ts` | ＋ `computePinyin()` |
| `packages/host/src/commands/command-projection-builder.ts` | ＋ search rows 展开、新返回类型 |
| `packages/host/src/persistence/sqlite/repositories/command-projection-repository.ts` | ＋ `searchByText()`、`replaceForPlugin` 增加 search 写入、删除 `matchTextCommand()` |
| `packages/host/src/commands/command-catalog.ts` | 投影重建增加 aliases 来源、增加搜索行写入、INDEX_VERSION 提升 |
| `packages/host/src/input/matchers/text-matcher.ts` | 删除（职责由 searchByText SQL 替代） |
| `packages/host/src/input/matcher-pipeline.ts` | 删除 TextMatcher 引用、简化 |
| `packages/host/src/ipc/register-handlers.ts` | SEARCH_QUERY handler 改用 `searchByText` + pipeline 两组结果 |
| `packages/host/src/runtime/runtime-coordinator.ts` | 没有改动（确认） |
| `packages/host/src/index.ts` | 导出新增 repo（如有必要） |

### 新增的文件

| 文件 | 职责 |
|---|---|
| `packages/host/src/persistence/sqlite/repositories/pinned-trigger-repository.ts` | 固定项 CRUD + 查询 |
| `packages/host/src/persistence/sqlite/repositories/usage-history-repository.ts` | 使用历史写入 + 聚合查询 |

---

### Task 1: 添加 pinyin-pro 依赖

**Files:**
- Modify: `packages/host/package.json`

```diff
  "dependencies": {
    "@szybko/core-rust": "workspace:*",
    "@szybko/shared": "workspace:*",
+   "pinyin-pro": "^3.26.0",
    "drizzle-orm": "1.0.0-rc.4-5d5b77c"
  }
```

- [ ] **Step 1: 添加依赖**

```bash
pnpm add --filter @szybko/host pinyin-pro
```

- [ ] **Step 2: 验证安装**

```bash
pnpm ls -r --depth 0 | grep pinyin-pro
```

预期输出包含 `pinyin-pro`.

- [ ] **Step 3: 提交**

```bash
git add packages/host/package.json pnpm-lock.yaml
git commit -m "build: add pinyin-pro dependency"
```

---

### Task 2: Schema 定义更新（Drizzle DDL）

**Files:**
- Modify: `packages/host/src/persistence/sqlite/schema.ts`
- Modify: `packages/host/src/persistence/sqlite/platform-database.ts`

**DDL 变更汇总：**

`command_trigger` 表：
- 删字段：`source`, `normalized_key`, `alias_id`, `target_cmd_key`
- 删 CHECK 约束（关联 source/alias/normalized_key 的行级约束不再需要）
- 删索引：`idx_command_trigger_text_lookup`, `idx_command_trigger_target_cmd`
- PK 从 `(plugin_id, feature_code, source, cmd_key)` 改为 `(plugin_id, feature_code, cmd_key)`

新增 4 张表：
- `command_trigger_search`
- `command_alias`
- `pinned_trigger`
- `usage_history`

- [ ] **Step 1: 更新 `schema.ts`**

```typescript
// 文件：packages/host/src/persistence/sqlite/schema.ts

// command_trigger — 删减后的新版
export const commandTrigger = sqliteTable('command_trigger', {
    pluginId: text('plugin_id').notNull(),
    featureCode: text('feature_code').notNull(),
    cmdKey: text('cmd_key').notNull(),
    triggerIndex: integer('trigger_index').notNull(),
    type: text('type', { enum: ['text', 'regex', 'over', 'img', 'files', 'window'] }).notNull(),
    label: text('label'),
    matcherJson: text('matcher_json').notNull(),
    scoreBase: integer('score_base').notNull().default(90),
    rebuiltAt: integer('rebuilt_at').notNull(),
}, table => ({
    pk: primaryKey({ columns: [table.pluginId, table.featureCode, table.cmdKey] }),
    typeIdx: index('idx_ct_type').on(table.type),
}));

// command_trigger_search — 新增
export const commandTriggerSearch = sqliteTable('command_trigger_search', {
    pluginId: text('plugin_id').notNull(),
    featureCode: text('feature_code').notNull(),
    cmdKey: text('cmd_key').notNull(),
    searchText: text('search_text').notNull(),
    source: text('source', { enum: ['cmd', 'alias'] }).notNull(),
    matchLevel: integer('match_level').notNull(),
    aliasId: integer('alias_id'),
}, table => ({
    pk: primaryKey({ columns: [table.pluginId, table.featureCode, table.cmdKey, table.searchText] }),
    lookupIdx: index('idx_cts_lookup').on(table.searchText),
}));

// command_alias — 新增
export const commandAlias = sqliteTable('command_alias', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pluginId: text('plugin_id').notNull(),
    featureCode: text('feature_code').notNull(),
    aliasKey: text('alias_key').notNull(),
    aliasNormalized: text('alias_normalized').notNull(),
    targetCmdKey: text('target_cmd_key').notNull(),
    state: text('state', { enum: ['active', 'removed'] }).notNull().default('active'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
}, table => ({
    pluginFk: foreignKey({ columns: [table.pluginId], foreignColumns: [pluginInstallation.pluginId] }).onDelete('cascade'),
    activeUnique: uniqueIndex('idx_ca_active_unique').on(table.pluginId, table.featureCode, table.aliasNormalized).where(eq(table.state, 'active')),
    lookupIdx: index('idx_ca_lookup').on(table.pluginId, table.featureCode),
}));

// pinned_trigger — 新增
export const pinnedTrigger = sqliteTable('pinned_trigger', {
    pluginId: text('plugin_id').notNull(),
    featureCode: text('feature_code').notNull(),
    cmdKey: text('cmd_key').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    pinnedAt: integer('pinned_at').notNull(),
}, table => ({
    pk: primaryKey({ columns: [table.pluginId, table.featureCode, table.cmdKey] }),
    pluginFk: foreignKey({ columns: [table.pluginId], foreignColumns: [pluginInstallation.pluginId] }).onDelete('cascade'),
}));

// usage_history — 新增
export const usageHistory = sqliteTable('usage_history', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pluginId: text('plugin_id').notNull(),
    featureCode: text('feature_code').notNull(),
    cmdKey: text('cmd_key').notNull(),
    query: text('query'),
    matchLevel: integer('match_level'),
    selectedAt: integer('selected_at').notNull(),
}, table => ({
    pluginFk: foreignKey({ columns: [table.pluginId], foreignColumns: [pluginInstallation.pluginId] }).onDelete('cascade'),
    lookupIdx: index('idx_uh_lookup').on(table.pluginId, table.featureCode, table.cmdKey, table.selectedAt),
}));

// 保留但不变的：pluginInstallation, manifestFeatureSnapshot, featureOverride, effectiveFeature, commandProjectionMeta
```

- [ ] **Step 2: 更新 `platform-database.ts` 的 `createSchema()` DDL**

把新的 SQL DDL 加入 `createSchema()`。新数据库直接创建完整结构。DDL 完整脚本包含：

```sql
-- 1. 删除旧索引（如果存在）（v1 → v2 迁移）
DROP INDEX IF EXISTS idx_command_trigger_text_lookup;
DROP INDEX IF EXISTS idx_command_trigger_target_cmd;

-- 2. 新 command_trigger 表（CREATE TABLE IF NOT EXISTS — 如果已有 v1 表则不覆盖）
--    迁移策略见下一步
CREATE TABLE IF NOT EXISTS command_trigger_v2 (
  plugin_id       TEXT NOT NULL,
  feature_code    TEXT NOT NULL,
  cmd_key         TEXT NOT NULL,
  trigger_index   INTEGER NOT NULL CHECK (trigger_index >= 0),
  type            TEXT NOT NULL CHECK (type IN ('text','regex','over','img','files','window')),
  label           TEXT,
  matcher_json    TEXT NOT NULL CHECK (json_valid(matcher_json)),
  score_base      INTEGER NOT NULL DEFAULT 90,
  rebuilt_at      INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, feature_code, cmd_key)
);

-- 3. 新增表
CREATE TABLE IF NOT EXISTS command_trigger_search (
  plugin_id       TEXT NOT NULL,
  feature_code    TEXT NOT NULL,
  cmd_key         TEXT NOT NULL,
  search_text     TEXT NOT NULL CHECK (length(trim(search_text)) > 0),
  source          TEXT NOT NULL CHECK (source IN ('cmd', 'alias')),
  match_level     INTEGER NOT NULL CHECK (match_level IN (1, 2, 3)),
  alias_id        INTEGER,
  PRIMARY KEY (plugin_id, feature_code, cmd_key, search_text)
);
CREATE INDEX IF NOT EXISTS idx_cts_lookup ON command_trigger_search(search_text);

CREATE TABLE IF NOT EXISTS command_alias (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id         TEXT NOT NULL,
  feature_code      TEXT NOT NULL,
  alias_key         TEXT NOT NULL,
  alias_normalized  TEXT NOT NULL,
  target_cmd_key    TEXT NOT NULL,
  state             TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'removed')),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_active_unique
  ON command_alias(plugin_id, feature_code, alias_normalized) WHERE state = 'active';
CREATE INDEX IF NOT EXISTS idx_ca_lookup ON command_alias(plugin_id, feature_code);

CREATE TABLE IF NOT EXISTS pinned_trigger (
  plugin_id       TEXT NOT NULL,
  feature_code    TEXT NOT NULL,
  cmd_key         TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  pinned_at       INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, feature_code, cmd_key),
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS usage_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id       TEXT NOT NULL,
  feature_code    TEXT NOT NULL,
  cmd_key         TEXT NOT NULL,
  query           TEXT,
  match_level     INTEGER,
  selected_at     INTEGER NOT NULL,
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_uh_lookup ON usage_history(plugin_id, feature_code, cmd_key, selected_at DESC);
```

- [ ] **Step 3: migration 处理**

新增 `migrateSchema(sqlite)` 函数，在 `createSchema()` **之后**调用。逻辑：

```typescript
function migrateSchema(sqlite: DatabaseSync): void {
    // 检测旧 command_trigger 是否有 source 列（v1 特征）
    const cols = sqlite.prepare("PRAGMA table_info('command_trigger')").all() as { name: string }[];
    const hasSource = cols.some(c => c.name === 'source');

    if (hasSource) {
        // 旧表存在且有 v1 特征列：
        // 1. 创建 v2 表（command_trigger_v2 在 createSchema 中已建）
        // 2. 迁移数据
        sqlite.exec(`
            INSERT OR IGNORE INTO command_trigger_v2 (
                plugin_id, feature_code, cmd_key, trigger_index,
                type, label, matcher_json, score_base, rebuilt_at
            )
            SELECT plugin_id, feature_code, cmd_key, trigger_index,
                   type, label, matcher_json, score_base, rebuilt_at
            FROM command_trigger;
        `);
        // 3. 删除旧表
        sqlite.exec(`DROP TABLE IF EXISTS command_trigger;`);
        // 4. 重命名 v2 为 command_trigger
        sqlite.exec(`ALTER TABLE command_trigger_v2 RENAME TO command_trigger;`);
    }
}
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm run typecheck
```

预期：9 packages, all pass.

- [ ] **Step 5: 提交**

```bash
git add packages/host/src/persistence/sqlite/
git commit -m "feat: update schema v2 — split trigger + search, add alias/pinned/history tables"
```

---

### Task 3: Feature Normalizer — 拼音计算

**Files:**
- Modify: `packages/host/src/commands/feature-normalizer.ts`

新增 `computePinyin` 函数，使用 `pinyin-pro`：

- [ ] **Step 1: 实现 `computePinyin()`**

```typescript
import { pinyin } from 'pinyin-pro';

export interface PinyinResult {
    /** 全拼，不含声调，空格分隔多音字首选项。例："suoping" */
    full: string;
    /** 首字母。例："sp" */
    initials: string;
}

export function computePinyin(text: string): PinyinResult {
    // pinyin-pro 的 pinyin() 默认返回带声调拼音，用 toneType: 'none' 去掉声调
    // type: 'array' 返回数组，按字分割
    const chars = pinyin(text, { toneType: 'none', type: 'array' });
    const full = chars.map(c => c.trim()).filter(Boolean).join('').toLocaleLowerCase();
    const initials = chars.map(c => (c.trim() ? c.trim()[0]! : '')).filter(Boolean).join('').toLocaleLowerCase();
    return { full, initials };
}
```

- [ ] **Step 2: 单元验证**

```typescript
// 预期行为
computePinyin('锁屏') // → { full: 'suoping', initials: 'sp' }
computePinyin('中国') // → { full: 'zhongguo', initials: 'zg' }
computePinyin('lock') // → { full: 'lock', initials: 'l' } // 非中文原样返回
```

- [ ] **Step 3: 提交**

```bash
git add packages/host/src/commands/feature-normalizer.ts
git commit -m "feat: add pinyin computation for Chinese text search"
```

---

### Task 4: Projection Builder — 搜索行展开

**Files:**
- Modify: `packages/host/src/commands/command-projection-builder.ts`

`buildCommandProjection` 的输出增加 `commandTriggerSearch` 数组。

**新增类型：**

```typescript
export interface CommandTriggerSearchProjection {
    pluginId: string;
    featureCode: string;
    cmdKey: string;
    searchText: string;
    source: 'cmd' | 'alias';
    matchLevel: 1 | 2 | 3;
    aliasId: number | null;
}

export interface CommandProjection {
    effectiveFeatures: EffectiveFeatureProjection[];
    commandTriggers: CommandTriggerProjection[];
    commandTriggerSearch: CommandTriggerSearchProjection[];  // 新增
    meta: { ... };
}
```

**核心函数：展开 text trigger 为搜索行**

```typescript
function buildSearchEntries(
    pluginId: string,
    featureCode: string,
    cmdKey: string,
    text: string,
    source: 'cmd' | 'alias',
    aliasId: number | null,
): CommandTriggerSearchProjection[] {
    const normalized = normalizeTextKey(text);
    if (!normalized) return [];

    const entries: CommandTriggerSearchProjection[] = [];

    // 原文精确
    entries.push({ pluginId, featureCode, cmdKey, searchText: normalized, source, matchLevel: 3, aliasId });

    // 全拼 + 缩写
    const pinyins = computePinyin(normalized);
    if (pinyins.full && pinyins.full !== normalized) {
        entries.push({ pluginId, featureCode, cmdKey, searchText: pinyins.full, source, matchLevel: 2, aliasId });
    }
    if (pinyins.initials && pinyins.initials !== normalized && pinyins.initials !== pinyins.full) {
        entries.push({ pluginId, featureCode, cmdKey, searchText: pinyins.initials, source, matchLevel: 1, aliasId });
    }

    return entries;
}
```

**合并现有 cmds 的展开逻辑：**

在 `normalizeCommand cmd` 循环中，当 `type === 'text'` 时（即 `typeof cmd === 'string'` 或 `cmd.type === 'text'`），调用 `buildSearchEntries`：

```typescript
for (const command of normalized.commands) {
    // ... 现有 commandTriggers.push(...) ...

    // 新增：只对 text 类型展开搜索行
    if (command.type === 'text' && command.normalizedKey) {
        // 注意：normalizedKey 在 v2 中从 command_trigger 移到 search 表
        // 但在 projection builder 中仍需要它来计算 pinyin
        const searchEntries = buildSearchEntries(
            input.pluginId, code, command.cmdKey,
            (typeof command.feature.cmds[command.triggerIndex] === 'string'
                ? command.feature.cmds[command.triggerIndex] as string
                : (command.feature.cmds[command.triggerIndex] as MatchCommand).label ?? ''),
            'cmd', null
        );
        commandTriggerSearch.push(...searchEntries);
    }
}
```

- [ ] **Step 1: 修改 `command-projection-builder.ts`**

添加 `CommandTriggerSearchProjection` 类型，修改 `CommandProjection` 接口，添加 `buildSearchEntries` 辅助函数，更新 `buildCommandProjection` 以产出 search rows。

- [ ] **Step 2: 更新 `CommandTriggerProjection` 类型**

删除 `normalizedKey`, `aliasId`, `targetCmdKey`, `source` 字段。

```typescript
export interface CommandTriggerProjection {
    pluginId: string;
    featureCode: string;
    cmdKey: string;
    triggerIndex: number;
    type: 'text' | 'regex' | 'over' | 'img' | 'files' | 'window';
    label: string | null;
    matcherJson: string;
    scoreBase: number;
    rebuiltAt: number;
}
```

- [ ] **Step 3: 提交**

```bash
git add packages/host/src/commands/command-projection-builder.ts
git commit -m "feat: add command_trigger_search to projection builder"
```

---

### Task 5: Repository — 搜索查询 + 写入

**Files:**
- Modify: `packages/host/src/persistence/sqlite/repositories/command-projection-repository.ts`

**新增查询类型：**

```typescript
export interface TextSearchMatch {
    pluginId: string;
    featureCode: string;
    cmdKey: string;
    type: 'text';
    label: string | null;
    matcherJson: string;
    scoreBase: number;
    matchLevel: 1 | 2 | 3;
    source: 'cmd' | 'alias';
    aliasId: number | null;
}
```

**`CommandSearchRow` 删除 `normalizedKey`，保留其余字段（非 text matcher 使用）。**

- [ ] **Step 1: 新增 `searchByText()`**

```typescript
searchByText(normalizedQuery: string): TextSearchMatch[] {
    return this.db.select({
        pluginId: commandTriggerSearch.pluginId,
        featureCode: commandTriggerSearch.featureCode,
        cmdKey: commandTriggerSearch.cmdKey,
        type: commandTrigger.type,
        label: commandTrigger.label,
        matcherJson: commandTrigger.matcherJson,
        scoreBase: commandTrigger.scoreBase,
        matchLevel: commandTriggerSearch.matchLevel,
        source: commandTriggerSearch.source,
        aliasId: commandTriggerSearch.aliasId,
    })
        .from(commandTriggerSearch)
        .innerJoin(commandTrigger, and(
            eq(commandTrigger.pluginId, commandTriggerSearch.pluginId),
            eq(commandTrigger.featureCode, commandTriggerSearch.featureCode),
            eq(commandTrigger.cmdKey, commandTriggerSearch.cmdKey),
        ))
        .innerJoin(pluginInstallation, eq(pluginInstallation.pluginId, commandTriggerSearch.pluginId))
        .where(and(
            eq(pluginInstallation.enabled, 1),
            eq(commandTriggerSearch.searchText, normalizedQuery),
        ))
        .orderBy(
            desc(commandTriggerSearch.matchLevel),
            desc(commandTrigger.scoreBase),
            asc(commandTrigger.triggerIndex),
        )
        .all();
}
```

- [ ] **Step 2: 更新 `replaceForPlugin()`**

增加 `command_trigger_search` 的写入。在同一个事务内：

```typescript
replaceForPlugin(pluginId: string, projection: CommandProjection): void {
    this.db.delete(effectiveFeature).where(eq(effectiveFeature.pluginId, pluginId)).run();
    this.db.delete(commandTrigger).where(eq(commandTrigger.pluginId, pluginId)).run();
    this.db.delete(commandTriggerSearch).where(eq(commandTriggerSearch.pluginId, pluginId)).run();

    if (projection.effectiveFeatures.length > 0)
        this.db.insert(effectiveFeature).values(projection.effectiveFeatures).run();
    if (projection.commandTriggers.length > 0)
        this.db.insert(commandTrigger).values(projection.commandTriggers).run();
    if (projection.commandTriggerSearch.length > 0)
        this.db.insert(commandTriggerSearch).values(projection.commandTriggerSearch).run();

    this.db.insert(commandProjectionMeta).values(projection.meta)
        .onConflictDoUpdate({
            target: commandProjectionMeta.pluginId,
            set: { manifestHash: projection.meta.manifestHash, ... },
        }).run();
}
```

- [ ] **Step 3: 删除 `matchTextCommand()`**

这个方法已被之前的清理任务标记为死代码。确认无调用方后删除。

- [ ] **Step 4: 更新 `CommandSearchRow`**

删除 `normalizedKey`、`targetCmdKey` 字段——这两个只被 text matcher 使用，text matcher 即将被移除，而非 text matcher 不需要它们。

- [ ] **Step 5: 提交**

```bash
git add packages/host/src/persistence/sqlite/repositories/command-projection-repository.ts
git commit -m "feat: add searchByText, update replaceForPlugin for command_trigger_search"
```

---

### Task 6: Command Catalog — 别名投影 + 索引版本升级

**Files:**
- Modify: `packages/host/src/commands/command-catalog.ts`

- [ ] **Step 1: 投影重建增加 aliases 来源**

在 `indexPlugin` 和 `rebuildPluginWithRepositories` 中，增加 alias 展开：

```typescript
// 在投影重建事务内，读取 command_alias
const activeAliases = this.db.select()
    .from(commandAlias)
    .where(and(
        eq(commandAlias.pluginId, pluginId),
        eq(commandAlias.state, 'active'),
    ))
    .all();
```

然后构造 `AliasOverrideInput` 传递给 `buildCommandProjection`，或直接在 catalog 层面展开 aliases 为 search entries：

```typescript
// 遍历 active aliases
for (const alias of activeAliases) {
    // 确认 target trigger 存在且 type='text'
    const targetTrigger = projection.commandTriggers.find(
        ct => ct.cmdKey === alias.targetCmdKey && ct.type === 'text',
    );
    if (!targetTrigger) continue;

    // 用 alias_normalized 展开搜索行
    const searchEntries = buildSearchEntries(
        pluginId, alias.featureCode, alias.targetCmdKey,
        alias.aliasNormalized, 'alias', alias.id,
    );
    projection.commandTriggerSearch.push(...searchEntries);
}

// 去重：同 cmdKey + searchText 保留最高 match_level，cmd 优先 alias
projection.commandTriggerSearch = dedupSearchEntries(projection.commandTriggerSearch);
```

`dedupSearchEntries` 实现：

```typescript
function dedupSearchEntries(
    entries: CommandTriggerSearchProjection[],
): CommandTriggerSearchProjection[] {
    const seen = new Map<string, CommandTriggerSearchProjection>();
    for (const e of entries) {
        const key = `${e.pluginId}:${e.featureCode}:${e.cmdKey}:${e.searchText}`;
        const existing = seen.get(key);
        if (!existing) { seen.set(key, e); continue; }
        // 优先级：cmd > alias > match_level > alias_id 小
        const prio = (s: string) => s === 'cmd' ? 1 : 2;
        const curPrio = prio(e.source);
        const exPrio = prio(existing.source);
        if (curPrio < exPrio) { seen.set(key, e); continue; }
        if (curPrio > exPrio) continue;
        if (e.matchLevel > existing.matchLevel) { seen.set(key, e); continue; }
        if (e.matchLevel < existing.matchLevel) continue;
        // tie-break: alias_id 小优先
        const curId = e.aliasId ?? 0;
        const exId = existing.aliasId ?? 0;
        if (curId < exId) { seen.set(key, e); }
    }
    return [...seen.values()];
}
```

- [ ] **Step 2: 提升 INDEX_VERSION**

```typescript
const INDEX_VERSION = 2; // 从 1 → 2
```

这会在下次 `indexPlugin` 时触发全量重建。

- [ ] **Step 3: 提交**

```bash
git add packages/host/src/commands/command-catalog.ts
git commit -m "feat: add alias projection to rebuild, bump index version to 2"
```

---

### Task 7: Search Handler — 匹配路径重构

**Files:**
- Modify: `packages/host/src/ipc/register-handlers.ts`
- Modify: `packages/host/src/input/matcher-pipeline.ts`
- Delete: `packages/host/src/input/matchers/text-matcher.ts`

核心变更：text 匹配走 `searchByText()` SQL 查询直接产 `TriggerMatch[]`，不再经过 TextMatcher。pipeline 只处理非 text matcher。

- [ ] **Step 1: 更新 `register-handlers.ts` SEARCH_QUERY handler**

```typescript
ipcMain.handle(IPC.SEARCH_QUERY, (_event, req) => {
    const results: SearchResult[] = [];
    const allMatches: TriggerMatch[] = [];

    if (platformDb) {
        const repo = new CommandProjectionRepository(platformDb.drizzle());
        const snapshot = collectFromSearch(req);

        // 1. Text matching — SQL 层，带拼音支持
        if (snapshot.channels.query) {
            const normalized = normalizeTextKey(req.query);
            if (normalized) {
                const textMatches = repo.searchByText(normalized);
                for (const m of textMatches) {
                    const score = m.scoreBase +
                        (m.matchLevel === 3 ? 10 : m.matchLevel === 2 ? 5 : 2);
                    allMatches.push({
                        matchId: `${m.source}:${m.pluginId}:${m.featureCode}:${m.cmdKey}`,
                        pluginId: m.pluginId,
                        featureCode: m.featureCode,
                        cmdKey: m.cmdKey,
                        triggerType: 'text',
                        enterType: 'text',
                        label: m.label,
                        matchedSource: req.query,
                        payload: req.query,
                        from: snapshot.from,
                        option: null,
                        score,
                    });
                }
            }
        }

        // 2. Non-text matching — existing JS matchers
        const nonTextTypes: Array<'regex' | 'over'> = ['regex', 'over'];
        const triggers = repo.listTriggersByType(nonTextTypes);
        const nonTextMatches = runPipeline(snapshot, triggers);
        allMatches.push(...nonTextMatches);

        // 3. Dedup + Sort
        const deduped = dedupAndSort(allMatches);

        // 4. Session + SearchResult conversion
        if (deduped.length > 0) {
            // ... existing session + pipelineResults logic ...
        }
    }
    // ... rest of handler unchanged ...
});
```

- [ ] **Step 2: 删除 `TextMatcher`**

删除 `packages/host/src/input/matchers/text-matcher.ts`。

- [ ] **Step 3: 简化 `matcher-pipeline.ts`**

从 matchers 数组中移除 `TextMatcher`：

```typescript
const matchers: Matcher[] = [
    // TextMatcher removed — handled by searchByText SQL
    new RegexMatcher(),
    new OverMatcher(),
];
```

同时 `selectCandidateTypes()` 移除 text 类型：

```typescript
function selectCandidateTypes(snapshot: InputContextSnapshot): Set<string> {
    const types = new Set<string>();
    // text no longer needs pipeline — handled by searchByText
    if (snapshot.channels.query) {
        types.add('regex');
        types.add('over');
    }
    if (snapshot.channels.text) {
        types.add('regex');
        types.add('over');
    }
    return types;
}
```

- [ ] **Step 4: 移除 `normalizeTextKey` 在 pipeline 中的引用**

确认 `matcher-pipeline.ts` 不再 import `normalizeTextKey`。TextMatcher import 被移除。

- [ ] **Step 5: 提交**

```bash
git add packages/host/src/ipc/register-handlers.ts
git add packages/host/src/input/
git rm packages/host/src/input/matchers/text-matcher.ts
git commit -m "feat: text matching via SQL searchByText, remove TextMatcher"
```

---

### Task 8: 用户状态 Repositories

**Files:**
- Create: `packages/host/src/persistence/sqlite/repositories/pinned-trigger-repository.ts`
- Create: `packages/host/src/persistence/sqlite/repositories/usage-history-repository.ts`

- [ ] **Step 1: `pinned-trigger-repository.ts`**

```typescript
import type { PlatformDrizzleDatabase } from '../platform-database';
import { and, asc, eq } from 'drizzle-orm';
import { commandTrigger, pinnedTrigger, pluginInstallation } from '../schema';

export class PinnedTriggerRepository {
    constructor(private db: PlatformDrizzleDatabase) {}

    /** 列出当前有效的固定项（仅 enabled plugin + 存在 trigger） */
    listWithTrigger(): Array<{ pluginId: string; featureCode: string; cmdKey: string; sortOrder: number }> {
        return this.db.select({
            pluginId: pinnedTrigger.pluginId,
            featureCode: pinnedTrigger.featureCode,
            cmdKey: pinnedTrigger.cmdKey,
            sortOrder: pinnedTrigger.sortOrder,
        })
            .from(pinnedTrigger)
            .innerJoin(commandTrigger, and(
                eq(commandTrigger.pluginId, pinnedTrigger.pluginId),
                eq(commandTrigger.featureCode, pinnedTrigger.featureCode),
                eq(commandTrigger.cmdKey, pinnedTrigger.cmdKey),
            ))
            .innerJoin(pluginInstallation, eq(pluginInstallation.pluginId, pinnedTrigger.pluginId))
            .where(eq(pluginInstallation.enabled, 1))
            .orderBy(asc(pinnedTrigger.sortOrder))
            .all();
    }

    add(pluginId: string, featureCode: string, cmdKey: string, sortOrder: number): void {
        this.db.insert(pinnedTrigger).values({ pluginId, featureCode, cmdKey, sortOrder, pinnedAt: Date.now() })
            .onConflictDoUpdate({ target: [pinnedTrigger.pluginId, pinnedTrigger.featureCode, pinnedTrigger.cmdKey], set: { sortOrder, pinnedAt: Date.now() } })
            .run();
    }

    remove(pluginId: string, featureCode: string, cmdKey: string): void {
        this.db.delete(pinnedTrigger)
            .where(and(
                eq(pinnedTrigger.pluginId, pluginId),
                eq(pinnedTrigger.featureCode, featureCode),
                eq(pinnedTrigger.cmdKey, cmdKey),
            ))
            .run();
    }
}
```

- [ ] **Step 2: `usage-history-repository.ts`**

```typescript
import type { PlatformDrizzleDatabase } from '../platform-database';
import { and, desc, eq, sql } from 'drizzle-orm';
import { commandTrigger, pluginInstallation, usageHistory } from '../schema';

export class UsageHistoryRepository {
    constructor(private db: PlatformDrizzleDatabase) {}

    record(pluginId: string, featureCode: string, cmdKey: string, query?: string, matchLevel?: number): void {
        this.db.insert(usageHistory).values({
            pluginId, featureCode, cmdKey, query, matchLevel, selectedAt: Date.now(),
        }).run();
    }

    /** 聚合高频使用（只计当前有效 trigger） */
    topUsed(limit = 20): Array<{ pluginId: string; featureCode: string; cmdKey: string; freq: number; lastUsed: number }> {
        return this.db.select({
            pluginId: usageHistory.pluginId,
            featureCode: usageHistory.featureCode,
            cmdKey: usageHistory.cmdKey,
            freq: sql<number>`COUNT(*)`.as('freq'),
            lastUsed: sql<number>`MAX(${usageHistory.selectedAt})`.as('last_used'),
        })
            .from(usageHistory)
            .innerJoin(commandTrigger, and(
                eq(commandTrigger.pluginId, usageHistory.pluginId),
                eq(commandTrigger.featureCode, usageHistory.featureCode),
                eq(commandTrigger.cmdKey, usageHistory.cmdKey),
            ))
            .innerJoin(pluginInstallation, eq(pluginInstallation.pluginId, usageHistory.pluginId))
            .where(eq(pluginInstallation.enabled, 1))
            .groupBy(usageHistory.pluginId, usageHistory.featureCode, usageHistory.cmdKey)
            .orderBy(desc(sql`freq`), desc(sql`last_used`))
            .limit(limit)
            .all();
    }
}
```

- [ ] **Step 3: 提交**

```bash
git add packages/host/src/persistence/sqlite/repositories/
git commit -m "feat: add pinned_trigger and usage_history repositories"
```

---

### Task 9: 最终验证

- [ ] **Step 1: 全量 typecheck**

```bash
pnpm run typecheck
```

所有 9 个 workspace package 通过。

- [ ] **Step 2: 确认冷启动流程**

新安装启动：`createSchema` 创建所有 v2 表 → `indexPlugin` 触发全量投影 → `command_trigger_search` 写入拼音搜索行 → 搜索正常。

- [ ] **Step 3: 提交收尾**

```bash
git add -A && git commit -m "chore: finalize schema v2 migration"
```
