import type { ActionDescriptor, PluginSearchContext, SearchBatch, SearchRequest } from '../search/types';
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
        request: { pluginId: string; targetHost: 'launcher' | 'floating' };
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
    featureCode: string;
    featureExplain?: string;
    keyword?: string;
    query?: string;
}

export interface PluginOutPayload {
    pluginId: string;
    reason: 'hide' | 'destroy';
}

export interface MoveToHostRequest {
    pluginId: string;
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
    [IPC.PLUGIN_SEARCH]: PluginSearchContext;
    [IPC.PLUGIN_ENTER]: PluginEnterPayload;
    [IPC.PLUGIN_OUT]: PluginOutPayload;
}

export interface IpcRendererToMainEventContract {
    [IPC.PLUGIN_SEARCH_RESULT]: SearchBatch;
}
