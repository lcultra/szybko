import type { ActionDescriptor } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { invoke } from './ipc';

/**
 * 旧 Action 执行 API，供 Shell.tsx 在 Phase 2 重写前过渡使用。
 * Phase 2 后只走 ITEM_EXECUTE（sessionId + itemId）。
 */
export function createExecuteApi() {
    return {
        /** @deprecated 使用 item.execute({ sessionId, queryId, itemId }) */
        executeAction: (action: ActionDescriptor) => invoke(IPC.PLUGIN_EXEC)({ action }),
    };
}

/** 插件侧 execute（仍传 ActionDescriptor） */
export function createPluginExecuteApi() {
    return {
        execute: (action: ActionDescriptor) => invoke(IPC.PLUGIN_EXEC)({ action }),
        switchHost: (runtimeId: string, targetHost: 'launcher' | 'floating') =>
            invoke(IPC.HOST_SWITCH)({ runtimeId, targetHost }),
    };
}
