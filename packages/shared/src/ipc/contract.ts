import type { ActionDescriptor, PluginSearchContext, SearchBatch, SearchRequest } from '../search/types.js';
import { IPC } from './channels.js';

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
    [IPC.PLUGIN_CLOSE]: {
        request: { runtimeId: string };
        response: { ok: boolean };
    };
}

export interface IpcMainToRendererEventContract {
    [IPC.SEARCH_BATCH]: SearchBatch;
    [IPC.WINDOW_SHOW]: void;
    [IPC.THEME_CHANGED]: { isDark: boolean };
    [IPC.PLUGIN_RUNTIME_STATE]: unknown;
    [IPC.PLUGIN_SEARCH]: PluginSearchContext;
    [IPC.PLUGIN_ENTER]: unknown;
}

export interface IpcRendererToMainEventContract {
    [IPC.PLUGIN_SEARCH_RESULT]: SearchBatch;
}
