# InputContext Matcher Pipeline Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build text-class matcher pipeline (text/regex/over) that consumes `command_trigger` projections and current search input to produce match results, with `TriggerMatch` → `SearchResult` → `PluginEnterAction` end-to-end.

**Architecture:** A pure-function MatcherPipeline takes `InputContextSnapshot` + `command_trigger[]` and outputs `TriggerMatch[]`. MatchSession provides `matchId`-keyed storage for resolution on user selection. The pipeline replaces `commandCatalog.match()` in the search handler while text/regex/over each have their own matcher class.

**Tech Stack:** TypeScript 6, Electron 43 main process, existing Drizzle + node:sqlite for trigger queries, IPC preload bridge for plugin events.

## Global Constraints

- MatcherPipeline must not write to SQLite, access plugin.json, or collect system context (clipboard/window/files).
- `InputContextSnapshot` is a value object, not a database entity.
- `TriggerMatch` must carry enough context to reconstruct `PluginEnterAction` without re-reading input.
- MatchSession is in-memory only; expired sessions must not block or crash.
- New types go in `packages/shared/src/input/` — not in existing `search/types.ts` which remains for the legacy `SearchResult` display projection.
- Every task that changes behavior starts with a failing test, then minimal implementation, then verification.
- Phase 1 only supports `from: "main"` entry intent. Other intents are deferred.

---

## File Structure

### New Files

- `packages/shared/src/input/types.ts` — `InputContextSnapshot`, `TriggerMatch`, `MatchSession`, `TextSource`, `EntryIntent`, `PluginEnterAction`
- `packages/shared/src/input/index.ts` — Barrel re-export
- `packages/host/src/input/input-context-collector.ts` — Builds `InputContextSnapshot` from `SearchRequest`
- `packages/host/src/input/matchers/matcher.ts` — `Matcher` interface and trigger type dispatch
- `packages/host/src/input/matchers/text-matcher.ts` — Exact normalized-text matching
- `packages/host/src/input/matchers/regex-matcher.ts` — Regex pattern matching against `texts[]`
- `packages/host/src/input/matchers/over-matcher.ts` — Wildcard over matching against `texts[]`
- `packages/host/src/input/matcher-pipeline.ts` — `CandidateSelection` → `TypeMatcher` → normalization
- `packages/host/src/input/match-session-manager.ts` — `MatchSession` lifecycle (create, resolve, expire)

### Modified Files

- `packages/shared/src/index.ts` — Export `./input/index`
- `packages/shared/src/ipc/contract.ts` — Expand `PluginEnterPayload` with `type`, `payload`, `option`, `from`, `matchId`
- `packages/shared/src/search/types.ts` — Add `ActionDescriptor.matchId` for match-based plugin open
- `packages/host/src/persistence/sqlite/repositories/command-projection-repository.ts` — Add `listTriggersByType()`
- `packages/host/src/ipc/register-handlers.ts` — Integrate MatcherPipeline, add `MatchSession` to selection flow
- `packages/host/src/runtime/runtime-manager.ts` — Updated `attachToHost` / `PluginEnterPayload` construction
- `packages/host/src/index.ts` — Export new input modules

---

### Task 1: Shared Input Types

**Files:**
- Create: `packages/shared/src/input/types.ts`
- Create: `packages/shared/src/input/index.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `InputContextSnapshot` — value object carrying query, texts[], and channel availability
- Produces: `TriggerMatch` — standard matcher output
- Produces: `MatchSession` — in-memory session container
- Produces: `TextSource` — enum for text candidate origin
- Produces: `EntryIntent` — enum for user entry point
- Produces: `PluginEnterAction` — what the plugin receives in `onPluginEnter`

- [ ] **Step 1: Write the failing typecheck target**

Run:
```bash
pnpm --filter @szybko/shared typecheck
```

Expected: PASS before changes.

- [ ] **Step 2: Create shared input types**

Create `packages/shared/src/input/types.ts`:

```typescript
/** 文本候选来源 */
export type TextSource =
    | 'query'
    | 'selectedText'
    | 'clipboardText'
    | 'draggedText'
    | 'redirectPayload';

/** 入口意图 */
export type EntryIntent = 'main' | 'panel' | 'hotkey' | 'redirect';

/** 一次入口会话的上下文快照。值对象，不进数据库，不直接发给插件。 */
export interface InputContextSnapshot {
    /** 主搜索框输入文本 */
    query: string;
    /** 可被文本类 matcher 消费的候选文本集合，带来源标记 */
    texts: { text: string; source: TextSource }[];
    /** 各通道可用性状态 */
    channels: {
        query: boolean;
        text: boolean;
        files: boolean;
        image: boolean;
        window: boolean;
    };
    /** 入口来源 */
    from: EntryIntent;
    /** 元信息 */
    meta: {
        platform: string;
        timestamp: number;
        errors: { channel: string; error: string }[];
    };
}

/** Matcher Pipeline 的标准输出。用户选择候选后通过此 matchId 找回完整信息。 */
export interface TriggerMatch {
    matchId: string;
    pluginId: string;
    featureCode: string;
    cmdKey: string;
    triggerType: 'text' | 'regex' | 'over' | 'files' | 'img' | 'window';
    enterType: 'text' | 'regex' | 'over' | 'file' | 'img' | 'window';
    label: string | null;
    matchedSource: string;
    payload: unknown;
    from: EntryIntent;
    option: string | null;
    score: number;
}

/** 搜索结果展示投影，同一次会话中与 InputContextSnapshot 绑定。 */
export interface MatchSession {
    sessionId: string;
    inputContextSnapshot: InputContextSnapshot;
    triggerMatches: TriggerMatch[];
    expiresAt: number;
}

/** 插件开发者看到的公开生命周期事件参数。 */
export interface PluginEnterAction {
    code: string;
    type: 'text' | 'regex' | 'over' | 'file' | 'img' | 'window';
    payload: unknown;
    option?: string;
    from: EntryIntent;
}
```

- [ ] **Step 3: Create barrel export**

Create `packages/shared/src/input/index.ts`:

```typescript
export type {
    TextSource,
    EntryIntent,
    InputContextSnapshot,
    TriggerMatch,
    MatchSession,
    PluginEnterAction,
} from './types';
```

- [ ] **Step 4: Wire into shared package**

Modify `packages/shared/src/index.ts` — add `export * from './input/index';` after existing exports.

- [ ] **Step 5: Verify typecheck**

Run:
```bash
pnpm --filter @szybko/shared typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/input packages/shared/src/index.ts
git commit -m "feat(shared): add input context and trigger match types"
```

---

### Task 2: IPC Contract and ActionDescriptor Updates

**Files:**
- Modify: `packages/shared/src/ipc/contract.ts`
- Modify: `packages/shared/src/search/types.ts`

**Interfaces:**
- Consumes: `EntryIntent`, `PluginEnterAction` from `packages/shared/src/input/types.ts`
- Produces: Expanded `PluginEnterPayload` with type/payload/option/from/matchId
- Produces: `ActionDescriptor` with optional `matchId` for plugin.open

- [ ] **Step 1: Write the failing typecheck target**

Run:
```bash
pnpm --filter @szybko/shared typecheck
```

Expected: PASS before changes.

- [ ] **Step 2: Expand PluginEnterPayload**

Modify `packages/shared/src/ipc/contract.ts`:

Add import:
```typescript
import type { EntryIntent } from '../input/types';
```

Replace the existing `PluginEnterPayload` with:
```typescript
export interface PluginEnterPayload {
    pluginId: string;
    featureCode: string;
    featureExplain?: string;
    /** uTools-compatible: the feature code for the plugin's enter dispatch */
    code: string;
    /** Matcher trigger type (text/regex/over/files/img/window) */
    type: 'text' | 'regex' | 'over' | 'file' | 'img' | 'window';
    /** The matched input data that triggered this plugin entry */
    payload: unknown;
    /** User-selected entry option (for mainPush features offering multiple actions) */
    option?: string;
    /** Entry intent (main/panel/hotkey/redirect) */
    from: EntryIntent;
    /** original keyword for backward compat */
    keyword?: string;
    /** original query for backward compat */
    query?: string;
    /** MatchSession ID for the originating context, if available */
    matchId?: string;
}
```

- [ ] **Step 3: Add matchId to ActionDescriptor**

Modify `packages/shared/src/search/types.ts`:

Add `matchId?: string` to the `plugin.open` action descriptor. Replace the existing entry:
```typescript
        | { type: 'plugin.open'; payload: { pluginId: string; url?: string; featureCode?: string; matchId?: string } }
```

- [ ] **Step 4: Verify typecheck**

Run:
```bash
pnpm --filter @szybko/shared typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ipc/contract.ts packages/shared/src/search/types.ts
git commit -m "feat(shared): expand plugin enter payload with match context"
```

---

### Task 3: CommandProjectionRepository — List Triggers by Type

**Files:**
- Modify: `packages/host/src/persistence/sqlite/repositories/command-projection-repository.ts`

**Interfaces:**
- Produces: `listTriggersByType(type: string[]): CommandSearchRow[]` — returns all enabled triggers of given types, with JOIN to effectiveFeature for featureJson

- [ ] **Step 1: Write the failing test**

Create the test inline in the existing test methodology. Since there are no repository-level tests (established precedent), verify by typecheck + integration at pipeline level.

Run typecheck baseline:
```bash
pnpm --filter @szybko/host typecheck
```

Expected: PASS.

- [ ] **Step 2: Add listTriggersByType**

Add to `command-projection-repository.ts`:

```typescript
    listTriggersByType(types: string[]): CommandSearchRow[] {
        return this.db.select({
            pluginId: commandTrigger.pluginId,
            featureCode: commandTrigger.featureCode,
            cmdKey: commandTrigger.cmdKey,
            triggerIndex: commandTrigger.triggerIndex,
            source: commandTrigger.source,
            type: commandTrigger.type,
            label: commandTrigger.label,
            normalizedKey: commandTrigger.normalizedKey,
            targetCmdKey: commandTrigger.targetCmdKey,
            scoreBase: commandTrigger.scoreBase,
            featureJson: effectiveFeature.featureJson,
        })
            .from(commandTrigger)
            .innerJoin(effectiveFeature, and(
                eq(effectiveFeature.pluginId, commandTrigger.pluginId),
                eq(effectiveFeature.code, commandTrigger.featureCode),
            ))
            .innerJoin(pluginInstallation, eq(pluginInstallation.pluginId, commandTrigger.pluginId))
            .where(and(
                eq(pluginInstallation.enabled, 1),
                inArray(commandTrigger.type, types),
            ))
            .orderBy(
                desc(commandTrigger.scoreBase),
                asc(effectiveFeature.featureOrder),
                asc(commandTrigger.triggerIndex),
            )
            .all();
    }
```

Add import:
```typescript
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
```

- [ ] **Step 3: Verify typecheck**

Run:
```bash
pnpm --filter @szybko/host typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/host/src/persistence/sqlite/repositories/command-projection-repository.ts
git commit -m "feat(host): add listTriggersByType to projection repository"
```

---

### Task 4: InputContext Collector

**Files:**
- Create: `packages/host/src/input/input-context-collector.ts`

**Interfaces:**
- Consumes: `SearchRequest` from `@szybko/shared`, `InputContextSnapshot` types
- Produces: `collectFromSearch(req: SearchRequest): InputContextSnapshot` — builds snapshot from main search query

- [ ] **Step 1: Write the failing test**

Create `packages/host/src/input/input-context-collector.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { collectFromSearch } from './input-context-collector';

describe('input context collector', () => {
    it('builds snapshot from search query with texts array', () => {
        const snapshot = collectFromSearch({
            queryId: 'q1',
            query: '测试输入',
            timestamp: 1000,
        });

        expect(snapshot.query).toBe('测试输入');
        expect(snapshot.texts).toHaveLength(1);
        expect(snapshot.texts[0]).toEqual({ text: '测试输入', source: 'query' });
        expect(snapshot.from).toBe('main');
        expect(snapshot.channels.query).toBe(true);
        expect(snapshot.channels.text).toBe(true);
        expect(snapshot.channels.files).toBe(false);
        expect(snapshot.channels.image).toBe(false);
        expect(snapshot.channels.window).toBe(false);
    });

    it('handles empty query', () => {
        const snapshot = collectFromSearch({
            queryId: 'q2',
            query: '',
            timestamp: 1000,
        });

        expect(snapshot.query).toBe('');
        expect(snapshot.texts).toHaveLength(0);
        expect(snapshot.channels.query).toBe(false);
        expect(snapshot.channels.text).toBe(false);
    });
});
```

Run:
```bash
pnpm --filter @szybko/host test -- input-context-collector.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 2: Implement collector**

Create `packages/host/src/input/input-context-collector.ts`:

```typescript
import type { InputContextSnapshot, SearchRequest } from '@szybko/shared';

export function collectFromSearch(req: SearchRequest): InputContextSnapshot {
    const query = req.query;
    const hasQuery = query.length > 0;

    return {
        query,
        texts: hasQuery ? [{ text: query, source: 'query' as const }] : [],
        channels: {
            query: hasQuery,
            text: hasQuery,
            files: false,
            image: false,
            window: false,
        },
        from: 'main',
        meta: {
            platform: process.platform,
            timestamp: req.timestamp,
            errors: [],
        },
    };
}
```

- [ ] **Step 3: Run tests**

Run:
```bash
pnpm --filter @szybko/host test -- input-context-collector.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

```bash
pnpm --filter @szybko/host typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/input/input-context-collector.ts packages/host/src/input/input-context-collector.test.ts
git commit -m "feat(host): add input context collector from search query"
```

---

### Task 5: Text, Regex, and Over Matchers

**Files:**
- Create: `packages/host/src/input/matchers/matcher.ts`
- Create: `packages/host/src/input/matchers/text-matcher.ts`
- Create: `packages/host/src/input/matchers/regex-matcher.ts`
- Create: `packages/host/src/input/matchers/over-matcher.ts`

**Interfaces:**
- Produces: `Matcher` interface: `{ type: string; match(snapshot, triggers): TriggerMatch[] }`
- Produces: `TextMatcher` — exact normalized match against snapshot.query
- Produces: `RegexMatcher` — regex test against snapshot.texts[]
- Produces: `OverMatcher` — length/range test against snapshot.texts[]

- [ ] **Step 1: Write failing tests for each matcher**

Create `packages/host/src/input/matchers/text-matcher.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { TextMatcher } from './text-matcher';
import type { InputContextSnapshot, CommandSearchRow } from '@szybko/shared';

function mockRow(overrides: Partial<CommandSearchRow> = {}): CommandSearchRow {
    return {
        pluginId: 'demo',
        featureCode: 'prefs',
        cmdKey: 'key',
        triggerIndex: 0,
        source: 'feature_cmd',
        type: 'text',
        label: '设置',
        normalizedKey: '设置',
        targetCmdKey: null,
        scoreBase: 90,
        featureJson: '{}',
        ...overrides,
    };
}

describe('TextMatcher', () => {
    it('matches exact normalized text', () => {
        const matcher = new TextMatcher();
        const snapshot = { query: '设置', texts: [{ text: '设置', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } };
        const results = matcher.match(snapshot, [mockRow()]);
        expect(results).toHaveLength(1);
        expect(results[0]?.pluginId).toBe('demo');
    });

    it('does not match different text', () => {
        const matcher = new TextMatcher();
        const snapshot = { query: '其他', texts: [{ text: '其他', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } };
        const results = matcher.match(snapshot, [mockRow()]);
        expect(results).toHaveLength(0);
    });
});
```

Create `packages/host/src/input/matchers/regex-matcher.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { RegexMatcher } from './regex-matcher';
import type { InputContextSnapshot, CommandSearchRow } from '@szybko/shared';

function mockRow(overrides: Partial<CommandSearchRow> = {}): CommandSearchRow {
    return {
        pluginId: 'linker',
        featureCode: 'open-url',
        cmdKey: 'r1',
        triggerIndex: 0,
        source: 'feature_cmd',
        type: 'regex',
        label: '打开链接',
        normalizedKey: null,
        targetCmdKey: null,
        scoreBase: 90,
        featureJson: JSON.stringify({ matcher: { type: 'regex', match: { pattern: '^(https?):\\/\\/.+$', flags: 'i' } } }),
        ...overrides,
    };
}

describe('RegexMatcher', () => {
    it('matches text against regex pattern', () => {
        const matcher = new RegexMatcher();
        const snapshot = { query: 'https://example.com', texts: [{ text: 'https://example.com', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } };
        const results = matcher.match(snapshot, [mockRow()]);
        expect(results).toHaveLength(1);
        expect(results[0]?.pluginId).toBe('linker');
    });

    it('does not match non-matching text', () => {
        const matcher = new RegexMatcher();
        const snapshot = { query: '普通文本', texts: [{ text: '普通文本', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } };
        const results = matcher.match(snapshot, [mockRow()]);
        expect(results).toHaveLength(0);
    });

    it('respects minLength and maxLength', () => {
        const matcher = new RegexMatcher();
        const row = mockRow({ featureJson: JSON.stringify({ matcher: { type: 'regex', match: { pattern: '^\\d+$', flags: '' }, minLength: 5, maxLength: 10 } }) });
        const short = matcher.match({ query: '12', texts: [{ text: '12', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } }, [row]);
        const match = matcher.match({ query: '12345', texts: [{ text: '12345', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } }, [row]);
        const long = matcher.match({ query: '12345678901', texts: [{ text: '12345678901', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } }, [row]);
        expect(short).toHaveLength(0);
        expect(match).toHaveLength(1);
        expect(long).toHaveLength(0);
    });
});
```

Create `packages/host/src/input/matchers/over-matcher.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { OverMatcher } from './over-matcher';
import type { InputContextSnapshot, CommandSearchRow } from '@szybko/shared';

function mockRow(overrides: Partial<CommandSearchRow> = {}): CommandSearchRow {
    return {
        pluginId: 'catcher',
        featureCode: 'catch-all',
        cmdKey: 'o1',
        triggerIndex: 0,
        source: 'feature_cmd',
        type: 'over',
        label: '捕获',
        normalizedKey: null,
        targetCmdKey: null,
        scoreBase: 50,
        featureJson: JSON.stringify({ matcher: { type: 'over' } }),
        ...overrides,
    };
}

describe('OverMatcher', () => {
    it('matches any text when no constraints', () => {
        const matcher = new OverMatcher();
        const snapshot = { query: '任意文本', texts: [{ text: '任意文本', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } };
        const results = matcher.match(snapshot, [mockRow()]);
        expect(results).toHaveLength(1);
    });

    it('respects exclude pattern', () => {
        const matcher = new OverMatcher();
        const row = mockRow({ featureJson: JSON.stringify({ matcher: { type: 'over', exclude: { pattern: '^\\d+$', flags: '' } } }) });
        const excluded = matcher.match({ query: '123', texts: [{ text: '123', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } }, [row]);
        const included = matcher.match({ query: 'abc', texts: [{ text: 'abc', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } }, [row]);
        expect(excluded).toHaveLength(0);
        expect(included).toHaveLength(1);
    });
});
```

Run all three test files:
```bash
pnpm --filter @szybko/host test -- text-matcher.test.ts regex-matcher.test.ts over-matcher.test.ts
```

Expected: FAIL because matcher files do not exist.

- [ ] **Step 2: Implement matcher interface**

Create `packages/host/src/input/matchers/matcher.ts`:

```typescript
import type { InputContextSnapshot, TriggerMatch } from '@szybko/shared';
import type { CommandSearchRow } from '../../persistence/sqlite/repositories/command-projection-repository';

export interface Matcher {
    type: string;
    match(snapshot: InputContextSnapshot, triggers: CommandSearchRow[]): TriggerMatch[];
}
```

- [ ] **Step 3: Implement TextMatcher**

Create `packages/host/src/input/matchers/text-matcher.ts`:

```typescript
import type { InputContextSnapshot, TriggerMatch } from '@szybko/shared';
import type { CommandSearchRow } from '../../persistence/sqlite/repositories/command-projection-repository';
import { normalizeTextKey } from '../../commands/feature-normalizer';
import type { Matcher } from './matcher';

export class TextMatcher implements Matcher {
    readonly type = 'text';

    match(snapshot: InputContextSnapshot, triggers: CommandSearchRow[]): TriggerMatch[] {
        const normalizedQuery = normalizeTextKey(snapshot.query);
        if (!normalizedQuery)
            return [];

        return triggers
            .filter(t => t.normalizedKey && normalizeTextKey(t.normalizedKey) === normalizedQuery)
            .map(t => ({
                matchId: `text:${t.pluginId}:${t.featureCode}:${t.cmdKey}`,
                pluginId: t.pluginId,
                featureCode: t.featureCode,
                cmdKey: t.cmdKey,
                triggerType: 'text' as const,
                enterType: 'text' as const,
                label: t.label,
                matchedSource: snapshot.query,
                payload: snapshot.query,
                from: snapshot.from,
                option: null,
                score: t.scoreBase,
            }));
    }
}
```

- [ ] **Step 4: Implement RegexMatcher**

Create `packages/host/src/input/matchers/regex-matcher.ts`:

```typescript
import type { InputContextSnapshot, TriggerMatch } from '@szybko/shared';
import type { CommandSearchRow } from '../../persistence/sqlite/repositories/command-projection-repository';
import type { Matcher } from './matcher';

interface RegexMatcherConfig {
    type: 'regex';
    match: { pattern: string; flags: string };
    minLength?: number;
    maxLength?: number;
}

export class RegexMatcher implements Matcher {
    readonly type = 'regex';

    match(snapshot: InputContextSnapshot, triggers: CommandSearchRow[]): TriggerMatch[] {
        const results: TriggerMatch[] = [];

        for (const trigger of triggers) {
            const config: RegexMatcherConfig = JSON.parse(trigger.featureJson)?.matcher;
            if (!config || config.type !== 'regex')
                continue;

            const regex = new RegExp(config.match.pattern, config.match.flags);

            for (const tc of snapshot.texts) {
                if (config.minLength !== undefined && tc.text.length < config.minLength)
                    continue;
                if (config.maxLength !== undefined && tc.text.length > config.maxLength)
                    continue;

                const match = regex.exec(tc.text);
                if (match) {
                    results.push({
                        matchId: `regex:${trigger.pluginId}:${trigger.featureCode}:${trigger.cmdKey}:${tc.source}`,
                        pluginId: trigger.pluginId,
                        featureCode: trigger.featureCode,
                        cmdKey: trigger.cmdKey,
                        triggerType: 'regex',
                        enterType: 'regex',
                        label: trigger.label,
                        matchedSource: tc.text,
                        payload: tc.text,
                        from: snapshot.from,
                        option: null,
                        score: trigger.scoreBase,
                    });
                }
            }
        }

        return results;
    }
}
```

- [ ] **Step 5: Implement OverMatcher**

Create `packages/host/src/input/matchers/over-matcher.ts`:

```typescript
import type { InputContextSnapshot, TriggerMatch } from '@szybko/shared';
import type { CommandSearchRow } from '../../persistence/sqlite/repositories/command-projection-repository';
import type { Matcher } from './matcher';

interface OverMatcherConfig {
    type: 'over';
    exclude?: { pattern: string; flags: string };
    minLength?: number;
    maxLength?: number;
}

export class OverMatcher implements Matcher {
    readonly type = 'over';

    match(snapshot: InputContextSnapshot, triggers: CommandSearchRow[]): TriggerMatch[] {
        const results: TriggerMatch[] = [];

        for (const trigger of triggers) {
            const config: OverMatcherConfig = JSON.parse(trigger.featureJson)?.matcher;
            if (!config || config.type !== 'over')
                continue;

            const excludeRegex = config.exclude
                ? new RegExp(config.exclude.pattern, config.exclude.flags)
                : null;

            for (const tc of snapshot.texts) {
                if (config.minLength !== undefined && tc.text.length < config.minLength)
                    continue;
                if (config.maxLength !== undefined && tc.text.length > config.maxLength)
                    continue;
                if (excludeRegex && excludeRegex.test(tc.text))
                    continue;

                results.push({
                    matchId: `over:${trigger.pluginId}:${trigger.featureCode}:${trigger.cmdKey}:${tc.source}`,
                    pluginId: trigger.pluginId,
                    featureCode: trigger.featureCode,
                    cmdKey: trigger.cmdKey,
                    triggerType: 'over',
                    enterType: 'over',
                    label: trigger.label,
                    matchedSource: tc.text,
                    payload: tc.text,
                    from: snapshot.from,
                    option: null,
                    score: trigger.scoreBase,
                });
            }
        }

        return results;
    }
}
```

- [ ] **Step 6: Run matcher tests**

```bash
pnpm --filter @szybko/host test -- text-matcher.test.ts regex-matcher.test.ts over-matcher.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run typecheck**

```bash
pnpm --filter @szybko/host typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/host/src/input/matchers
git commit -m "feat(host): add text, regex, and over matchers"
```

---

### Task 6: Matcher Pipeline

**Files:**
- Create: `packages/host/src/input/matcher-pipeline.ts`

**Interfaces:**
- Consumes: `InputContextSnapshot`, `CommandSearchRow[]`, matcher classes
- Produces: `runPipeline(snapshot, triggers): TriggerMatch[]` — runs candidate selection, dispatches to type matchers, normalizes output

- [ ] **Step 1: Write the failing test**

Create `packages/host/src/input/matcher-pipeline.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { runPipeline } from './matcher-pipeline';
import type { InputContextSnapshot, CommandSearchRow } from '@szybko/shared';

describe('matcher pipeline', () => {
    it('runs text and regex matchers against query', () => {
        const snapshot: InputContextSnapshot = {
            query: 'https://example.com',
            texts: [{ text: 'https://example.com', source: 'query' }],
            channels: { query: true, text: true, files: false, image: false, window: false },
            from: 'main',
            meta: { platform: 'darwin', timestamp: 0, errors: [] },
        };

        const triggers: CommandSearchRow[] = [
            {
                pluginId: 'prefs', featureCode: 'settings', cmdKey: 'k1',
                triggerIndex: 0, source: 'feature_cmd', type: 'text',
                label: '设置', normalizedKey: '设置',
                targetCmdKey: null, scoreBase: 90, featureJson: '{}',
            },
            {
                pluginId: 'linker', featureCode: 'open-url', cmdKey: 'k2',
                triggerIndex: 0, source: 'feature_cmd', type: 'regex',
                label: '打开链接', normalizedKey: null,
                targetCmdKey: null, scoreBase: 85,
                featureJson: JSON.stringify({ matcher: { type: 'regex', match: { pattern: '^(https?):\\/\\/.+$', flags: 'i' } } }),
            },
        ];

        const matches = runPipeline(snapshot, triggers);
        expect(matches).toHaveLength(1); // only regex matches
        expect(matches[0]?.pluginId).toBe('linker');
    });
});
```

Run:
```bash
pnpm --filter @szybko/host test -- matcher-pipeline.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement pipeline**

Create `packages/host/src/input/matcher-pipeline.ts`:

```typescript
import type { InputContextSnapshot, TriggerMatch } from '@szybko/shared';
import type { CommandSearchRow } from '../persistence/sqlite/repositories/command-projection-repository';
import { TextMatcher } from './matchers/text-matcher';
import { RegexMatcher } from './matchers/regex-matcher';
import { OverMatcher } from './matchers/over-matcher';
import type { Matcher } from './matchers/matcher';

const matchers: Matcher[] = [
    new TextMatcher(),
    new RegexMatcher(),
    new OverMatcher(),
];

/** 根据当前上下文中启用的通道，筛选需要运行的 matcher 类型 */
function selectCandidateTypes(snapshot: InputContextSnapshot): Set<string> {
    const types = new Set<string>();
    if (snapshot.channels.query) {
        types.add('text');
        types.add('regex');
        types.add('over');
    }
    if (snapshot.channels.text) {
        types.add('regex');
        types.add('over');
    }
    return types;
}

/** 从触发器数组中筛选指定类型的行 */
function filterTriggersByType(triggers: CommandSearchRow[], types: Set<string>): Map<string, CommandSearchRow[]> {
    const map = new Map<string, CommandSearchRow[]>();
    for (const t of triggers) {
        if (types.has(t.type)) {
            const arr = map.get(t.type) ?? [];
            arr.push(t);
            map.set(t.type, arr);
        }
    }
    return map;
}

/** 排序和去重（相同 pluginId+featureCode+cmdKey+payload 只保留最高分） */
function dedupAndSort(matches: TriggerMatch[]): TriggerMatch[] {
    const seen = new Map<string, TriggerMatch>();
    for (const m of matches) {
        const key = `${m.pluginId}:${m.featureCode}:${m.cmdKey}:${m.matchedSource}`;
        const existing = seen.get(key);
        if (!existing || m.score > existing.score) {
            seen.set(key, m);
        }
    }
    return [...seen.values()].sort((a, b) => b.score - a.score);
}

export function runPipeline(
    snapshot: InputContextSnapshot,
    triggers: CommandSearchRow[],
): TriggerMatch[] {
    const candidateTypes = selectCandidateTypes(snapshot);
    const byType = filterTriggersByType(triggers, candidateTypes);
    const allMatches: TriggerMatch[] = [];

    for (const matcher of matchers) {
        const typeTriggers = byType.get(matcher.type);
        if (!typeTriggers || typeTriggers.length === 0)
            continue;
        const matches = matcher.match(snapshot, typeTriggers);
        allMatches.push(...matches);
    }

    return dedupAndSort(allMatches);
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @szybko/host test -- matcher-pipeline.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

```bash
pnpm --filter @szybko/host typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/input/matcher-pipeline.ts packages/host/src/input/matcher-pipeline.test.ts
git commit -m "feat(host): add matcher pipeline with candidate selection"
```

---

### Task 7: MatchSession Manager

**Files:**
- Create: `packages/host/src/input/match-session-manager.ts`

**Interfaces:**
- Consumes: `MatchSession`, `TriggerMatch`, `InputContextSnapshot` types
- Produces: `MatchSessionManager` — in-memory session lifecycle: `create()`, `resolve(matchId)`, `cleanup()`

- [ ] **Step 1: Write failing tests**

Create `packages/host/src/input/match-session-manager.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { MatchSessionManager } from './match-session-manager';

describe('MatchSessionManager', () => {
    it('creates session and resolves match by id', () => {
        const mgr = new MatchSessionManager();
        const session = mgr.create({
            query: 'test',
            texts: [],
            channels: { query: true, text: false, files: false, image: false, window: false },
            from: 'main',
            meta: { platform: 'darwin', timestamp: 0, errors: [] },
        });

        expect(session.triggerMatches).toHaveLength(0);
        expect(session.sessionId).toBeTruthy();
    });

    it('returns null for unknown matchId', () => {
        const mgr = new MatchSessionManager();
        expect(mgr.resolve('nonexistent')).toBeNull();
    });
});
```

Run:
```bash
pnpm --filter @szybko/host test -- match-session-manager.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement MatchSessionManager**

Create `packages/host/src/input/match-session-manager.ts`:

```typescript
import type { InputContextSnapshot, MatchSession, TriggerMatch } from '@szybko/shared';
import { createHash, randomUUID } from 'node:crypto';

const SESSION_TTL_MS = 60_000;

export class MatchSessionManager {
    private sessions = new Map<string, MatchSession>();

    create(snapshot: InputContextSnapshot): MatchSession {
        const sessionId = randomUUID();
        const session: MatchSession = {
            sessionId,
            inputContextSnapshot: snapshot,
            triggerMatches: [],
            expiresAt: Date.now() + SESSION_TTL_MS,
        };
        this.sessions.set(sessionId, session);
        this.evictExpired();
        return session;
    }

    addMatches(sessionId: string, matches: TriggerMatch[]): void {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.triggerMatches = matches;
    }

    resolve(matchId: string): { match: TriggerMatch; session: MatchSession } | null {
        this.evictExpired();
        for (const session of this.sessions.values()) {
            for (const match of session.triggerMatches) {
                if (match.matchId === matchId) {
                    return { match, session };
                }
            }
        }
        return null;
    }

    private evictExpired(): void {
        const now = Date.now();
        for (const [id, session] of this.sessions) {
            if (session.expiresAt <= now) {
                this.sessions.delete(id);
            }
        }
    }

    /** For testing: clear all sessions */
    clear(): void {
        this.sessions.clear();
    }
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @szybko/host test -- match-session-manager.test.ts
```

Expected: PASS.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @szybko/host typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/host/src/input/match-session-manager.ts packages/host/src/input/match-session-manager.test.ts
git commit -m "feat(host): add in-memory match session manager"
```

---

### Task 8: Search Handler Integration

**Files:**
- Modify: `packages/host/src/ipc/register-handlers.ts`
- Modify: `packages/host/src/runtime/runtime-manager.ts`
- Modify: `packages/host/src/index.ts`
- Modify: `packages/host/src/persistence/sqlite/repositories/command-projection-repository.ts`

**Interfaces:**
- Consumes: `MatcherPipeline`, `MatchSessionManager`, `InputContextCollector`, `CommandProjectionRepository`
- Produces: Updated search handler using MatcherPipeline
- Produces: Updated `activatePlugin` / `attachToHost` accepting `PluginEnterPayload` with full match context

- [ ] **Step 1: Wire dependency injection in register-handlers.ts**

Add import:
```typescript
import { MatchSessionManager } from '../input/match-session-manager';
import { runPipeline } from '../input/matcher-pipeline';
import { collectFromSearch } from '../input/input-context-collector';
import { CommandProjectionRepository } from '../persistence/sqlite/repositories/command-projection-repository';
import type { PlatformDatabase } from '../persistence/sqlite/platform-database';
```

At the top of `registerIpcHandlers`, create the session manager:
```typescript
export function registerIpcHandlers(
    windowManager: WindowManager,
    coordinator: RuntimeCoordinator,
    commandCatalog: CommandCatalog,
    platformDb?: PlatformDatabase,
) {
    const sessionManager = new MatchSessionManager();
```

Replace the search handler body:
```typescript
    ipcMain.handle(
        IPC.SEARCH_QUERY,
        (_event, req: IpcRequest<typeof IPC.SEARCH_QUERY>): IpcResponse<typeof IPC.SEARCH_QUERY> => {
            // Built-in search
            const results = runBuiltinSearch(req.query);
            results.sort((a, b) => b.score - a.score);

            // Matcher pipeline (text/regex/over against command triggers)
            if (platformDb) {
                const repo = new CommandProjectionRepository(platformDb.drizzle());
                const snapshot = collectFromSearch(req);
                const types = ['text', 'regex', 'over'];
                const triggers = repo.listTriggersByType(types);
                const matches = runPipeline(snapshot, triggers);

                if (matches.length > 0) {
                    const session = sessionManager.create(snapshot);
                    sessionManager.addMatches(session.sessionId, matches);

                    const pipelineResults = matches.map(m => ({
                        id: m.matchId,
                        title: m.label || m.featureCode,
                        subtitle: `打开 ${m.pluginId}`,
                        icon: '🧩',
                        group: '插件',
                        score: m.score,
                        action: {
                            type: 'plugin.open' as const,
                            payload: {
                                pluginId: m.pluginId,
                                featureCode: m.featureCode,
                                matchId: m.matchId,
                            },
                        },
                    }));
                    results.push(...pipelineResults);
                }
            }

            results.sort((a, b) => b.score - a.score);
            const win = windowManager.getWindow();
            // ... rest unchanged
```

- [ ] **Step 2: Update PLUGIN_EXEC handler to resolve match context**

Modify the `IPC.PLUGIN_EXEC` handler to resolve matchId if present:

```typescript
    ipcMain.handle(
        IPC.PLUGIN_EXEC,
        (_event, { action }: IpcRequest<typeof IPC.PLUGIN_EXEC>): IpcResponse<typeof IPC.PLUGIN_EXEC> => {
            if (action.type === 'plugin.open') {
                // Resolve match context from session manager if matchId is present
                if (action.payload.matchId) {
                    const resolved = sessionManager.resolve(action.payload.matchId);
                    if (resolved) {
                        coordinator.activatePlugin(
                            action.payload.pluginId,
                            action.payload.featureCode,
                            {
                                code: resolved.match.featureCode,
                                type: resolved.match.enterType,
                                payload: resolved.match.payload,
                                option: resolved.match.option ?? undefined,
                                from: resolved.match.from,
                                keyword: resolved.match.matchedSource,
                                query: resolved.match.matchedSource,
                                matchId: resolved.match.matchId,
                            },
                        );
                        return { ok: true };
                    }
                }
                // Fall back to simple activation without match context
                coordinator.activatePlugin(action.payload.pluginId, action.payload.featureCode);
                return { ok: true };
            }
            return executeAction(action);
        },
    );
```

- [ ] **Step 3: Update RuntimeManager.attachToHost to accept PluginEnterPayload**

Modify `packages/host/src/runtime/runtime-manager.ts`:

Replace the method signature:
```typescript
    attachToHost(runtimeId: string, host: RuntimeHost, featureCode?: string, enterPayload?: Partial<PluginEnterPayload>): void {
```

Inside the method, where `IPC.PLUGIN_ENTER` is sent (all locations), use the provided `enterPayload` if available, falling back to the existing construction:

```typescript
            entry.runtime.webContents.send(IPC.PLUGIN_ENTER, enterPayload ?? {
                pluginId: entry.runtime.info.pluginId,
                featureCode,
                code: featureCode ?? entry.runtime.info.pluginId,
                type: 'text',
                payload: null,
                from: 'main',
            });
```

- [ ] **Step 4: Update RuntimeCoordinator.activatePlugin to pass through enter context**

Modify `packages/host/src/runtime/runtime-coordinator.ts`:

```typescript
    activatePlugin(pluginId: string, featureCode?: string, enterPayload?: Partial<PluginEnterPayload>): void {
        // ... existing logic ...
        this.runtimeManager.attachToHost(runtime.info.id, host, featureCode, enterPayload);
    }
```

- [ ] **Step 5: Update exports**

Modify `packages/host/src/index.ts`:

```typescript
export { MatchSessionManager } from './input/match-session-manager';
export { runPipeline } from './input/matcher-pipeline';
export { collectFromSearch } from './input/input-context-collector';
```

- [ ] **Step 6: Update main startup wiring**

In `apps/desktop/src/main/index.ts`, pass the platform database to `registerIpcHandlers`:

```typescript
    registerIpcHandlers(windowManager, coordinator, commandCatalog, platformDb);
```

- [ ] **Step 7: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Run tests**

```bash
pnpm --filter @szybko/host test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/host/src/ipc/register-handlers.ts packages/host/src/runtime packages/host/src/index.ts
git commit -m "feat(host): integrate matcher pipeline into search and activation flow"
```

---

### Task 9: End-to-End Verification

**Files:**
- No source changes unless failures are found.

- [ ] **Step 1: Run final validation**

```bash
pnpm typecheck
pnpm --filter @szybko/host typecheck
pnpm build
```

Expected: all PASS.

- [ ] **Step 2: Verify no dangling references**

```bash
rg -n "CommandSearchRow" packages/shell apps/desktop/src/preload
```

Expected: no renderer/preload code imports host database types.

- [ ] **Step 3: Clean up test files if desired**

Same decision as command catalog: the matcher tests are pure-function tests (high value, low maintenance). Keep or remove per preference.

---

## Deferred Follow-Ups

- `files`/`img`/`window` context channels and matchers
- `panel`/`hotkey`/`redirect` entry intents and their context collectors
- Alias resolution within matcher pipeline
- User habit ranking and personalization
- Diagnostic view for channel availability/errors
