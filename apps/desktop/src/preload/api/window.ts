import type { SzybkoInternalApi } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { invoke, on } from './ipc.js';

/**
 * 窗口控制 API。
 */
export function createWindowApi(): Pick<SzybkoInternalApi, 'resizeWindow' | 'hideWindow' | 'onShowMainWindow'> {
    return {
        resizeWindow: invoke(IPC.WINDOW_RESIZE),
        hideWindow: invoke(IPC.WINDOW_HIDE),
        onShowMainWindow: on(IPC.WINDOW_SHOW),
    };
}
