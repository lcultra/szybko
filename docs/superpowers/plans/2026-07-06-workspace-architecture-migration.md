# Workspace Architecture Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename three packages (`core-rust→native`, `design-system→ui-kit`, `plugin-sdk→sdk`) and absorb `packages/shell` into `apps/desktop/src/renderer`, eliminating the standalone `@szybko/shell` package.

**Architecture:** Follow the spec's step order (rename packages in dependency order, then move shell, then clean up). Each step is independently reviewable with no runtime behavior changes.

**Tech Stack:** pnpm workspace, Electron + Vite, TypeScript project references, Tailwind CSS v4

## Global Constraints

- Zero runtime behavior changes — pure structural migration
- Each step must be independently reviewable and testable
- After migration, `pnpm typecheck`, `pnpm lint`, `pnpm --filter @szybko/desktop build` must pass
- Full git history is available for each step's changes before moving on
- No preload or IPC changes in this plan
- Rust crate and napi artifact names remain unchanged (`szybko-core`)
- No test migration needed — all previous test files have been removed from the repo

---
## File Structure (Post-Migration)

```
apps/
└── desktop/
    ├── src/
    │   ├── main/index.ts            # unchanged
    │   ├── preload/                 # unchanged
    │   └── renderer/                # shell src/* + existing entries merged
    │       ├── main.tsx
    │       ├── floating.tsx
    │       ├── main.css
    │       ├── index.html
    │       ├── floating.html
    │       ├── vite-env.d.ts
    │       ├── global.d.ts
    │       ├── mount.tsx            # moved from shell
    │       ├── types/index.ts
    │       ├── stores/
    │       │   ├── app-store.ts
    │       │   └── runtime-store.ts
    │       ├── components/
    │       │   ├── SurfaceFrame.tsx
    │       │   └── plugin/
    │       │       ├── PluginScene.tsx
    │       │       ├── PluginView.tsx
    │       │       └── PluginHeader.tsx
    │       ├── hooks/
    │       │   ├── usePluginRuntime.ts
    │       │   └── useSearch.ts
    │       ├── services/
    │       │   └── plugin-runtime.ts
    │       └── pages/
    │           ├── shell/
    │           │   ├── Shell.tsx
    │           │   ├── SectionList.tsx
    │           │   ├── ResultIcon.tsx
    │           │   ├── SortableGridTile.tsx
    │           │   ├── Grid.tsx
    │           │   ├── SearchBar.tsx
    │           │   ├── GridTile.tsx
    │           │   ├── SectionHeader.tsx
    │           │   ├── HighlightedText.tsx
    │           │   └── hooks/
    │           │       ├── useWindowHeight.ts
    │           │       ├── navigation.ts
    │           │       └── useKeyboard.ts
    │           └── floating/
    │               └── FloatingApp.tsx
    ├── electron.vite.config.ts
    ├── tsconfig.json
    ├── tsconfig.web.json
    ├── tsconfig.node.json
    └── package.json

packages/
├── host/                         # unchanged — no structural changes this round
├── shared/                       # unchanged
├── native/                       # renamed from core-rust
├── ui-kit/                       # renamed from design-system
└── sdk/                          # renamed from plugin-sdk
```

## Impact Map (All References to Renamed Packages)

### `@szybko/core-rust` → `@szybko/native`
| File | Change |
|---|---|
| `packages/core-rust/package.json` → `packages/native/package.json` | `name` field |
| `packages/host/package.json` | dependency reference |

### `@szybko/design-system` → `@szybko/ui-kit`
| File | Change |
|---|---|
| `packages/design-system/package.json` → `packages/ui-kit/package.json` | `name` field |
| `apps/desktop/package.json` | dependency reference |
| `apps/desktop/src/renderer/main.css` | `@import` path |
| `packages/shell/package.json` | dependency reference (will be absorbed later) |
| `packages/shell/src/mount.tsx` | `import` source |
| `packages/shell/src/style.css` | `@import` path |
| `packages/shell/src/pages/shell/SearchBar.tsx` | `import` source |
| `plugins/built-in/preferences/package.json` | dependency reference |
| `plugins/built-in/preferences/src/renderer/main.tsx` | `import` source |
| `plugins/built-in/preferences/src/renderer/style.css` | `@import` path |

### `@szybko/plugin-sdk` → `@szybko/sdk`
| File | Change |
|---|---|
| `packages/plugin-sdk/package.json` → `packages/sdk/package.json` | `name` field |

### `@szybko/shell` (removed, absorbed into desktop renderer)
| File | Change |
|---|---|
| `apps/desktop/package.json` | remove dependency |
| `apps/desktop/src/renderer/main.tsx` | local import instead of `@szybko/shell` |
| `apps/desktop/src/renderer/floating.tsx` | local import instead of `@szybko/shell` |
| `tsconfig.json` (root) | remove project reference |
| `.claude/settings.json` | remove obsolete Bash allow entry |
| `pnpm-lock.yaml` | auto-updated via `pnpm install` |
| Delete `packages/shell/` | entire directory |

---

### Task 1: Rename `packages/core-rust` → `packages/native`

**Files:**
- Rename: `packages/core-rust/` → `packages/native/`
- Modify: `packages/native/package.json`
- Modify: `packages/host/package.json`

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: `@szybko/native` package at `packages/native/` — host depends on it

- [ ] **Step 1: Rename the directory and update package name**

```bash
# Rename directory (git mv to preserve history)
git mv packages/core-rust packages/native
```

- [ ] **Step 2: Update the package's own name field**

Edit `packages/native/package.json` — change line 2:
```json
"name": "@szybko/native",
```

- [ ] **Step 3: Update host's dependency reference**

Edit `packages/host/package.json` — change line 18:
```json
"@szybko/native": "workspace:*",
```

- [ ] **Step 4: Run typecheck to verify no broken references**

```bash
pnpm install
pnpm --filter @szybko/native typecheck
pnpm --filter @szybko/host typecheck
```
Expected: Both pass without errors.

- [ ] **Step 5: Commit**

```bash
git add packages/native packages/core-rust packages/host/package.json
git commit -m "refactor: rename packages/core-rust to packages/native, update @szybko/core-rust to @szybko/native

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Rename `packages/design-system` → `packages/ui-kit`

**Files:**
- Rename: `packages/design-system/` → `packages/ui-kit/`
- Modify: `packages/ui-kit/package.json`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src/renderer/main.css`
- Modify: `packages/shell/package.json`
- Modify: `packages/shell/src/mount.tsx`
- Modify: `packages/shell/src/style.css`
- Modify: `packages/shell/src/pages/shell/SearchBar.tsx`
- Modify: `plugins/built-in/preferences/package.json`
- Modify: `plugins/built-in/preferences/src/renderer/main.tsx`
- Modify: `plugins/built-in/preferences/src/renderer/style.css`

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: `@szybko/ui-kit` package at `packages/ui-kit/` — desktop, shell, and preferences plugin depend on it

- [ ] **Step 1: Rename the directory**

```bash
git mv packages/design-system packages/ui-kit
```

- [ ] **Step 2: Update package name in its own package.json**

Edit `packages/ui-kit/package.json` — change line 2:
```json
"name": "@szybko/ui-kit",
```

- [ ] **Step 3: Update all import references across the codebase**

Apply each of these replacements:

Edit `apps/desktop/package.json` — change line 14:
```json
"@szybko/ui-kit": "workspace:*",
```

Edit `apps/desktop/src/renderer/main.css` — change line 2:
```css
@import '@szybko/ui-kit/index.css';
```

Edit `packages/shell/package.json` — change line 22:
```json
"@szybko/ui-kit": "workspace:*",
```

Edit `packages/shell/src/mount.tsx` — change line 1:
```typescript
import { initTheme } from '@szybko/ui-kit';
```

Edit `packages/shell/src/style.css` — change line 2:
```css
@import '@szybko/ui-kit/index.css';
```

Edit `packages/shell/src/pages/shell/SearchBar.tsx` — change line 1:
```typescript
import { Input } from '@szybko/ui-kit';
```

Edit `plugins/built-in/preferences/package.json` — change line 11:
```json
"@szybko/ui-kit": "workspace:*",
```

Edit `plugins/built-in/preferences/src/renderer/main.tsx` — change line 1:
```typescript
import { initTheme } from '@szybko/ui-kit';
```

Edit `plugins/built-in/preferences/src/renderer/style.css` — change line 2:
```css
@import '@szybko/ui-kit/index.css';
```

- [ ] **Step 4: Verify no remaining references to `@szybko/design-system`**

```bash
grep -rn '@szybko/design-system' --include='*.ts' --include='*.tsx' --include='*.json' --include='*.css' --include='*.html' packages/ apps/ plugins/ --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=out
```
Expected: No output (zero matches).

- [ ] **Step 5: Run typecheck across affected packages**

```bash
pnpm install
pnpm --filter @szybko/ui-kit typecheck
pnpm --filter @szybko/shell typecheck
pnpm --filter @szybko/desktop typecheck
```
Expected: All pass without errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit packages/design-system apps/desktop/src/renderer/main.css packages/shell/ plugins/built-in/preferences/
git commit -m "refactor: rename packages/design-system to packages/ui-kit, update @szybko/design-system to @szybko/ui-kit

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Rename `packages/plugin-sdk` → `packages/sdk`

**Files:**
- Rename: `packages/plugin-sdk/` → `packages/sdk/`
- Modify: `packages/sdk/package.json`

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: `@szybko/sdk` package at `packages/sdk/`

- [ ] **Step 1: Rename the directory**

```bash
git mv packages/plugin-sdk packages/sdk
```

- [ ] **Step 2: Update package name**

Edit `packages/sdk/package.json` — change line 2:
```json
"name": "@szybko/sdk",
```

- [ ] **Step 3: Verify no remaining references to `@szybko/plugin-sdk`**

```bash
grep -rn '@szybko/plugin-sdk' --include='*.ts' --include='*.tsx' --include='*.json' --include='*.css' packages/ apps/ plugins/ --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=out
```
Expected: No output (zero matches).

- [ ] **Step 4: Run typecheck**

```bash
pnpm install
pnpm --filter @szybko/sdk typecheck
```
Expected: Pass without errors.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk packages/plugin-sdk
git commit -m "refactor: rename packages/plugin-sdk to packages/sdk, update @szybko/plugin-sdk to @szybko/sdk

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Move `packages/shell/src` into `apps/desktop/src/renderer`

**Files:**
- Create (via move): `apps/desktop/src/renderer/mount.tsx`
- Create (via move): `apps/desktop/src/renderer/global.d.ts`
- Create (via move): `apps/desktop/src/renderer/types/index.ts`
- Create (via move): `apps/desktop/src/renderer/stores/app-store.ts`
- Create (via move): `apps/desktop/src/renderer/stores/runtime-store.ts`
- Create (via move): `apps/desktop/src/renderer/components/SurfaceFrame.tsx`
- Create (via move): `apps/desktop/src/renderer/components/plugin/PluginScene.tsx`
- Create (via move): `apps/desktop/src/renderer/components/plugin/PluginView.tsx`
- Create (via move): `apps/desktop/src/renderer/components/plugin/PluginHeader.tsx`
- Create (via move): `apps/desktop/src/renderer/hooks/usePluginRuntime.ts`
- Create (via move): `apps/desktop/src/renderer/hooks/useSearch.ts`
- Create (via move): `apps/desktop/src/renderer/services/plugin-runtime.ts`
- Create (via move): `apps/desktop/src/renderer/pages/shell/Shell.tsx`
- Create (via move): `apps/desktop/src/renderer/pages/shell/SectionList.tsx`
- Create (via move): `apps/desktop/src/renderer/pages/shell/ResultIcon.tsx`
- Create (via move): `apps/desktop/src/renderer/pages/shell/SortableGridTile.tsx`
- Create (via move): `apps/desktop/src/renderer/pages/shell/Grid.tsx`
- Create (via move): `apps/desktop/src/renderer/pages/shell/SearchBar.tsx`
- Create (via move): `apps/desktop/src/renderer/pages/shell/GridTile.tsx`
- Create (via move): `apps/desktop/src/renderer/pages/shell/SectionHeader.tsx`
- Create (via move): `apps/desktop/src/renderer/pages/shell/HighlightedText.tsx`
- Create (via move): `apps/desktop/src/renderer/pages/shell/hooks/useWindowHeight.ts`
- Create (via move): `apps/desktop/src/renderer/pages/shell/hooks/navigation.ts`
- Create (via move): `apps/desktop/src/renderer/pages/shell/hooks/useKeyboard.ts`
- Create (via move): `apps/desktop/src/renderer/pages/floating/FloatingApp.tsx`
- Modify: `apps/desktop/src/renderer/main.tsx`
- Modify: `apps/desktop/src/renderer/floating.tsx`

**Interfaces:**
- Consumes: Task 2 — shell files already use `@szybko/ui-kit` references
- Produces: renderer directory with all app source local, ready for shell package deletion

- [ ] **Step 1: Copy shell's source files into desktop's renderer directory**

```bash
# Create directory structure
mkdir -p apps/desktop/src/renderer/{types,stores,components/plugin,hooks,services,pages/shell/hooks,pages/floating}

# Copy files (preserving git history via cp + git add, not mv, to keep shell/ intact for now)
cp packages/shell/src/mount.tsx apps/desktop/src/renderer/mount.tsx
cp packages/shell/src/global.d.ts apps/desktop/src/renderer/global.d.ts
cp packages/shell/src/types/index.ts apps/desktop/src/renderer/types/index.ts
cp packages/shell/src/stores/app-store.ts apps/desktop/src/renderer/stores/app-store.ts
cp packages/shell/src/stores/runtime-store.ts apps/desktop/src/renderer/stores/runtime-store.ts
cp packages/shell/src/components/SurfaceFrame.tsx apps/desktop/src/renderer/components/SurfaceFrame.tsx
cp packages/shell/src/components/plugin/PluginScene.tsx apps/desktop/src/renderer/components/plugin/PluginScene.tsx
cp packages/shell/src/components/plugin/PluginView.tsx apps/desktop/src/renderer/components/plugin/PluginView.tsx
cp packages/shell/src/components/plugin/PluginHeader.tsx apps/desktop/src/renderer/components/plugin/PluginHeader.tsx
cp packages/shell/src/hooks/usePluginRuntime.ts apps/desktop/src/renderer/hooks/usePluginRuntime.ts
cp packages/shell/src/hooks/useSearch.ts apps/desktop/src/renderer/hooks/useSearch.ts
cp packages/shell/src/services/plugin-runtime.ts apps/desktop/src/renderer/services/plugin-runtime.ts
cp packages/shell/src/pages/shell/Shell.tsx apps/desktop/src/renderer/pages/shell/Shell.tsx
cp packages/shell/src/pages/shell/SectionList.tsx apps/desktop/src/renderer/pages/shell/SectionList.tsx
cp packages/shell/src/pages/shell/ResultIcon.tsx apps/desktop/src/renderer/pages/shell/ResultIcon.tsx
cp packages/shell/src/pages/shell/SortableGridTile.tsx apps/desktop/src/renderer/pages/shell/SortableGridTile.tsx
cp packages/shell/src/pages/shell/Grid.tsx apps/desktop/src/renderer/pages/shell/Grid.tsx
cp packages/shell/src/pages/shell/SearchBar.tsx apps/desktop/src/renderer/pages/shell/SearchBar.tsx
cp packages/shell/src/pages/shell/GridTile.tsx apps/desktop/src/renderer/pages/shell/GridTile.tsx
cp packages/shell/src/pages/shell/SectionHeader.tsx apps/desktop/src/renderer/pages/shell/SectionHeader.tsx
cp packages/shell/src/pages/shell/HighlightedText.tsx apps/desktop/src/renderer/pages/shell/HighlightedText.tsx
cp packages/shell/src/pages/shell/hooks/useWindowHeight.ts apps/desktop/src/renderer/pages/shell/hooks/useWindowHeight.ts
cp packages/shell/src/pages/shell/hooks/navigation.ts apps/desktop/src/renderer/pages/shell/hooks/navigation.ts
cp packages/shell/src/pages/shell/hooks/useKeyboard.ts apps/desktop/src/renderer/pages/shell/hooks/useKeyboard.ts
cp packages/shell/src/pages/floating/FloatingApp.tsx apps/desktop/src/renderer/pages/floating/FloatingApp.tsx

git add apps/desktop/src/renderer/
```

- [ ] **Step 2: Update renderer entry points to use local imports**

Edit `apps/desktop/src/renderer/main.tsx` — replace line 1:
```typescript
import { mountMain } from './mount';
```

Edit `apps/desktop/src/renderer/floating.tsx` — replace line 1:
```typescript
import { mountFloating } from './mount';
```

- [ ] **Step 3: Remove `@szybko/shell` dependency from desktop's package.json**

Edit `apps/desktop/src/renderer/main.css` — ensure it already handles the CSS needs (it's already identical to what shell's style.css provides, and both reference `@szybko/ui-kit/index.css` after Task 2). The shell's `style.css` is NOT copied over; the desktop's `main.css` already covers it.

Verify the final content of `apps/desktop/src/renderer/main.css` should be:
```css
@import 'tailwindcss';
@import '@szybko/ui-kit/index.css';

@source '../../../../packages';
```
(It should already be this after Task 2's edits.)

- [ ] **Step 4: Add needed dependencies from shell to desktop's package.json**

Shell's `package.json` currently depends on:
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- `@szybko/ui-kit` (already in desktop after Task 2)
- `lucide-react`
- `zustand`

Check `apps/desktop/package.json` — the desktop must have these since renderer now uses them.

Edit `apps/desktop/package.json` — add to `dependencies`:
```json
"@dnd-kit/core": "^6.3.0",
"@dnd-kit/sortable": "^10.0.0",
"@dnd-kit/utilities": "^3.2.2",
"lucide-react": "^0.468.0",
"zustand": "^5.0",
```

Also add to `devDependencies` if not present:
```json
"@types/react": "^19.0",
"@types/react-dom": "^19.0",
```

- [ ] **Step 5: Run typecheck on desktop to verify imports work**

```bash
pnpm install
pnpm --filter @szybko/desktop typecheck
```
Expected: Pass without errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/ apps/desktop/package.json
git commit -m "refactor: move packages/shell/src into apps/desktop/src/renderer, update entry points

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Delete `packages/shell` package and clean up references

**Files:**
- Delete: `packages/shell/` (entire directory)
- Modify: `tsconfig.json` (root) — remove references
- Modify: `apps/desktop/package.json` — remove `@szybko/shell` dependency (already done in Task 4, verify)

**Interfaces:**
- Consumes: Task 4 — all shell code already lives in desktop's renderer
- Produces: clean repo without shell package

- [ ] **Step 1: Delete the shell directory**

```bash
git rm -r packages/shell
```

- [ ] **Step 2: Remove shell from root tsconfig references**

Edit `tsconfig.json` — remove line 5:
```json
{ "path": "./packages/shell" },
```
The resulting `references` array should be:
```json
"references": [
    { "path": "./packages/shared" },
    { "path": "./packages/host" },
    { "path": "./packages/ui-kit" },
    { "path": "./packages/sdk" },
    { "path": "./packages/native" },
    { "path": "./apps/desktop" },
    { "path": "./apps/desktop/tsconfig.web.json" },
    { "path": "./apps/desktop/tsconfig.node.json" }
],
```

- [ ] **Step 3: Remove `@szybko/shell` from desktop's package.json (if not already done in Task 4)**

Edit `apps/desktop/package.json` — remove line 17:
```json
"@szybko/shell": "workspace:*",
```

Also update `apps/desktop/package.json` to rename the remaining `@szybko/design-system` dependency to `@szybko/ui-kit` (if not already done in Task 2):
Verify line 14 is already `"@szybko/ui-kit": "workspace:*"` from Task 2.

- [ ] **Step 4: Update `.claude/settings.json` to remove obsolete shell path entry**

Edit `.claude/settings.json` — find and remove the line:
```
"Bash(packages/shell/src/vite-env.d.ts)",
```
(If the line exists.)

- [ ] **Step 5: Verify no remaining references to `@szybko/shell` or `packages/shell`**

```bash
grep -rn '@szybko/shell' --include='*.ts' --include='*.tsx' --include='*.json' --include='*.css' --include='*.yaml' . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=out --exclude-dir=target
grep -rn 'packages/shell' tsconfig.json
```
Expected: No output from either command.

- [ ] **Step 6: Run full typecheck**

```bash
pnpm install
pnpm typecheck
```
Expected: All packages pass.

- [ ] **Step 7: Commit**

```bash
git add packages/shell tsconfig.json apps/desktop/package.json .claude/settings.json
git commit -m "refactor: delete packages/shell, remove @szybko/shell references and tsconfig entry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Update `apps/desktop/tsconfig.web.json` and verify build

**Files:**
- Modify: `apps/desktop/tsconfig.web.json`

**Interfaces:**
- Consumes: all previous tasks
- Produces: working build configuration for the migrated repo

- [ ] **Step 1: Ensure tsconfig.web.json covers all renderer source**

Read `apps/desktop/tsconfig.web.json` — verify its `include` covers all subdirectories:
```json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "jsx": "react-jsx",
        "rootDir": "./src/renderer",
        "types": ["vite/client"],
        "outDir": "./out/renderer"
    },
    "include": [
        "src/renderer"
    ]
}
```
The `src/renderer` glob already picks up all subdirectories recursively (components/, hooks/, pages/, services/, stores/, types/), so no change needed.

- [ ] **Step 2: Build the desktop app to verify everything compiles**

```bash
pnpm install  # ensure lockfile is up to date
pnpm --filter @szybko/desktop build
```
Expected: Build succeeds with no errors.

- [ ] **Step 3: Lint check**

```bash
pnpm lint
```
Expected: Pass without errors (no new lint issues introduced by the migration).

- [ ] **Step 4: Commit root config and lockfile changes**

```bash
git add pnpm-lock.yaml apps/desktop/tsconfig.web.json
git commit -m "chore: update lockfile and verify build after workspace migration

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
