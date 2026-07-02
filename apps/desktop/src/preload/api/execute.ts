import type { SzybkoPluginApi } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { invoke } from './ipc.js';

/**
 * 公共 API：执行操作和切换插件宿主。
 */
export function createExecuteApi(): Pick<SzybkoPluginApi, 'execute' | 'switchHost'> {
    return {
        execute: invoke(IPC.PLUGIN_EXEC),
        switchHost: async (pluginId, targetHost) => invoke(IPC.HOST_SWITCH)({ pluginId, targetHost }),
    };
}
