import type { EntryIntent } from '../input/types';
import type { PluginFeature } from '../plugin/types';
import type {
    ActionDescriptor,
    LauncherItemId,
    SearchBatch,
    SearchRequest,
    SearchResponse,
} from '../search/types';
import type { IPC } from './channels';

// ── Invoke 合约（renderer → main） ─────────────────────────────

export interface IpcInvokeContract {
    // ── 搜索（新） ──
    [IPC.SEARCH_QUERY]: {
        request: SearchRequest;
        response: { ok: boolean; sessionId?: string };
    };
    [IPC.SEARCH_CANCEL]: {
        request: string;
        response: { ok: boolean };
    };
    [IPC.ITEM_PIN]: {
        request: { itemId: LauncherItemId; pin: boolean };
        response: { ok: boolean };
    };
    [IPC.ITEM_REORDER]: {
        request: { itemId: LauncherItemId; toIndex: number };
        response: { ok: boolean };
    };
    [IPC.ITEM_CONTEXT_MENU]: {
        request: { itemId: LauncherItemId; screenX: number; screenY: number };
        response: { ok: boolean };
    };
    [IPC.ITEM_EXECUTE]: {
        request: { sessionId: string; queryId: string; itemId: LauncherItemId };
        response: { ok: boolean; error?: string };
    };

    // ── 窗口 ──
    [IPC.WINDOW_RESIZE]: {
        request: { height: number };
        response: { ok: boolean };
    };
    [IPC.WINDOW_HIDE]: {
        request: void;
        response: { ok: boolean };
    };
    [IPC.THEME_GET]: {
        request: void;
        response: { isDark: boolean };
    };

    // ── 插件运行时 ──
    [IPC.PLUGIN_EXEC]: {
        request: { action: ActionDescriptor };
        response: { ok: boolean; result?: unknown; error?: string };
    };
    [IPC.HOST_SWITCH]: {
        request: { runtimeId: string; targetHost: 'launcher' | 'floating' };
        response: { ok: boolean; hostId?: string; error?: string };
    };
    [IPC.PLUGIN_HIDE]: {
        request: { runtimeId: string };
        response: { ok: boolean };
    };
    [IPC.PLUGIN_DESTROY]: {
        request: { runtimeId: string };
        response: { ok: boolean };
    };
    [IPC.SHOW_PLUGIN_MENU]: {
        request: { runtimeId: string; variant?: 'launcher' | 'floating' };
        response: { ok: boolean };
    };
    [IPC.PLUGIN_PIN]: {
        request: { runtimeId: string; pin: boolean };
        response: { ok: boolean };
    };
    [IPC.FEATURE_SET]: {
        request: { feature: PluginFeature };
        response: { ok: boolean; error?: string };
    };
    [IPC.FEATURE_GET]: {
        request: { codes?: string[] };
        response: { ok: boolean; features: PluginFeature[]; error?: string };
    };
    [IPC.FEATURE_REMOVE]: {
        request: { code: string };
        response: { ok: boolean; error?: string };
    };
}

// ── Payload 类型 ──────────────────────────────────────────────

export interface RuntimeStatePayload {
    runtimeId: string;
    pluginId: string;
    state: string;
    mountState?: 'attached' | 'detached';
    loadState?: 'loading' | 'loaded' | 'error';
    featureExplain?: string;
    cmdLabel?: string;
}

export interface PluginEnterPayload {
    pluginId: string;
    featureExplain?: string;
    code: string;
    type: 'text' | 'regex' | 'over' | 'file' | 'img' | 'window';
    payload: unknown;
    option?: string;
    from: EntryIntent;
    matchId?: string;
}

export interface PluginOutPayload {
    runtimeId: string;
    pluginId: string;
    reason: 'hide' | 'destroy';
}

export interface MoveToHostRequest {
    runtimeId: string;
    targetHost: 'launcher' | 'floating';
}

export interface MoveToHostResponse {
    ok: boolean;
    hostId?: string;
    error?: string;
}

// ── Main → Renderer 事件合约 ─────────────────────────────────

export interface IpcMainToRendererEventContract {
    [IPC.SEARCH_RESPONSE]: SearchResponse;
    [IPC.WINDOW_SHOW]: void;
    [IPC.THEME_CHANGED]: { isDark: boolean };
    [IPC.PLUGIN_RUNTIME_STATE]: RuntimeStatePayload;
    [IPC.PLUGIN_ENTER]: PluginEnterPayload;
    [IPC.PLUGIN_OUT]: PluginOutPayload;

    // ── 旧（废弃） ──
    /** @deprecated 使用 SEARCH_RESPONSE */
    [IPC.SEARCH_BATCH]: SearchBatch;
}

export interface IpcRendererToMainEventContract {
}
