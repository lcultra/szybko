import type { SzybkoInternalApi } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { invoke, on } from './ipc.js';

/**
 * 窗口控制 API。
 */
export function createWindowApi(): Pick<SzybkoInternalApi, 'resizeWindow' | 'hideWindow' | 'hidePlugin' | 'destroyPlugin' | 'showPluginMenu' | 'onShowMainWindow'> {
    return {
        resizeWindow: height => invoke(IPC.WINDOW_RESIZE)({ height }),
        hideWindow: () => invoke(IPC.WINDOW_HIDE)(undefined),
        hidePlugin: runtimeId => invoke(IPC.PLUGIN_HIDE)({ runtimeId }),
        destroyPlugin: runtimeId => invoke(IPC.PLUGIN_DESTROY)({ runtimeId }),
        showPluginMenu: (runtimeId, pluginId) => invoke(IPC.SHOW_PLUGIN_MENU)({ runtimeId, pluginId }),
        onShowMainWindow: on(IPC.WINDOW_SHOW),
    };
}
