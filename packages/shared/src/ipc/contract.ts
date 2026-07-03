import type { EntryIntent } from '../input/types';
import type { PluginFeature } from '../plugin/types';
import type { ActionDescriptor, SearchBatch, SearchRequest } from '../search/types';
import type { IPC } from './channels';

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

export interface RuntimeStatePayload {
    runtimeId: string;
    pluginId: string;
    state: string;
    mountState?: 'attached' | 'detached';
    loadState?: 'loading' | 'loaded' | 'error';
    pluginName?: string;
    featureExplain?: string;
}

export interface PluginEnterPayload {
    pluginId: string;
    featureExplain?: string;
    /** The feature code for the plugin's enter dispatch */
    code: string;
    /** Matcher trigger type (text/regex/over/files/img/window) */
    type: 'text' | 'regex' | 'over' | 'file' | 'img' | 'window';
    /** The matched input data that triggered this plugin entry */
    payload: unknown;
    /** User-selected entry option (for mainPush features offering multiple actions) */
    option?: string;
    /** Entry intent (main/panel/hotkey/redirect) */
    from: EntryIntent;
    /** MatchSession ID for the originating context, if available */
    matchId?: string;
}

export interface PluginOutPayload {
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

export interface IpcMainToRendererEventContract {
    [IPC.SEARCH_BATCH]: SearchBatch;
    [IPC.WINDOW_SHOW]: void;
    [IPC.THEME_CHANGED]: { isDark: boolean };
    [IPC.PLUGIN_RUNTIME_STATE]: RuntimeStatePayload;
    [IPC.PLUGIN_ENTER]: PluginEnterPayload;
    [IPC.PLUGIN_OUT]: PluginOutPayload;
}

export interface IpcRendererToMainEventContract {
}
