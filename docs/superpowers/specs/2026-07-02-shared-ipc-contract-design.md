# Shared IPC Contract Design

## Goal

Restructure `@szybko/shared` so it has clear internal modules, while keeping all external imports on the root package. Add a typed IPC contract that becomes the single source of truth for payloads exchanged between renderer/preload/main/plugin runtimes.

## Current Problem

`packages/shared/src` is currently flat and mixes several concerns:

- page-facing API facade types
- IPC channel constants
- search domain models
- plugin manifest models
- runtime/host models
- cross-layer constants

The type flow also has duplicated sources of truth. `SzybkoInternalApi` and `SzybkoPluginApi` describe the page-facing APIs, `apps/desktop/src/preload/api/ipc.ts` has a local `IPC_API` channel-to-method map, and `packages/host/src/ipc-handlers.ts` manually repeats payload types in IPC handlers. These layers are necessary, but the payload types should not be independently maintained.

## Design Principles

- Keep preload as the security boundary. Renderer and plugin pages must not access `ipcRenderer` directly.
- Keep facade APIs separate from IPC contracts. Facade APIs are optimized for frontend/plugin ergonomics; IPC contracts are optimized for cross-process stability.
- Keep public package imports stable. Existing callers continue to import from `@szybko/shared`.
- Avoid runtime schema validation in this phase. The MVP needs type consolidation first; runtime validation can be added later when third-party plugin trust boundaries are stricter.
- Do not change IPC channel strings or frontend API shapes.

## Shared Package Structure

Target internal structure:

```text
packages/shared/src/
├── index.ts
├── api/
│   ├── index.ts
│   ├── internal.ts
│   └── plugin.ts
├── ipc/
│   ├── index.ts
│   ├── channels.ts
│   └── contract.ts
├── search/
│   ├── index.ts
│   └── types.ts
├── plugin/
│   ├── index.ts
│   └── types.ts
├── runtime/
│   ├── index.ts
│   └── types.ts
└── constants/
    ├── index.ts
    ├── window.ts
    ├── search.ts
    └── plugin.ts
```

`packages/shared/src/index.ts` re-exports every public type and value. The package does not expose subpath exports in this phase.

External imports remain:

```ts
import { IPC, type SzybkoInternalApi, type SearchResult } from '@szybko/shared';
```

## Module Responsibilities

`api/` contains only page-facing facade types:

- `SzybkoInternalApi`
- `SzybkoPluginApi`

`ipc/` contains cross-process protocol definitions:

- `IPC`
- `IpcInvokeContract`
- `IpcMainToRendererEventContract`
- `IpcRendererToMainEventContract`

`search/` contains search domain models:

- `SearchRequest`
- `SearchBatch`
- `PluginSearchContext`
- `SearchResult`
- `ActionDescriptor`

`plugin/` contains plugin manifest and feature models.

`runtime/` contains runtime and host models:

- `Host`
- `PluginRuntime`
- `RuntimeState`
- `PluginManager`

`constants/` contains constants split by owning domain.

## IPC Contract

Add `packages/shared/src/ipc/contract.ts`.

Invoke channels:

```ts
export interface IpcInvokeContract {
    [IPC.SEARCH_QUERY]: {
        request: SearchRequest;
        response: { ok: boolean };
    };
    [IPC.SEARCH_CANCEL]: {
        request: string;
        response: { ok: boolean };
    };
    [IPC.WINDOW_RESIZE]: {
        request: { height: number };
        response: { ok: boolean };
    };
    [IPC.WINDOW_HIDE]: {
        request: void;
        response: { ok: boolean };
    };
    [IPC.PLUGIN_EXEC]: {
        request: { action: ActionDescriptor };
        response: { ok: boolean; result?: unknown; error?: string };
    };
    [IPC.HOST_SWITCH]: {
        request: { pluginId: string; targetHost: 'launcher' | 'floating' };
        response: { ok: boolean; hostId?: string; error?: string };
    };
}
```

Main-to-renderer event channels:

```ts
export interface IpcMainToRendererEventContract {
    [IPC.SEARCH_BATCH]: SearchBatch;
    [IPC.WINDOW_SHOW]: void;
    [IPC.THEME_CHANGED]: { isDark: boolean };
    [IPC.PLUGIN_RUNTIME_STATE]: unknown;
    [IPC.PLUGIN_SEARCH]: PluginSearchContext;
    [IPC.PLUGIN_ENTER]: unknown;
}
```

Renderer-to-main event channels:

```ts
export interface IpcRendererToMainEventContract {
    [IPC.PLUGIN_SEARCH_RESULT]: SearchBatch;
}
```

The event contracts are direction-specific so `webContents.send` and `ipcRenderer.send` cannot accidentally share the wrong payload type.

## Preload Design

`apps/desktop/src/preload/api/ipc.ts` should derive its helpers from the IPC contract, not from `SzybkoInternalApi & SzybkoPluginApi`.

Target helper shape:

```ts
export function invoke<C extends keyof IpcInvokeContract>(
    channel: C,
): (payload: IpcInvokeContract[C]['request']) => Promise<IpcInvokeContract[C]['response']>;

export function on<C extends keyof IpcMainToRendererEventContract>(
    channel: C,
): (cb: (data: IpcMainToRendererEventContract[C]) => void) => () => void;

export function send<C extends keyof IpcRendererToMainEventContract>(
    channel: C,
): (payload: IpcRendererToMainEventContract[C]) => void;
```

`host.ts` and `plugin.ts` continue to use `satisfies SzybkoInternalApi` and `satisfies SzybkoPluginApi` on the exposed objects. This keeps both checks:

- the facade exposes the expected page API
- the IPC payloads match the shared cross-process contract

`plugin-lifecycle.ts` should send `IPC.PLUGIN_SEARCH_RESULT` through the typed `send()` helper rather than calling `ipcRenderer.send` directly.

## Main Process Design

`packages/host/src/ipc-handlers.ts` should use local helper types derived from the shared IPC contract:

```ts
type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];
type RendererEvent<C extends keyof IpcRendererToMainEventContract> = IpcRendererToMainEventContract[C];
```

Handlers should no longer repeat payload types inline. For example:

```ts
ipcMain.handle(
    IPC.SEARCH_QUERY,
    (_event, req: IpcRequest<typeof IPC.SEARCH_QUERY>): IpcResponse<typeof IPC.SEARCH_QUERY> => {
        // existing behavior
    },
);
```

`RuntimeManager.sendPluginSearch()` should accept `SearchRequest` and send a `PluginSearchContext` payload.

## Data Flow

Launcher search:

```text
launcher useSearch
  -> window.szybkoInternal.search(SearchRequest)
  -> preload invoke(IPC.SEARCH_QUERY, SearchRequest)
  -> main handler receives IpcInvokeContract[SEARCH_QUERY].request
  -> main sends SearchBatch via IPC.SEARCH_BATCH
  -> preload on(IPC.SEARCH_BATCH)
  -> launcher callback receives SearchBatch
```

Plugin search:

```text
main RuntimeManager.sendPluginSearch(SearchRequest)
  -> plugin WebContents receives PluginSearchContext via IPC.PLUGIN_SEARCH
  -> plugin preload onSearch callback returns SearchResult[]
  -> plugin preload sends SearchBatch via IPC.PLUGIN_SEARCH_RESULT
  -> main receives IpcRendererToMainEventContract[PLUGIN_SEARCH_RESULT]
  -> main forwards SearchBatch to launcher via IPC.SEARCH_BATCH
```

Action execution:

```text
launcher/plugin calls window.szybko.execute(ActionDescriptor)
  -> preload sends { action } via IPC.PLUGIN_EXEC
  -> main receives typed request
  -> main returns typed response
```

## Error Handling

This phase does not add runtime payload validation. Handlers keep their current behavior and return typed result objects where the existing API already expects them.

For `HOST_SWITCH`, keep a response that can represent both success and failure:

```ts
{ ok: boolean; hostId?: string; error?: string }
```

Future runtime validation should be added at the IPC boundary in preload/main, using the same contract shape as the source for schemas.

## Compatibility

No caller should need to change imports. This remains valid:

```ts
import { IPC, type SzybkoPluginApi } from '@szybko/shared';
```

No package subpath exports are added. `packages/shared/package.json` can keep its current public `exports` shape.

## Out of Scope

- Runtime schema validation with zod, valibot, or similar libraries.
- Generating facade APIs from the IPC contract.
- Changing IPC channel string values.
- Changing frontend/plugin API method names or argument shapes.
- Changing business behavior in search, window control, plugin runtime, or action execution.
- Opening `@szybko/shared/*` subpath exports.

## Verification

After implementation:

```bash
pnpm typecheck
pnpm --filter @szybko/desktop build
```

Success criteria:

- `packages/shared/src` is internally grouped by domain.
- External imports from `@szybko/shared` still work.
- Preload IPC helpers derive types from `IpcInvokeContract`, `IpcMainToRendererEventContract`, and `IpcRendererToMainEventContract`.
- Main IPC handlers no longer inline request payload types.
- `IPC.PLUGIN_SEARCH_RESULT` no longer uses `any[]`.
- `host.ts` and `plugin.ts` still validate exposed objects with `SzybkoInternalApi` and `SzybkoPluginApi`.
