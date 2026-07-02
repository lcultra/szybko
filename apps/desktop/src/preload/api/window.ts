import type { SzybkoInternalApi } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { invoke, on } from './ipc.js';

/**
 * 窗口控制 API。
 */
export function createWindowApi(): Pick<SzybkoInternalApi, 'resizeWindow' | 'hideWindow' | 'detachPlugin' | 'onShowMainWindow'> {
    return {
        resizeWindow: height => invoke(IPC.WINDOW_RESIZE)({ height }),
        hideWindow: () => invoke(IPC.WINDOW_HIDE)(undefined),
        detachPlugin: runtimeId => invoke(IPC.PLUGIN_CLOSE)({ runtimeId }),
        onShowMainWindow: on(IPC.WINDOW_SHOW),
    };
}
