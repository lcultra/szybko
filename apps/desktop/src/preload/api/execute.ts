import type { ActionDescriptor } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { invoke } from './ipc';

/** 插件侧 execute（仍传 ActionDescriptor） */
export function createPluginExecuteApi() {
    return {
        execute: (action: ActionDescriptor) => invoke(IPC.PLUGIN_EXEC)({ action }),
        switchHost: (runtimeId: string, targetHost: 'launcher' | 'floating') =>
            invoke(IPC.HOST_SWITCH)({ runtimeId, targetHost }),
    };
}
